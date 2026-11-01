import {photoStorage,PhotoStorageError} from "./photo-storage";
import {storageConfigured} from "./storage-config";
import { z } from "zod";
import { PRICE_CENTS, POLICY_VERSION, SCENARIOS, publicConfig, localTesting, boundedInt, addBusinessDays, type AppEnv } from "./configuration";
import { ApiError, assertOrigin, cookie, makeCookie, randomToken, hash, owner, requireAdmin, rateLimit, readBytes, readJSON, verifyPassword, secureResponse } from "./security";
import { validateImage } from "./image-validation";
import { visibleOrder, type OrderRow } from "./order-types";
import { audit, getOrder, customerOrder, deletePhotos } from "./repository";
import { createPreference, validWebhook, mercadoFetch, applyProviderPayment, reconcile, type ProviderPayment } from "./payments";
import { createKirvanoCheckout, kirvanoWebhook } from "./kirvano";
import { createHostedCheckout } from "./hosted-checkout";
import { pulsefyWebhook } from "./pulsefy";
import { resendWebhook, type BackgroundContext } from "./email-delivery";

const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers });
const contacts = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(200), whatsapp: z.string().transform(s=>s.replace(/\D/g,"")).refine(s=>/^(55)?[1-9]\d{9,10}$/.test(s)) });

async function createOrder(request: Request, env: AppEnv) {
  await rateLimit(request,env,"upload",12,3600);
  const who = await owner(request,env), config = publicConfig(request,env);
  const bytes = await readBytes(request, 21 * 1024 * 1024);
  let form: FormData;
  try { form = await new Request(request.url, { method:"POST", headers:{"Content-Type":request.headers.get("content-type") || ""}, body:bytes }).formData(); }
  catch { throw new ApiError(400,"Não foi possível ler as fotos. Tente selecioná-las novamente."); }
  const input = String(form.get("scenario") || ""), key = String(form.get("requestKey") || ""), scene=SCENARIOS.find(s=>s.id===input||s.key===input);
  if (!scene || !/^[a-f0-9-]{36}$/.test(key)) throw new ApiError(400,"Escolha um cenário para continuar.");
  const scenario=scene.id;
  if (form.get("consent") !== "true" || form.get("policyVersion") !== POLICY_VERSION) throw new ApiError(400,"Atualize a página e envie novamente as fotos para registrar as condições atuais do pedido.");
  let existing = await env.DB!.prepare("SELECT * FROM orders WHERE owner_hash = ? AND request_key = ?").bind(who,key).first<OrderRow>();
  if (existing?.upload_state === "ready") {
    if (existing.scenario !== scenario) throw new ApiError(409,"Este envio já foi registrado com outro cenário. Inicie um novo pedido para alterar as fotos ou o cenário.");
    return json({order:visibleOrder(existing)});
  }
  if (existing?.upload_state === "failed" || existing && Date.parse(existing.created_at) < Date.now()-10*60000 && existing.upload_state === "uploading") {
    await deletePhotos(env,existing); await env.DB!.prepare("DELETE FROM orders WHERE id = ? AND upload_state != 'ready'").bind(existing.id).run(); existing=null;
  }
  if (existing) throw new ApiError(409,"Seu pedido ainda está sendo registrado. Aguarde alguns instantes e tente novamente.");
  const [self,loved] = await Promise.all([validateImage(form.get("self")),validateImage(form.get("loved"))]);
  const id = crypto.randomUUID(), number = "TDA-"+id.replace(/-/g,"").slice(0,16).toUpperCase();
  const now = new Date().toISOString(), expiry = new Date(Date.now()+config.unpaidRetentionHours*3600000).toISOString();
  const extension=(type:string)=>({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[type];
  const selfKey = `pedidos/${number}/foto-cliente.${extension(self.type)}`, lovedKey = `pedidos/${number}/foto-pessoa-querida.${extension(loved.type)}`;
  const inserted = await env.DB!.prepare(`INSERT INTO orders
    (id,number,owner_hash,request_key,scenario,scenario_key,created_at,updated_at,self_key,loved_key,self_type,loved_type,consent_at,policy_version,amount_cents,delivery_days,photos_expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_hash,request_key) DO NOTHING`)
    .bind(id,number,who,key,scenario,scene.key,now,now,selfKey,lovedKey,self.type,loved.type,now,POLICY_VERSION,PRICE_CENTS,config.deliveryDays,expiry).run();
  if (!inserted.meta.changes) throw new ApiError(409,"Seu pedido já está sendo registrado. Aguarde alguns instantes e tente novamente.");
  try {
    // Persist before network writes. A timeout may hide a late commit at the remote storage service.
    // Keep this independent of the failed order, which a retry may replace.
    await env.DB!.prepare("INSERT INTO photo_cleanup_jobs (id,object_keys,not_before,created_at) VALUES (?,?,?,?)")
      .bind(id,JSON.stringify([selfKey,lovedKey]),new Date(Date.now()+10*60000).toISOString(),now).run();
    // All uploads finish before rollback, so a failed sibling cannot create a late orphan.
    const writes = await Promise.allSettled([
      photoStorage(env).put(selfKey,self.bytes,{httpMetadata:{contentType:self.type,cacheControl:"private, no-store"}}),
      photoStorage(env).put(lovedKey,loved.bytes,{httpMetadata:{contentType:loved.type,cacheControl:"private, no-store"}}),
    ]);
    const failed=writes.find(r=>r.status==="rejected");
    if(failed?.status==="rejected")throw failed.reason;
    await env.DB!.batch([
      env.DB!.prepare("UPDATE orders SET upload_state = 'ready', updated_at = ? WHERE id = ?").bind(new Date().toISOString(),id),
      env.DB!.prepare("DELETE FROM photo_cleanup_jobs WHERE id=?").bind(id),
    ]);
  } catch(error) {
    if(error instanceof PhotoStorageError)await audit(env,id,"photo_storage_unavailable",JSON.stringify({phase:error.phase,upstreamStatus:error.upstreamStatus,errorType:error.errorType}));
    await env.DB!.prepare("UPDATE orders SET upload_state = 'failed', photos_expires_at = ? WHERE id = ?").bind(now,id).run();
    try { await deletePhotos(env,await getOrder(env,id)); } catch { /* Scheduled cleanup retries retained keys. */ }
    throw new ApiError(503,"Não foi possível guardar suas fotos. Elas continuam neste dispositivo; tente novamente.");
  }
  await audit(env,id,"order_created"); return json({order:visibleOrder(await getOrder(env,id))},201);
}

async function checkout(request: Request, env: AppEnv, id: string) {
  const o = await customerOrder(request,env,id), config = publicConfig(request,env);
  await rateLimit(request,env,"checkout",15,900);
  if (!config.checkoutReady) throw new ApiError(503,"Não foi possível iniciar o pagamento agora. Suas fotos continuam no pedido; tente novamente mais tarde.");
  if (o.upload_state !== "ready" || o.photos_deleted_at || o.photos_expires_at <= new Date().toISOString()) throw new ApiError(410,"O prazo de armazenamento das fotos terminou. Inicie um novo pedido.");
  if (o.payment_status === "approved") return json({approved:true,order:visibleOrder(o)});
  if (["refunded","cancelled"].includes(o.payment_status)) throw new ApiError(409,"Este pedido foi encerrado. Crie um novo reencontro.");
  if(config.mode==="kirvano"||config.mode==="pulsefy"){
    if(!storageConfigured(env))throw new ApiError(503,"O envio das fotos precisa ser concluído antes do pagamento.");
    const result=config.mode==="pulsefy"?await createHostedCheckout(env,o,"pulsefy"):await createKirvanoCheckout(env,o);return json({...result,order:visibleOrder(await getOrder(env,id))});
  }
  const supplied=await readJSON(request), parsed=Object.keys(supplied).length?contacts.safeParse(supplied):null;
  if (parsed&&!parsed.success) throw new ApiError(400,"Os dados de checkout informados não são válidos.");
  const name=parsed?.success?parsed.data.name:null,email=parsed?.success?parsed.data.email:null,whatsapp=parsed?.success?parsed.data.whatsapp:null,phone=whatsapp?(whatsapp.length<=11?"55"+whatsapp:whatsapp):null;
  const simulation = config.mode === "simulation" && localTesting(request,env), isTest = simulation || config.mode === "sandbox";
  if (o.payment_provider && o.payment_provider !== (simulation?"simulation":"mercadopago") ||
    o.preference_id && o.preference_is_test !== Number(isTest)) throw new ApiError(409,"Este pedido foi criado em outro ambiente de pagamento. Inicie um novo pedido.");
  const now = new Date().toISOString();
  const locked = await env.DB!.prepare("UPDATE orders SET checkout_lock_until = ? WHERE id = ? AND (checkout_lock_until IS NULL OR checkout_lock_until < ?)").bind(new Date(Date.now()+30000).toISOString(),id,now).run();
  if (!locked.meta.changes) throw new ApiError(409,"O checkout já está sendo preparado. Aguarde alguns instantes.");
  try {
    if (o.preference_id && o.checkout_url && o.email && o.email !== email) throw new ApiError(409,"O checkout já foi criado com outro e-mail. Use o e-mail informado anteriormente ou inicie um novo pedido.");
    await env.DB!.prepare("UPDATE orders SET name = ?, email = ?, whatsapp = ?, is_test = ?, payment_provider = ?, updated_at = ? WHERE id = ?")
      .bind(name,email,phone,Number(isTest),simulation?"simulation":"mercadopago",now,id).run();
    if (simulation) return json({simulation:true,order:visibleOrder(await getOrder(env,id))});
    if (o.preference_id && o.checkout_url && o.preference_expires_at && Date.parse(o.preference_expires_at)>Date.now()+60000) return json({url:o.checkout_url});
    const preference = await createPreference(env,await getOrder(env,id),config.mode==="sandbox");
    await env.DB!.prepare("UPDATE orders SET preference_id = ?, checkout_url = ?, preference_is_test = ?, preference_expires_at = ?, updated_at = ? WHERE id = ?").bind(preference.id,preference.url,Number(isTest),preference.expiresAt,now,id).run();
    await audit(env,id,"checkout_created"); return json({url:preference.url});
  } finally { await env.DB!.prepare("UPDATE orders SET checkout_lock_until = NULL WHERE id = ?").bind(id).run(); }
}

async function testPayment(request: Request,env: AppEnv,id: string) {
  if (!localTesting(request,env) || env.PAYMENT_MODE!=="simulation") throw new ApiError(404,"Página não encontrada.");
  const o=await customerOrder(request,env,id);
  if (o.payment_provider!=="simulation" || !o.is_test) throw new ApiError(409,"Prepare o checkout de teste antes de simular o pagamento.");
  const data=await readJSON(request), status=String(data.status);
  if (!["approved","pending","rejected","refunded"].includes(status)) throw new ApiError(400,"Status de teste inválido.");
  const now=new Date(), time=now.toISOString();
  await env.DB!.prepare(`UPDATE orders SET payment_status = ?, payment_id = ?, paid_at = ?, delivery_due_at = ?,
    production_status = ?, photos_expires_at = ?, updated_at = ? WHERE id = ?`)
    .bind(status,"test-"+id,status==="approved"?time:o.paid_at,status==="approved"?addBusinessDays(now,o.delivery_days):o.delivery_due_at,
      status==="approved"?"awaiting_production":status==="refunded"?"cancelled":"awaiting_payment",
      status==="approved"?new Date(Date.now()+boundedInt(env.RETENTION_DAYS,30,1,90)*86400000).toISOString():o.photos_expires_at,time,id).run();
  await audit(env,id,"simulation_"+status); return json({order:visibleOrder(await getOrder(env,id))});
}

async function photoResponse(request: Request,env: AppEnv,o: OrderRow,which: string) {
  if (!["self","loved"].includes(which)) throw new ApiError(404,"Foto não encontrada.");
  if (o.photos_deleted_at || o.photos_expires_at<=new Date().toISOString()) throw new ApiError(410,"Estas fotos já foram excluídas ou estão fora do prazo de acesso.");
  const key=which==="self"?o.self_key:o.loved_key, type=which==="self"?o.self_type:o.loved_type;
  const object=key && await photoStorage(env).get(key); if (!object) throw new ApiError(404,"Foto não encontrada.");
  return new Response(object.body,{headers:{"Content-Type":type||"application/octet-stream","Content-Disposition":"inline","Cache-Control":"private, no-store"}});
}

async function route(request: Request,env: AppEnv,context?: BackgroundContext): Promise<Response> {
  const url=new URL(request.url), path=url.pathname.replace(/\/$/,""), method=request.method;
  if (path==="/api/config" && method==="GET") return json(publicConfig(request,env));
  if (!env.DB) throw new ApiError(503,"Não foi possível acessar o pedido agora. Tente novamente.");
  if(path==="/api/webhooks/kirvano"&&method==="POST")return json(await kirvanoWebhook(request,env));
  if(path==="/api/webhooks/pulsefy"&&method==="POST")return json(await pulsefyWebhook(request,env,context));
  if(path==="/api/webhooks/resend"&&method==="POST")return json(await resendWebhook(request,env));
  const webhook=path==="/api/webhooks/mercadopago";
  if (!["GET","HEAD"].includes(method) && !webhook) assertOrigin(request);
  if (path==="/api/session" && method==="POST") {
    if (!env.SESSION_SECRET) throw new ApiError(503,"Não foi possível iniciar seu pedido agora. Tente novamente.");
    await rateLimit(request,env,"session",90,900);
    let token=cookie(request,"tda_session");
    if (token) {
      const old=await env.DB.prepare("SELECT token_hash FROM customer_sessions WHERE token_hash = ? AND expires_at > ?").bind(await hash(env.SESSION_SECRET+":"+token),new Date().toISOString()).first();
      if (!old) token=null;
    }
    token=token||randomToken();
    await env.DB.prepare("INSERT INTO customer_sessions (token_hash,expires_at) VALUES (?,?) ON CONFLICT(token_hash) DO UPDATE SET expires_at = excluded.expires_at").bind(await hash(env.SESSION_SECRET+":"+token),new Date(Date.now()+30*86400000).toISOString()).run();
    return json({ok:true},200,{"Set-Cookie":makeCookie(request,"tda_session",token,30*86400)});
  }
  if (path==="/api/orders" && method==="POST") {if(!storageConfigured(env))throw new ApiError(503,"Não foi possível guardar suas fotos agora. Elas continuam neste navegador; tente novamente.");return createOrder(request,env);}
  if (path==="/api/orders/recover" && method==="GET") {
    const who=await owner(request,env);
    await rateLimit(request,env,"recover-order",30,900);
    // A missing browser reference must never be guessed from email or payment status.
    // Return a single checkout only when unambiguous; otherwise the owner chooses.
    const rows=await env.DB.prepare("SELECT * FROM orders WHERE owner_hash=? AND upload_state='ready' AND checkout_reference IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 11").bind(who).all<OrderRow>();
    return json({order:rows.results.length===1?visibleOrder(rows.results[0]):null,orders:rows.results.length>1?rows.results.slice(0,10).map(visibleOrder):[]});
  }
  const customer=path.match(/^\/api\/orders\/([a-f0-9-]{36})(?:\/(checkout|test-payment|reconcile|photos\/(self|loved)))?$/);
  if (customer) {
    const [,id,action,which]=customer;
    if (!action && method==="GET") return json({order:visibleOrder(await customerOrder(request,env,id))});
    if (action==="checkout" && method==="POST") return checkout(request,env,id);
    if (action==="test-payment" && method==="POST") return testPayment(request,env,id);
    if (action==="reconcile" && method==="POST") {
      const o=await customerOrder(request,env,id); await rateLimit(request,env,"reconcile",8,300);
      if (o.payment_provider==="mercadopago") await reconcile(env,o);
      return json({order:visibleOrder(await getOrder(env,id))});
    }
    if (which && method==="GET") {if(!storageConfigured(env))throw new ApiError(503,"Não foi possível carregar as fotos agora.");return photoResponse(request,env,await customerOrder(request,env,id),which);}
  }
  const deletion=path.match(/^\/api\/orders\/([a-f0-9-]{36})\/photos$/);
  if(deletion&&method==="DELETE"){
    const o=await customerOrder(request,env,deletion[1]);await rateLimit(request,env,"delete-photos",5,3600);
    if(!storageConfigured(env))throw new ApiError(503,"Não foi possível excluir as fotos agora. Tente novamente.");
    await deletePhotos(env,o);await audit(env,o.id,"customer_photos_deleted");return json({order:visibleOrder(await getOrder(env,o.id))});
  }
  if (webhook && method==="POST") {
    const id=url.searchParams.get("data.id")||"";
    if (!await validWebhook(request,env,id)) throw new ApiError(401,"Notificação não autenticada.");
    const body=await readJSON(request,32768), nested=body.data as {id?:unknown}|undefined;
    if (!nested || String(nested.id)!==id || body.type!=="payment") throw new ApiError(400,"Notificação inválida.");
    const payment=await mercadoFetch(env,"/v1/payments/"+encodeURIComponent(id)) as ProviderPayment;
    if (String(payment.id)!==id) throw new ApiError(422,"Pagamento divergente.");
    await applyProviderPayment(env,payment); return json({received:true});
  }
  if (path==="/api/admin/login" && method==="POST") {
    await rateLimit(request,env,"admin-login",5,900);
    const data=await readJSON(request);
    if (!env.ADMIN_PASSWORD_HASH) throw new ApiError(503,"Configure a senha administrativa antes de entrar.");
    if (!await verifyPassword(String(data.password||""),env.ADMIN_PASSWORD_HASH)) throw new ApiError(401,"Senha inválida.");
    const token=randomToken();
    await env.DB.prepare("INSERT INTO admin_sessions (token_hash,expires_at) VALUES (?,?)").bind(await hash(token),new Date(Date.now()+8*3600000).toISOString()).run();
    return json({ok:true},200,{"Set-Cookie":makeCookie(request,"tda_admin",token,8*3600)});
  }
  if (path.startsWith("/api/admin/")) {
    await requireAdmin(request,env);
    if (path==="/api/admin/session" && method==="GET") return json({authenticated:true});
    if (path==="/api/admin/logout" && method==="POST") {
      await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await hash(cookie(request,"tda_admin")!)).run();
      return json({ok:true},200,{"Set-Cookie":makeCookie(request,"tda_admin","",0)});
    }
    if (path==="/api/admin/orders" && method==="GET") {
      const [beforeTime,beforeId]=(url.searchParams.get("before")||"9999|~").split("|"), filter=url.searchParams.get("status")||"";
      const rows=await env.DB.prepare("SELECT * FROM orders WHERE upload_state = 'ready' AND (created_at < ? OR (created_at = ? AND id < ?)) AND (? = '' OR production_status = ?) ORDER BY created_at DESC, id DESC LIMIT 51").bind(beforeTime,beforeTime,beforeId||"~",filter,filter).all<OrderRow>();
      return json({orders:rows.results.slice(0,50).map(visibleOrder),next:rows.results.length>50?rows.results[49].created_at+"|"+rows.results[49].id:null});
    }
    const admin=path.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})(?:\/(photos\/(self|loved)|reconcile))?$/);
    if (admin) {
      const [,id,action,which]=admin, o=await getOrder(env,id);
      if (which && method==="GET") { await audit(env,id,"admin_photo_access",which); return photoResponse(request,env,o,which); }
      if (action==="reconcile" && method==="POST") { await reconcile(env,o); return json({order:visibleOrder(await getOrder(env,id))}); }
      if (!action && method==="GET") {
        const events=await env.DB.prepare("SELECT kind,detail,created_at FROM events WHERE order_id = ? ORDER BY created_at DESC LIMIT 30").bind(id).all();
        return json({order:visibleOrder(o),events:events.results});
      }
      if (!action && method==="PATCH") {
        const data=await readJSON(request), target=String(data.status||o.production_status);
        const allowed:Record<string,string[]>={awaiting_payment:["awaiting_payment"],awaiting_production:["awaiting_production","in_production"],in_production:["in_production","ready"],ready:["ready","delivered"],delivered:["delivered"],cancelled:["cancelled"]};
        if (!allowed[o.production_status]?.includes(target) || target!=="awaiting_payment" && target!=="cancelled" && o.payment_status!=="approved") throw new ApiError(409,"Essa mudança não é permitida para o estado atual do pedido.");
        const days=data.deliveryDays===undefined?o.delivery_days:Number(data.deliveryDays);
        if (!Number.isInteger(days) || days<1 || days>90) throw new ApiError(400,"O prazo deve ter entre 1 e 90 dias úteis.");
        const due=data.deliveryDueAt===undefined?o.delivery_due_at:String(data.deliveryDueAt);
        if (due!==null && !Number.isFinite(Date.parse(due))) throw new ApiError(400,"Prazo de entrega inválido.");
        const now=new Date().toISOString();
        const updated=await env.DB.prepare("UPDATE orders SET production_status = ?, delivery_days = ?, delivery_due_at = ?, completed_at = ?, updated_at = ? WHERE id = ? AND production_status = ? AND payment_status = ?")
          .bind(target,days,due,target==="delivered"?(o.completed_at||now):o.completed_at,now,id,o.production_status,o.payment_status).run();
        if (!updated.meta.changes) throw new ApiError(409,"O pedido mudou durante a atualização. Consulte-o novamente.");
        await audit(env,id,"admin_update",JSON.stringify({status:target,deliveryDays:days,deliveryDueAt:due})); return json({order:visibleOrder(await getOrder(env,id))});
      }
    }
    if (path==="/api/admin/maintenance" && method==="POST") return json(await maintenance(env));
  }
  throw new ApiError(404,"Página não encontrada.");
}

export async function maintenance(env: AppEnv) {
  if (!env.DB) return {deleted:0};
  const now=new Date().toISOString();
  const expired=await env.DB.prepare("SELECT * FROM orders WHERE photos_deleted_at IS NULL AND photos_expires_at <= ? LIMIT 100").bind(now).all<OrderRow>();
  let deleted=0,cleanupChecks=0;
  if(storageConfigured(env)){
    const jobs=await env.DB.prepare("SELECT id,object_keys FROM photo_cleanup_jobs WHERE not_before<=? LIMIT 100").bind(now).all<{id:string;object_keys:string}>();
    for(const job of jobs.results){
      try{
        const keys:unknown=JSON.parse(job.object_keys);
        if(!Array.isArray(keys)||!keys.length||keys.length>2||keys.some(key=>typeof key!=="string"))throw new Error("Invalid cleanup job");
        await photoStorage(env).delete(keys);
        await env.DB.prepare("DELETE FROM photo_cleanup_jobs WHERE id=?").bind(job.id).run();cleanupChecks++;
      }catch{console.error("Trilha do Amor: photo cleanup will retry",job.id);}
    }
  }
  if(storageConfigured(env))for (const o of expired.results) { await deletePhotos(env,o); await audit(env,o.id,"photos_deleted"); deleted++; }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM customer_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(Math.floor(Date.now()/1000)),
  ]);
  return {deleted,cleanupChecks};
}
export async function handleApi(request: Request,env: AppEnv,context?: BackgroundContext) {
  try { return secureResponse(await route(request,env,context)); }
  catch (e) {
    if (e instanceof ApiError) return secureResponse(json({error:e.message},e.status));
    // Deliberately omit raw exceptions, bodies and photos from server logs.
    console.error("Trilha do Amor: unexpected API failure",new URL(request.url).pathname);
    return secureResponse(json({error:"Não foi possível concluir agora. Tente novamente em instantes."},503));
  }
}
