import { test,before,after } from "node:test";
import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHmac,pbkdf2Sync } from "node:crypto";
import { handleApi,maintenance } from "../.sites-runtime/tests/backend.mjs";
import { validWebhook,applyProviderPayment } from "../.sites-runtime/tests/payments.mjs";
const req=createRequire(import.meta.resolve("wrangler/package.json"));
const {Miniflare}=req("miniflare");
const password="Senha-ficticia-testes-2026",salt="00".repeat(16);
let mf,env,session,other,admin,order,ip=0,photo;
const originalFetch=globalThis.fetch;
before(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:"2026-05-15",d1Databases:{DB:"test-db"},r2Buckets:["BUCKET"],cf:false});
 env={DB:await mf.getD1Database("DB"),BUCKET:await mf.getR2Bucket("BUCKET"),APP_ENV:"development",PAYMENT_MODE:"simulation",SESSION_SECRET:"TEST-ONLY-NOT-A-PRODUCTION-SECRET",DELIVERY_DAYS:"2",RETENTION_DAYS:"30",ADMIN_PASSWORD_HASH:`pbkdf2:100000:${salt}:${pbkdf2Sync(password,salt,100000,32,"sha256").toString("hex")}`};
 for(const file of (await readdir("drizzle")).filter(f=>f.endsWith(".sql")).sort()) for(const sql of (await readFile("drizzle/"+file,"utf8")).split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
 photo=await readFile("tests/fixtures/foto-teste.png");
});
after(async()=>{globalThis.fetch=originalFetch;await mf?.dispose();});
async function call(path,{method="GET",data,cookie,form,headers={},environment=env,origin="https://trilha.test"}={}){
 const r=new Request("https://trilha.test"+path,{method,headers:{...(method!=="GET"?{Origin:origin}:{}),...(data!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"CF-Connecting-IP":"198.51.100."+(++ip),...headers},body:form|| (data!==undefined?JSON.stringify(data):undefined)});
 const response=await handleApi(r,environment);return {r:response,data:response.headers.get("content-type")?.includes("json")?await response.json():null};
}
async function newSession(){const {r}=await call("/api/session",{method:"POST",data:{}});assert.equal(r.status,200);assert.match(r.headers.get("set-cookie"),/HttpOnly/);assert.match(r.headers.get("set-cookie"),/Secure/);return r.headers.get("set-cookie").split(";")[0];}
function photos({consent="true",scenario="carinho",requestKey=crypto.randomUUID(),file=photo,type="image/png"}={}){
 const form=new FormData();form.set("self",new File([file],"teste.png",{type}));form.set("loved",new File([photo],"teste.png",{type:"image/png"}));form.set("scenario",scenario);form.set("consent",consent);form.set("policyVersion","2026-10-30-v1");form.set("requestKey",requestKey);return form;
}
const contact={name:"Pessoa de Teste",email:"pessoa@example.test",whatsapp:"11999999999"};

test("configuração pública não expõe credenciais e cobranças reais ficam bloqueadas",async()=>{
 const {data}=await call("/api/config");assert.equal(data.mode,"simulation");assert.equal(data.checkoutReady,true);assert.equal(JSON.stringify(data).includes(env.SESSION_SECRET),false);
 const production={...env,APP_ENV:"production",ENABLE_LIVE_PAYMENTS:"false"};
 const real=await call("/api/config",{environment:production});assert.equal(real.data.checkoutReady,false);
 session=await newSession();other=await newSession();
});
test("fotos exigem origem confiável, autorização, tipo e dimensões válidos",async()=>{
 assert.equal((await call("/api/orders",{method:"POST",cookie:session,form:photos(),origin:"https://outro.test"})).r.status,403);
 assert.equal((await call("/api/orders",{method:"POST",cookie:session,form:photos({consent:"false"})})).r.status,400);
 assert.equal((await call("/api/orders",{method:"POST",cookie:session,form:photos({file:Buffer.alloc(100),type:"image/jpeg"})})).r.status,400);
 assert.equal((await call("/api/orders",{method:"POST",cookie:session,form:photos({type:"image/svg+xml"})})).r.status,400);
 const bomb=Buffer.from(photo);bomb.writeUInt32BE(100000,16);
 assert.equal((await call("/api/orders",{method:"POST",cookie:session,form:photos({file:bomb})})).r.status,400);
 assert.equal((await call("/api/orders",{method:"POST",cookie:session,form:photos({file:Buffer.alloc(10*1024*1024+1)})})).r.status,400);
});
test("pedido persiste em D1 e R2 e uma repetição não duplica pedido ou fotos",async()=>{
 const key=crypto.randomUUID();const first=await call("/api/orders",{method:"POST",cookie:session,form:photos({requestKey:key})});assert.equal(first.r.status,201);order=first.data.order;
 const again=await call("/api/orders",{method:"POST",cookie:session,form:photos({requestKey:key})});assert.equal(again.r.status,200);assert.equal(again.data.order.id,order.id);
 assert.equal((await env.BUCKET.list()).objects.length,2);assert.equal((await env.DB.prepare("SELECT count(*) as n FROM orders").first()).n,1);
 assert.equal("self_key" in order,false);assert.equal("owner_hash" in order,false);assert.equal(order.paymentStatus,"pending");
});
test("outros clientes não acessam o pedido ou fotos e as respostas privadas não são cacheadas",async()=>{
 assert.equal((await call(`/api/orders/${order.id}`,{cookie:other})).r.status,404);
 assert.equal((await call(`/api/orders/${order.id}/photos/self`,{cookie:other})).r.status,404);
 assert.equal((await call(`/api/orders/${order.id}/photos/self`)).r.status,401);
 const own=await call(`/api/orders/${order.id}/photos/self`,{cookie:session});assert.equal(own.r.status,200);assert.equal(own.r.headers.get("cache-control"),"no-store");
 assert.equal((await call("/media/orders/"+order.id)).r.status,404);
});
test("retorno do checkout não aprova pagamento e dados de contato são validados",async()=>{
 assert.equal((await call(`/api/orders/${order.id}?status=approved&collection_status=approved`,{cookie:session})).data.order.paymentStatus,"pending");
 assert.equal((await call(`/api/orders/${order.id}/checkout`,{method:"POST",cookie:session,data:{...contact,email:"invalido"}})).r.status,400);
 const checkout=await call(`/api/orders/${order.id}/checkout`,{method:"POST",cookie:session,data:contact});assert.equal(checkout.data.simulation,true);assert.equal(checkout.data.order.whatsapp,"5511999999999");
 const prod={...env,APP_ENV:"production"};assert.equal((await call(`/api/orders/${order.id}/test-payment`,{method:"POST",cookie:session,data:{status:"approved"},environment:prod})).r.status,404);
});
test("simulação cobre pagamento pendente, recusado e aprovado, sem produzir um vídeo falso",async()=>{
 for(const status of ["pending","rejected","approved"]){const r=await call(`/api/orders/${order.id}/test-payment`,{method:"POST",cookie:session,data:{status}});assert.equal(r.r.status,200);assert.equal(r.data.order.paymentStatus,status);}
 const o=(await call(`/api/orders/${order.id}`,{cookie:session})).data.order;assert.equal(o.productionStatus,"awaiting_production");assert.equal(o.isTest,true);assert.ok(o.deliveryDueAt);assert.equal(o.completedAt,null);
});
test("admin exige autenticação e só permite transições válidas após pagamento",async()=>{
 assert.equal((await call("/api/admin/orders")).r.status,401);
 assert.equal((await call("/api/admin/login",{method:"POST",data:{password:"incorreta"}})).r.status,401);
 const login=await call("/api/admin/login",{method:"POST",data:{password}});assert.equal(login.r.status,200);admin=login.r.headers.get("set-cookie").split(";")[0];
 const listing=await call("/api/admin/orders",{cookie:admin});assert.equal(listing.data.orders.length,1);assert.equal("self_key" in listing.data.orders[0],false);
 assert.equal((await call(`/api/admin/orders/${order.id}/photos/self`,{cookie:admin})).r.status,200);
 assert.equal((await call(`/api/admin/orders/${order.id}`,{method:"PATCH",cookie:admin,data:{status:"delivered"}})).r.status,409);
 for(const status of ["in_production","ready","delivered"]){const r=await call(`/api/admin/orders/${order.id}`,{method:"PATCH",cookie:admin,data:{status}});assert.equal(r.r.status,200);assert.equal(r.data.order.productionStatus,status);if(status==="delivered")assert.ok(r.data.order.completedAt);}
 const unpaid=await call("/api/orders",{method:"POST",cookie:session,form:photos()});
 assert.equal((await call(`/api/admin/orders/${unpaid.data.order.id}`,{method:"PATCH",cookie:admin,data:{status:"in_production"}})).r.status,409);
});
test("falha parcial de upload desfaz as duas gravações sem arquivos órfãos",async()=>{
 const before=(await env.BUCKET.list()).objects.length;let n=0;
 const failing={...env,BUCKET:{put:async(...args)=>{if(++n===2)throw new Error("simulated storage fault");return env.BUCKET.put(...args);},delete:(...args)=>env.BUCKET.delete(...args)}};
 const result=await call("/api/orders",{method:"POST",cookie:session,form:photos(),environment:failing});assert.equal(result.r.status,503);assert.equal((await env.BUCKET.list()).objects.length,before);
});
test("webhook exige HMAC recente e consulta o provedor antes de aprovar",async()=>{
 const mp={...env,PAYMENT_MODE:"mercadopago-sandbox",MP_ACCESS_TOKEN:"TEST-ONLY",MP_WEBHOOK_SECRET:"TEST-WEBHOOK-SECRET",MP_COLLECTOR_ID:"123456"};
 await env.DB.prepare("UPDATE orders SET payment_provider='mercadopago',payment_status='pending',payment_id=NULL,production_status='awaiting_payment',provider_updated_at=NULL,is_test=1 WHERE id=?").bind(order.id).run();
 const id="987654",ts=String(Math.floor(Date.now()/1000)),rid="test-request-id",sig=createHmac("sha256",mp.MP_WEBHOOK_SECRET).update(`id:${id};request-id:${rid};ts:${ts};`).digest("hex");
 const path=`/api/webhooks/mercadopago?data.id=${id}`,headers={"x-request-id":rid,"x-signature":`ts=${ts},v1=${sig}`};
 assert.equal((await call(path,{method:"POST",data:{type:"payment",data:{id}},environment:mp})).r.status,401);
 assert.equal(await validWebhook(new Request("https://trilha.test"+path,{headers:{...headers,"x-signature":`ts=1000000000,v1=${sig}`}}),mp,id),false);
 let fetches=0;let payment={id,external_reference:order.id,status:"approved",currency_id:"BRL",transaction_amount:27.90,collector_id:123456,live_mode:false,date_last_updated:new Date().toISOString()};
 globalThis.fetch=async(url)=>{assert.equal(String(url),"https://api.mercadopago.com/v1/payments/"+id);fetches++;return Response.json(payment);};
 const good=await call(path,{method:"POST",headers,data:{type:"payment",data:{id}},environment:mp});assert.equal(good.r.status,200);assert.equal(fetches,1);
 assert.equal((await call(`/api/orders/${order.id}`,{cookie:session})).data.order.paymentStatus,"approved");
 const before=await env.DB.prepare("SELECT count(*) as n FROM events WHERE kind='payment_approved'").first();
 await call(path,{method:"POST",headers,data:{type:"payment",data:{id}},environment:mp});
 assert.equal((await env.DB.prepare("SELECT count(*) as n FROM events WHERE kind='payment_approved'").first()).n,before.n);
 assert.equal((await call(path,{method:"POST",headers,data:{type:"payment",data:{id:"outro"}},environment:mp})).r.status,400);
 for(const mismatch of [{transaction_amount:1},{currency_id:"USD"},{collector_id:42},{live_mode:true}]){
  payment={...payment,...mismatch};const r=await call(path,{method:"POST",headers,data:{type:"payment",data:{id}},environment:mp});assert.equal(r.r.status,422);
  payment={id,external_reference:order.id,status:"approved",currency_id:"BRL",transaction_amount:27.90,collector_id:123456,live_mode:false,date_last_updated:new Date().toISOString()};
 }
 const updated=new Date(Date.now()+10000).toISOString();await applyProviderPayment(mp,{...payment,status:"refunded",date_last_updated:updated});
 await applyProviderPayment(mp,payment);assert.equal((await call(`/api/orders/${order.id}`,{cookie:session})).data.order.paymentStatus,"refunded");
 globalThis.fetch=originalFetch;
});
test("fotos vencidas ficam inacessíveis antes da rotina e são removidas sem apagar o pedido",async()=>{
 await env.DB.prepare("UPDATE orders SET photos_expires_at=? WHERE id=?").bind(new Date(Date.now()-10000).toISOString(),order.id).run();
 assert.equal((await call(`/api/orders/${order.id}/photos/self`,{cookie:session})).r.status,410);
 const original=await env.DB.prepare("SELECT self_key,loved_key FROM orders WHERE id=?").bind(order.id).first();
 const result=await maintenance(env);assert.ok(result.deleted>=1);assert.equal(await env.BUCKET.get(original.self_key),null);assert.equal(await env.BUCKET.get(original.loved_key),null);
 const row=await env.DB.prepare("SELECT self_key,photos_deleted_at FROM orders WHERE id=?").bind(order.id).first();assert.equal(row.self_key,null);assert.ok(row.photos_deleted_at);
 assert.equal((await call(`/api/orders/${order.id}`,{cookie:session})).r.status,200);
});
test("sessões expiram no servidor e tentativas de login são limitadas",async()=>{
 await env.DB.prepare("UPDATE customer_sessions SET expires_at=?").bind(new Date(Date.now()-1000).toISOString()).run();
 assert.equal((await call(`/api/orders/${order.id}`,{cookie:session})).r.status,401);
 for(let i=0;i<5;i++)assert.equal((await call("/api/admin/login",{method:"POST",headers:{"CF-Connecting-IP":"203.0.113.9"},data:{password:"invalid"}})).r.status,401);
 assert.equal((await call("/api/admin/login",{method:"POST",headers:{"CF-Connecting-IP":"203.0.113.9"},data:{password}})).r.status,429);
 assert.equal((await call("/api/admin/logout",{method:"POST",cookie:admin,data:{}})).r.status,200);
 assert.equal((await call("/api/admin/orders",{cookie:admin})).r.status,401);
});
test("sandbox nunca reutiliza um checkout de produção salvo anteriormente",async()=>{
 const freshSession=await newSession();
 const created=await call("/api/orders",{method:"POST",cookie:freshSession,form:photos()});const id=created.data.order.id;
 await env.DB.prepare("UPDATE orders SET payment_provider='mercadopago',preference_id='production-preference',preference_is_test=0,checkout_url='https://www.mercadopago.com.br/production-example',preference_expires_at=?,is_test=0 WHERE id=?").bind(new Date(Date.now()+86400000).toISOString(),id).run();
 const sandbox={...env,PAYMENT_MODE:"mercadopago-sandbox",MP_ACCESS_TOKEN:"TEST-ONLY",MP_WEBHOOK_SECRET:"TEST-ONLY",MP_COLLECTOR_ID:"123456",PUBLIC_BASE_URL:"https://trilha.test"};
 let outgoing=0;globalThis.fetch=async()=>{outgoing++;throw new Error("No outgoing network is permitted in this test");};
 const result=await call(`/api/orders/${id}/checkout`,{method:"POST",cookie:freshSession,data:contact,environment:sandbox});
 assert.equal(result.r.status,409);assert.equal(outgoing,0);
 assert.equal((await env.DB.prepare("SELECT is_test FROM orders WHERE id=?").bind(id).first()).is_test,0);
 globalThis.fetch=originalFetch;
});
test("o registro de fotos não depende do gateway e não confirma pagamento",async()=>{
 const freshSession=await newSession();
 const production={...env,APP_ENV:"production",PAYMENT_MODE:"disabled",ENABLE_LIVE_PAYMENTS:"false"};
 const config=await call("/api/config",{environment:production});
 assert.equal(config.data.mode,"disabled");assert.equal(config.data.checkoutReady,false);
 const created=await call("/api/orders",{method:"POST",cookie:freshSession,form:photos(),environment:production});
 assert.equal(created.r.status,201);assert.equal(created.data.order.paymentStatus,"pending");assert.equal(created.data.order.isTest,false);
 const checkout=await call(`/api/orders/${created.data.order.id}/checkout`,{method:"POST",cookie:freshSession,data:contact,environment:production});
 assert.equal(checkout.r.status,503);
 assert.equal((await call(`/api/orders/${created.data.order.id}`,{cookie:freshSession})).data.order.paymentStatus,"pending");
});
