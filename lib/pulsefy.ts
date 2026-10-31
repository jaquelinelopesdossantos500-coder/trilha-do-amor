import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PRICE_CENTS, addBusinessDays, boundedInt, type AppEnv } from "./configuration";
import { isPulsefyCheckout } from "./hosted-checkout";
import { ApiError, hash, readJSON } from "./security";
import { audit, getOrder } from "./repository";
import type { OrderRow } from "./order-types";

// Getfy's outbound webhook contract, used by Pulsefy. Pinned primary sources: docs/PULSEFY.md.
const identifier=z.union([z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const transactionReference=z.union([z.string().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/),z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const amount=z.number().finite().nonnegative().max(1000000);
const instant=z.string().datetime({offset:true});
const envelopeSchema=z.object({event:z.string().min(1).max(80),payload:z.record(z.unknown()),timestamp:instant});
const extraSchema=z.object({product_id:identifier,name:z.string().trim().min(1).max(200),amount,currency:z.literal("BRL")});
const payloadSchema=z.object({
  order:z.object({id:identifier,status:z.string().max(40),amount,currency:z.literal("BRL"),is_renewal:z.literal(false),created_at:instant}),
  checkout_link:z.string().url().max(2048),checkoutUrl:z.string().url().max(2048).optional(),
  product:z.object({id:identifier,name:z.string().trim().min(1).max(200),billing_type:z.literal("one_time")}),
  offer:z.object({id:identifier,price:amount,currency:z.literal("BRL")}).nullish(),
  subscription_plan:z.null().optional(),
  payment:z.object({method:z.string().min(1).max(40),gateway:z.string().max(100).nullish(),gateway_transaction_id:transactionReference.nullish()}),
  tracking:z.object({src:z.string().regex(/^tda_[a-f0-9]{40}$/)}),
  customer:z.object({name:z.string().max(200).optional(),email:z.string().max(200).optional(),phone:z.string().max(40).optional()}).optional(),
  order_bumps:z.array(extraSchema).max(20).optional(),amount:amount.optional(),status:z.string().max(40).optional(),
});

export function pulsefyCents(value:number) {
  const scaled=value*100, rounded=Math.round(scaled);
  return Number.isFinite(value)&&value>=0&&Number.isSafeInteger(rounded)&&Math.abs(scaled-rounded)<0.000001?rounded:null;
}

async function authenticate(request:Request,env:AppEnv) {
  const secret=env.PULSEFY_WEBHOOK_TOKEN;
  if(!secret||secret.length<32||secret.length>128)throw new ApiError(503,"Integração Pulsefy não configurada.");
  const authorization=request.headers.get("authorization")||"";
  const match=authorization.length<=256?/^Bearer ([A-Za-z0-9._~-]{32,128})$/i.exec(authorization):null;
  if(!match)throw new ApiError(401,"Notificação não autenticada.");
  const [expected,received]=await Promise.all([hash(secret),hash(match[1])]);
  if(!timingSafeEqual(new TextEncoder().encode(expected),new TextEncoder().encode(received)))throw new ApiError(401,"Notificação não autenticada.");
}

export async function pulsefyWebhook(request:Request,env:AppEnv) {
  await authenticate(request,env);
  const body=await readJSON(request,65536),envelope=envelopeSchema.safeParse(body);
  if(!envelope.success)throw new ApiError(422,"Formato de notificação Pulsefy inválido.");
  const {event,payload,timestamp}=envelope.data;
  // The provider's Test button sends representative data marked payload.test=true.
  if(payload.test===true||event==="webhook.test"){
    await audit(env,null,"pulsefy_authenticated_test");
    return {received:true,test:true};
  }
  // Access delivery is not a financial confirmation. Other events cannot approve an order.
  if(event!=="pedido_pago"&&event!=="reembolso")return {received:true,ignored:true};
  const parsed=payloadSchema.safeParse(payload);
  if(!parsed.success)throw new ApiError(422,"Notificação sem os dados esperados do pedido.");
  const p=parsed.data, approved=event==="pedido_pago",status=approved?"approved":"refunded";
  if(p.order.status!==(approved?"completed":"refunded")||p.status&&p.status!==(approved?"paid":"refunded"))throw new ApiError(422,"Evento incompatível com o pagamento.");
  if(!isPulsefyCheckout(p.checkout_link)||p.checkoutUrl&&!isPulsefyCheckout(p.checkoutUrl))throw new ApiError(422,"Checkout incompatível com este produto.");
  const extras=(p.order_bumps||[]).map(item=>({productId:item.product_id,name:item.name,amountCents:pulsefyCents(item.amount)}));
  const total=pulsefyCents(p.order.amount);
  if(extras.some(item=>item.amountCents===null)||total===null||
    total!==PRICE_CENTS+extras.reduce((sum,item)=>sum+(item.amountCents||0),0)||
    p.amount!==undefined&&pulsefyCents(p.amount)!==total||p.offer&&pulsefyCents(p.offer.price)!==PRICE_CENTS)throw new ApiError(422,"Valor ou adicionais incompatíveis com o pedido.");
  const fingerprint=JSON.stringify([event,p.order.id,p.tracking.src,status,total,p.payment.gateway_transaction_id||null,extras.map(item=>[item.productId,item.amountCents]).sort()]);
  const eventId=await hash("pulsefy:"+fingerprint),receivedAt=new Date().toISOString();
  const found=await env.DB!.prepare("SELECT * FROM orders WHERE checkout_reference=? AND payment_provider IN ('pulsefy','kirvano')").bind(p.tracking.src).first<OrderRow>();
  await env.DB!.prepare("INSERT INTO payment_events (id,provider,event_type,transaction_id,order_id,event_time,received_at,outcome,body_hash) VALUES (?,'pulsefy',?,?,?,?,?,'received',?) ON CONFLICT(id) DO NOTHING")
    .bind(eventId,event,p.order.id,found?.id||null,timestamp,receivedAt,await hash(JSON.stringify(body))).run();
  const receipt=await env.DB!.prepare("SELECT outcome FROM payment_events WHERE id=?").bind(eventId).first<{outcome:string}>();
  if(receipt?.outcome!=="received")return {received:true,duplicate:true};
  async function complete(outcome:string,orderId:string|null) {
    await env.DB!.batch([
      env.DB!.prepare("INSERT INTO events (id,order_id,kind,detail,created_at) VALUES (?,?,?,NULL,?) ON CONFLICT(id) DO NOTHING").bind("pulsefy-"+eventId,orderId,"pulsefy_"+event+"_"+outcome,receivedAt),
      env.DB!.prepare("UPDATE payment_events SET outcome=?,processed_at=? WHERE id=? AND outcome='received'").bind(outcome,new Date().toISOString(),eventId),
    ]);
    return {received:true,outcome};
  }
  if(!found)return complete("unmatched",null);
  const conflict=await env.DB!.prepare("SELECT id FROM orders WHERE payment_provider='pulsefy' AND payment_id=? AND id<>?").bind(p.order.id,found.id).first();
  if(conflict){await complete("transaction_conflict",found.id);throw new ApiError(422,"Venda já vinculada a outro pedido.");}
  const details=JSON.stringify({gateway:p.payment.gateway||null,gatewayTransactionId:p.payment.gateway_transaction_id||null,productId:p.product.id,items:extras});
  for(let attempt=0;attempt<3;attempt++){
    const o=await getOrder(env,found.id);
    if(o.checkout_reference!==p.tracking.src||!isPulsefyCheckout(o.checkout_url))throw new ApiError(422,"Referência de checkout incompatível.");
    if(o.payment_provider!=="pulsefy"&&!(o.payment_provider==="kirvano"&&!o.payment_id&&!o.paid_at&&!['approved','refunded'].includes(o.payment_status)))return complete("provider_conflict",o.id);
    if(o.payment_id&&o.payment_id!==p.order.id&&(o.paid_at||["approved","refunded"].includes(o.payment_status)))return complete("other_sale_review",o.id);
    if(o.payment_status==="refunded")return complete("terminal_preserved",o.id);
    if(o.payment_id===p.order.id&&o.payment_total_cents!==null&&o.payment_total_cents!==total)return complete("financial_conflict",o.id);
    if(o.payment_status===status&&o.payment_id===p.order.id)return complete("duplicate_state",o.id);
    const email=p.customer?.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.customer.email)?p.customer.email:null;
    const phone=p.customer?.phone?.replace(/\D/g,"");
    const production=approved&&["awaiting_payment","cancelled"].includes(o.production_status)?"awaiting_production":!approved&&o.production_status!=="delivered"?"cancelled":o.production_status;
    const result=await env.DB!.prepare(`UPDATE orders SET payment_provider='pulsefy',payment_id=?,payment_status=?,provider_updated_at=?,
      payment_total_cents=?,payment_currency='BRL',payment_details_json=?,
      name=COALESCE(?,name),email=COALESCE(?,email),whatsapp=COALESCE(?,whatsapp),
      paid_at=CASE WHEN ? THEN COALESCE(paid_at,?) ELSE paid_at END,
      delivery_due_at=CASE WHEN ? THEN COALESCE(delivery_due_at,?) ELSE delivery_due_at END,
      photos_expires_at=CASE WHEN ? AND paid_at IS NULL AND photos_deleted_at IS NULL THEN ? ELSE photos_expires_at END,
      production_status=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?`)
      .bind(p.order.id,status,timestamp,total,details,p.customer?.name?.trim()||null,email,phone&&/^\d{10,15}$/.test(phone)?phone:null,
        Number(approved),receivedAt,Number(approved),addBusinessDays(new Date(receivedAt),o.delivery_days),Number(approved),new Date(Date.now()+boundedInt(env.RETENTION_DAYS,30,1,90)*86400000).toISOString(),production,receivedAt,o.id,o.revision).run();
    if(result.meta.changes)return complete("applied",o.id);
  }
  throw new ApiError(503,"Notificação concorrente. Tente novamente.");
}
