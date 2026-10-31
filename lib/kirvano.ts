import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { addBusinessDays, boundedInt, type AppEnv } from "./configuration";
import { ApiError, hash, readJSON } from "./security";
import { createHostedCheckout } from "./hosted-checkout";
import { audit, getOrder } from "./repository";
import type { OrderRow } from "./order-types";

// Official references and the unverified deployment prerequisites are recorded in docs/KIRVANO.md.
// Correlation uses the documented utm.src field. It is never used as authorization for photos.
export async function createKirvanoCheckout(env:AppEnv, order:OrderRow) {
  return createHostedCheckout(env,order,"kirvano");
}

const product=z.object({id:z.string().min(1).max(100),offer_id:z.string().min(1).max(100),price:z.string().max(40),is_order_bump:z.boolean()});
const schema=z.object({
  event:z.string().min(1).max(60),status:z.string().min(1).max(40),sale_id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  checkout_id:z.string().min(1).max(100),total_price:z.string().max(40),type:z.literal("ONE_TIME"),created_at:z.string().max(40),
  customer:z.object({id:z.union([z.string().max(100),z.number()]).optional(),name:z.string().max(200).optional(),email:z.string().max(200).optional(),phone_number:z.string().max(32).optional()}).optional(),
  products:z.array(product).min(1).max(20),utm:z.object({src:z.string().regex(/^tda_[a-f0-9]{40}$/)}),
});
const events:Record<string,{status:string;rank:number;providerStatus:string}>={
  SALE_APPROVED:{status:"approved",rank:30,providerStatus:"APPROVED"},
  SALE_REFUNDED:{status:"refunded",rank:40,providerStatus:"REFUNDED"},
  SALE_CHARGEBACK:{status:"refunded",rank:50,providerStatus:"CHARGEBACK"},
  SALE_REFUSED:{status:"rejected",rank:10,providerStatus:"REFUSED"},
  PIX_GENERATED:{status:"pending",rank:0,providerStatus:"PENDING"},
  BANK_SLIP_GENERATED:{status:"pending",rank:0,providerStatus:"PENDING"},
  PIX_EXPIRED:{status:"cancelled",rank:15,providerStatus:"CANCELED"},
  BANK_SLIP_EXPIRED:{status:"cancelled",rank:15,providerStatus:"CANCELED"},
};
export function kirvanoCents(value:string) {
  const match=/^R\$\s*((?:\d{1,3}(?:\.\d{3})+)|\d+),(\d{2})$/.exec(value.trim());
  return match?Number(match[1].replace(/\./g,""))*100+Number(match[2]):null;
}
function validEventTime(value:string){
  if(!/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))return false;
  const parsed=new Date(value.replace(" ","T")+"Z");
  // Used only to validate the calendar. No undocumented timezone is assumed for financial timestamps.
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,19).replace("T"," ")===value;
}
async function authenticated(request:Request,env:AppEnv){
  const token=new URL(request.url).searchParams.get("token");
  if(!env.KIRVANO_WEBHOOK_TOKEN)throw new ApiError(503,"Integração não configurada.");
  if(!token||token.length>128)return false;
  const [a,b]=await Promise.all([hash(token),hash(env.KIRVANO_WEBHOOK_TOKEN)]);
  return timingSafeEqual(new TextEncoder().encode(a),new TextEncoder().encode(b));
}

export async function kirvanoWebhook(request:Request,env:AppEnv){
  if(!await authenticated(request,env))throw new ApiError(401,"Notificação não autenticada.");
  const body=await readJSON(request,65536);
  if(body.event==="TEST"){await audit(env,null,"kirvano_authenticated_test");return {received:true,test:true};}
  if(!env.KIRVANO_PRODUCT_ID||!env.KIRVANO_OFFER_ID)throw new ApiError(503,"Produto e oferta precisam ser configurados.");
  const parsed=schema.safeParse(body);
  if(!parsed.success)throw new ApiError(422,"Notificação sem os campos de correlação esperados.");
  const p=parsed.data,entry=events[p.event];
  if(!entry)return {received:true,ignored:true};
  if(entry.providerStatus!==p.status||!validEventTime(p.created_at))throw new ApiError(422,"Evento ou data incompatível.");
  const matching=p.products.find(item=>item.id===env.KIRVANO_PRODUCT_ID&&item.offer_id===env.KIRVANO_OFFER_ID&&!item.is_order_bump);
  if(!matching||kirvanoCents(matching.price)!==2790||kirvanoCents(p.total_price)!==2790)throw new ApiError(422,"Produto, oferta ou valor incompatível.");
  const fingerprint=[p.event,p.sale_id,p.checkout_id,p.utm.src,p.created_at,p.status,p.total_price,matching.id,matching.offer_id].join("|");
  const eventId=await hash("kirvano:"+fingerprint),receivedAt=new Date().toISOString();
  const found=await env.DB!.prepare("SELECT * FROM orders WHERE checkout_reference=? AND payment_provider='kirvano'").bind(p.utm.src).first<OrderRow>();
  await env.DB!.prepare("INSERT INTO payment_events (id,provider,event_type,transaction_id,order_id,event_time,received_at,outcome,body_hash) VALUES (?,'kirvano',?,?,?,?,?,'received',?) ON CONFLICT(id) DO NOTHING")
    .bind(eventId,p.event,p.sale_id,found?.id||null,p.created_at,receivedAt,await hash(JSON.stringify(body))).run();
  const receipt=await env.DB!.prepare("SELECT outcome FROM payment_events WHERE id=?").bind(eventId).first<{outcome:string}>();
  if(receipt?.outcome!=="received")return {received:true,duplicate:true};
  async function complete(outcome:string,orderId:string|null){
    await env.DB!.batch([
      env.DB!.prepare("INSERT INTO events (id,order_id,kind,detail,created_at) VALUES (?,?,?,NULL,?) ON CONFLICT(id) DO NOTHING").bind("kirvano-"+eventId,orderId,"kirvano_"+p.event.toLowerCase()+"_"+outcome,receivedAt),
      env.DB!.prepare("UPDATE payment_events SET outcome=?,processed_at=? WHERE id=? AND outcome='received'").bind(outcome,new Date().toISOString(),eventId),
    ]);
    return {received:true,outcome};
  }
  if(!found)return complete("unmatched",null);
  const taken=await env.DB!.prepare("SELECT id FROM orders WHERE payment_provider='kirvano' AND payment_id=? AND id<>?").bind(p.sale_id,found.id).first();
  if(taken){await complete("transaction_conflict",found.id);throw new ApiError(422,"Transação já vinculada.");}
  for(let attempt=0;attempt<3;attempt++){
    const o=await getOrder(env,found.id);
    if(o.payment_provider!=="kirvano"||o.checkout_reference!==p.utm.src)throw new ApiError(422,"Referência incompatível.");
    if(o.payment_id&&o.payment_id!==p.sale_id&&(o.paid_at||["approved","refunded"].includes(o.payment_status)))return complete("other_sale_review",o.id);
    if(o.payment_id&&o.payment_id!==p.sale_id&&entry.status!=="approved")return complete("other_attempt",o.id);
    if(o.payment_status==="refunded"&&entry.status!=="refunded")return complete("terminal_preserved",o.id);
    if(o.payment_status==="approved"&&!["approved","refunded"].includes(entry.status))return complete("approved_preserved",o.id);
    if(o.payment_status===entry.status&&o.payment_id===p.sale_id&&entry.rank<=o.kirvano_event_rank)return complete("duplicate_state",o.id);
    if(!["approved","refunded"].includes(entry.status)&&o.kirvano_event_time&&p.created_at<o.kirvano_event_time)return complete("older_event",o.id);
    if(!["approved","refunded"].includes(entry.status)&&o.kirvano_event_time===p.created_at&&entry.rank<o.kirvano_event_rank)return complete("older_event",o.id);
    const eventTime=o.kirvano_event_time&&o.kirvano_event_time>p.created_at?o.kirvano_event_time:p.created_at;
    const approved=entry.status==="approved",terminal=["refunded","cancelled"].includes(entry.status);
    const production=approved&&["awaiting_payment","cancelled"].includes(o.production_status)?"awaiting_production":terminal&&o.production_status!=="delivered"?"cancelled":o.production_status;
    const email=p.customer?.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.customer.email)?p.customer.email:null;
    const phone=p.customer?.phone_number?.replace(/\D/g,"");
    const result=await env.DB!.prepare(`UPDATE orders SET payment_id=?,payment_status=?,kirvano_checkout_id=?,kirvano_event_time=?,kirvano_event_rank=?,
      buyer_id=COALESCE(?,buyer_id),name=COALESCE(?,name),email=COALESCE(?,email),whatsapp=COALESCE(?,whatsapp),
      paid_at=CASE WHEN ? THEN COALESCE(paid_at,?) ELSE paid_at END,
      delivery_due_at=CASE WHEN ? THEN COALESCE(delivery_due_at,?) ELSE delivery_due_at END,
      photos_expires_at=CASE WHEN ? AND paid_at IS NULL AND photos_deleted_at IS NULL THEN ? ELSE photos_expires_at END,
      production_status=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?`)
      .bind(p.sale_id,entry.status,p.checkout_id,eventTime,entry.rank,p.customer?.id===undefined?null:String(p.customer.id),p.customer?.name?.trim()||null,email,phone&&/^\d{10,15}$/.test(phone)?phone:null,
        Number(approved),receivedAt,Number(approved),addBusinessDays(new Date(receivedAt),o.delivery_days),Number(approved),new Date(Date.now()+boundedInt(env.RETENTION_DAYS,30,1,90)*86400000).toISOString(),production,receivedAt,o.id,o.revision).run();
    if(result.meta.changes)return complete("applied",o.id);
  }
  throw new ApiError(503,"Notificação concorrente. Tente novamente.");
}
