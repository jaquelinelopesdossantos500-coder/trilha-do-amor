import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {handleApi,maintenance} from '../.sites-runtime/tests/backend.mjs';
const {Miniflare}=createRequire(import.meta.resolve('wrangler/package.json'))('miniflare');
const official='https://pay.kirvano.com/abed794c-74c4-4493-810f-b9a4708a56e4';
let mf,env,photo,ip=0,saleSequence=0;
before(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'kirvano-test-db'},r2Buckets:['BUCKET'],cf:false});
 env={DB:await mf.getD1Database('DB'),BUCKET:await mf.getR2Bucket('BUCKET'),APP_ENV:'production',PAYMENT_MODE:'kirvano',SESSION_SECRET:'FICTIONAL-TEST-SESSION-SECRET',ENABLE_LIVE_PAYMENTS:'true',KIRVANO_CHECKOUT_URL:official,KIRVANO_WEBHOOK_TOKEN:'FICTIONAL-TEST-WEBHOOK-TOKEN',KIRVANO_PRODUCT_ID:'fictional-product',KIRVANO_OFFER_ID:'fictional-offer'};
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
 photo=await readFile('tests/fixtures/foto-teste.png');
});
after(()=>mf?.dispose());
async function call(path,{method='GET',data,cookie,form,environment=env}={}){
 const response=await handleApi(new Request('https://trilha.test'+path,{method,headers:{Origin:'https://trilha.test','CF-Connecting-IP':'198.51.100.'+(++ip),...(cookie?{Cookie:cookie}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})},body:form||(data!==undefined?JSON.stringify(data):undefined)}),environment);
 return {response,data:response.headers.get('content-type')?.includes('json')?await response.json():null};
}
async function session(){const {response}=await call('/api/session',{method:'POST',data:{}});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
function form(scenario='carinho',requestKey=crypto.randomUUID()){
 const f=new FormData();f.set('self',new File([photo],'cliente-original.png',{type:'image/png'}));f.set('loved',new File([photo],'nome-privado.png',{type:'image/png'}));f.set('scenario',scenario);f.set('requestKey',requestKey);f.set('policyVersion','2026-10-30-v1');f.set('consent','true');return f;
}
async function create(scenario='carinho',cookie,requestKey){
 cookie||=await session();const {response,data}=await call('/api/orders',{method:'POST',cookie,form:form(scenario,requestKey)});assert.ok([200,201].includes(response.status),JSON.stringify(data));return {cookie,order:data.order};
}
async function checkout(o){const r=await call(`/api/orders/${o.order.id}/checkout`,{method:'POST',cookie:o.cookie,data:{}});assert.equal(r.response.status,200,JSON.stringify(r.data));return new URL(r.data.url);}
async function prepared(){const o=await create();o.url=await checkout(o);return o;}
function payload(o,event='SALE_APPROVED',overrides={}){
 const statuses={SALE_APPROVED:'APPROVED',SALE_REFUNDED:'REFUNDED',SALE_CHARGEBACK:'CHARGEBACK',SALE_REFUSED:'REFUSED',PIX_GENERATED:'PENDING',PIX_EXPIRED:'CANCELED',BANK_SLIP_GENERATED:'PENDING',BANK_SLIP_EXPIRED:'CANCELED'};
 return {event,status:statuses[event],sale_id:'SALE_'+(++saleSequence),checkout_id:'CHECKOUT_TEST',total_price:'R$ 27,90',type:'ONE_TIME',created_at:'2026-10-30 12:00:00',customer:{id:'BUYER_TEST',name:'Pessoa Fictícia',email:'pessoa@example.test',phone_number:'5511999999999',document:'MUST-NOT-BE-STORED'},products:[{id:env.KIRVANO_PRODUCT_ID,offer_id:env.KIRVANO_OFFER_ID,price:'R$ 27,90',is_order_bump:false}],utm:{src:o.url.searchParams.get('src')},...overrides};
}
async function notify(body,options={}){return call('/api/webhooks/kirvano?token='+env.KIRVANO_WEBHOOK_TOKEN,{method:'POST',data:body,...options});}
async function row(o){return env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(o.order.id).first();}

test('A–E: quatro cenários, ID do backend, dois arquivos privados e retomada sem duplicação',async()=>{
 for(const [scenario,key]of [['escadaria','escadaria-dourada'],['carinho','carinho-no-ceu'],['nuvens','abraco-nas-nuvens'],['luz','abraco-na-luz']]){
  const cookie=await session(),requestKey=crypto.randomUUID(),o=await create(key,cookie,requestKey),saved=await row(o);
  assert.equal(saved.scenario,scenario);assert.equal(saved.scenario_key,key);assert.equal(o.order.status,'aguardando_pagamento');assert.match(saved.number,/^TDA-[A-F0-9]{16}$/);assert.notEqual(saved.id,requestKey);
  assert.equal(saved.self_key,`pedidos/${saved.number}/foto-cliente.png`);assert.equal(saved.loved_key,`pedidos/${saved.number}/foto-pessoa-querida.png`);
  for(const key of [saved.self_key,saved.loved_key])assert.deepEqual(Buffer.from(await (await env.BUCKET.get(key)).arrayBuffer()),photo);
  const again=await create(scenario,cookie,requestKey);assert.equal(again.order.id,o.order.id);
  const other=await session();assert.equal((await call(`/api/orders/${o.order.id}/photos/self`,{cookie:other})).response.status,404);
  assert.equal((await call(`/api/orders/${saved.number}/photos/self`,{cookie})).response.status,404);
  assert.equal((await call('/'+saved.self_key,{cookie})).response.status,404);
 }
});
test('F: checkout oficial usa src estável, sem formulário de contatos, somente com fotos salvas',async()=>{
 const o=await prepared();assert.equal(o.url.origin+o.url.pathname,official);assert.match(o.url.searchParams.get('src'),/^tda_[a-f0-9]{40}$/);assert.deepEqual([...o.url.searchParams.keys()],['src']);assert.equal((await checkout(o)).href,o.url.href);
 const saved=await row(o);assert.equal(saved.email,null);assert.equal(saved.whatsapp,null);assert.equal(saved.name,null);assert.equal(saved.checkout_reference,o.url.searchParams.get('src'));
 await env.BUCKET.delete(saved.self_key);assert.equal((await call(`/api/orders/${o.order.id}/checkout`,{method:'POST',cookie:o.cookie,data:{}})).response.status,410);
 const config=(await call('/api/config')).data;assert.equal(config.checkoutReady,true);assert.equal(JSON.stringify(config).includes(env.KIRVANO_WEBHOOK_TOKEN),false);
 assert.equal((await call('/api/config',{environment:{...env,BUCKET:undefined}})).data.checkoutReady,false);
});
test('checkout hospedado abre sem credenciais de webhook e mantém pagamento pendente',async()=>{
 const environment={...env,KIRVANO_WEBHOOK_TOKEN:undefined,KIRVANO_PRODUCT_ID:undefined,KIRVANO_OFFER_ID:undefined,WHATSAPP_NUMBER:'5553991905194'};
 const config=(await call('/api/config',{environment})).data;
 assert.equal(config.checkoutReady,true);assert.equal(config.whatsapp,'5553991905194');
 const o=await create();
 const first=await call(`/api/orders/${o.order.id}/checkout`,{method:'POST',cookie:o.cookie,data:{},environment});
 assert.equal(first.response.status,200,JSON.stringify(first.data));
 const url=new URL(first.data.url);assert.equal(url.origin+url.pathname,official);assert.match(url.searchParams.get('src'),/^tda_[a-f0-9]{40}$/);
 const retry=await call(`/api/orders/${o.order.id}/checkout`,{method:'POST',cookie:o.cookie,data:{},environment});
 assert.equal(retry.data.url,first.data.url);assert.equal(retry.data.order.id,o.order.id);assert.equal((await row(o)).payment_status,'pending');
 assert.equal((await notify(payload({...o,url}),{environment})).response.status,503);
 assert.equal((await row(o)).payment_status,'pending');
});
test('link divergente, pagamentos desabilitados ou sessão indisponível bloqueiam o checkout',async()=>{
 const o=await create();
 for(const override of [{ENABLE_LIVE_PAYMENTS:'false'},{KIRVANO_CHECKOUT_URL:'https://example.test/checkout'},{SESSION_SECRET:undefined}]){
  const environment={...env,...override};
  assert.equal((await call('/api/config',{environment})).data.checkoutReady,false);
  assert.notEqual((await call(`/api/orders/${o.order.id}/checkout`,{method:'POST',cookie:o.cookie,data:{},environment})).response.status,200);
 }
 assert.equal((await row(o)).checkout_reference,null);
});
test('G: webhook recusa token ausente/incorreto e configuração incompleta',async()=>{
 const o=await prepared(),p=payload(o);
 for(const path of ['/api/webhooks/kirvano','/api/webhooks/kirvano?token=invalid'])assert.equal((await call(path,{method:'POST',data:p})).response.status,401);
 assert.equal((await notify(p,{environment:{...env,KIRVANO_WEBHOOK_TOKEN:undefined}})).response.status,503);
 assert.equal((await notify(p,{environment:{...env,KIRVANO_OFFER_ID:undefined}})).response.status,503);
 assert.equal((await row(o)).payment_status,'pending');
});
test('G: produto, oferta, total, data e referência inválidos não aprovam pedidos',async()=>{
 const o=await prepared(),p=payload(o);
 for(const change of [{total_price:'R$ 0,01'},{total_price:'27.90'},{created_at:'2026-02-30 12:00:00'},{status:'PENDING'},{utm:{src:o.order.id}},{products:[{...p.products[0],offer_id:'wrong'}]},{products:[{...p.products[0],price:'R$ 1,00'}]},{products:[{...p.products[0],is_order_bump:true}]}])assert.equal((await notify({...p,...change})).response.status,422,JSON.stringify(change));
 const unmatched=await notify({...p,utm:{src:'tda_'+'a'.repeat(40)}});assert.equal(unmatched.data.outcome,'unmatched');assert.equal((await row(o)).payment_status,'pending');
});
test('G/I: pagamento aprovado persiste contatos e fotos sem clique no WhatsApp; duplicatas não renovam prazo',async()=>{
 const o=await prepared(),p=payload(o);assert.equal((await notify(p)).response.status,200);const saved=await row(o);
 assert.equal(saved.payment_status,'approved');assert.equal(saved.production_status,'awaiting_production');assert.equal(saved.payment_id,p.sale_id);assert.equal(saved.buyer_id,'BUYER_TEST');assert.equal(saved.email,'pessoa@example.test');assert.equal(saved.whatsapp,'5511999999999');assert.ok(saved.paid_at);assert.ok(saved.delivery_due_at);assert.ok(await env.BUCKET.head(saved.self_key));
 const duplicate=await notify(p);assert.equal(duplicate.data.duplicate,true);assert.equal((await row(o)).photos_expires_at,saved.photos_expires_at);assert.equal((await row(o)).paid_at,saved.paid_at);
 const logs=await env.DB.prepare('SELECT * FROM events WHERE order_id=?').bind(o.order.id).all();assert.equal(JSON.stringify(logs).includes(p.customer.email),false);assert.equal(JSON.stringify(logs).includes(p.customer.document),false);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM payment_events WHERE transaction_id=?').bind(p.sale_id).first()).n,1);
 const independent=await call('/api/orders/'+o.order.id,{cookie:o.cookie,environment:{...env,BUCKET:undefined}});assert.equal(independent.data.order.status,'pagamento_aprovado');
});
test('G: eventos atrasados de pendência/recusa/expiração não rebaixam aprovação',async()=>{
 const o=await prepared(),approval=payload(o);await notify(approval);
 for(const event of ['PIX_GENERATED','SALE_REFUSED','PIX_EXPIRED','BANK_SLIP_EXPIRED']){await notify(payload(o,event,{sale_id:approval.sale_id,created_at:'2026-10-30 13:00:00'}));assert.equal((await row(o)).payment_status,'approved');}
});
test('G: reembolso e chargeback prevalecem mesmo chegando antes da aprovação',async()=>{
 for(const event of ['SALE_REFUNDED','SALE_CHARGEBACK']){
  const o=await prepared(),refund=payload(o,event,{created_at:'2026-10-30 13:00:00'});await notify(refund);await notify(payload(o,'SALE_APPROVED',{sale_id:refund.sale_id}));
  assert.equal((await row(o)).payment_status,'refunded');assert.equal((await row(o)).production_status,'cancelled');
 }
});
test('G: aprovação seguida de reembolso mantém trilha financeira e nunca restaura o pedido',async()=>{
 const o=await prepared(),p=payload(o);await notify(p);const before=await row(o);await notify(payload(o,'SALE_REFUNDED',{sale_id:p.sale_id,created_at:'2026-10-30 13:00:00'}));await notify(p);
 const after=await row(o);assert.equal(after.payment_status,'refunded');assert.equal(after.paid_at,before.paid_at);assert.equal(after.photos_expires_at,before.photos_expires_at);
});
test('G: timestamps iguais não restauram pendência após expiração e aprovação pode recuperar tentativa expirada',async()=>{
 const o=await prepared(),expired=payload(o,'PIX_EXPIRED');await notify(expired);await notify(payload(o,'PIX_GENERATED',{sale_id:expired.sale_id}));assert.equal((await row(o)).payment_status,'cancelled');
 await notify(payload(o,'SALE_APPROVED',{sale_id:expired.sale_id}));assert.equal((await row(o)).payment_status,'approved');assert.equal((await row(o)).production_status,'awaiting_production');
});
test('G: a mesma venda não pode ser vinculada a dois pedidos; outra venda aprovada exige revisão',async()=>{
 const a=await prepared(),b=await prepared(),p=payload(a);await notify(p);
 const conflict=await notify({...p,utm:{src:b.url.searchParams.get('src')}});assert.equal(conflict.response.status,422);assert.equal((await row(b)).payment_status,'pending');
 const review=await notify(payload(a));assert.equal(review.data.outcome,'other_sale_review');assert.equal((await row(a)).payment_id,p.sale_id);
});
test('G: notificações concorrentes aprovam uma única vez sem perder o reembolso',async()=>{
 const o=await prepared(),p=payload(o);const responses=await Promise.all([notify(p),notify(p),notify(payload(o,'SALE_REFUNDED',{sale_id:p.sale_id,created_at:'2026-10-30 13:00:00'}))]);
 assert.ok(responses.every(r=>r.response.status===200));assert.equal((await row(o)).payment_status,'refunded');
});
test('H: parâmetros da página de obrigado nunca confirmam pagamento e a sessão continua obrigatória',async()=>{
 const o=await prepared();const r=await call(`/api/orders/${o.order.id}?retorno=sucesso&status=approved`,{cookie:o.cookie});assert.equal(r.data.order.paymentStatus,'pending');
 assert.equal((await call('/api/orders/'+o.order.id)).response.status,401);assert.equal((await call('/api/orders/'+o.order.id,{cookie:await session()})).response.status,404);
});
test('exclusão das fotos exige o proprietário e não apaga o pedido nem executa reembolso',async()=>{
 const o=await prepared(),saved=await row(o);assert.equal((await call(`/api/orders/${o.order.id}/photos`,{method:'DELETE',cookie:await session()})).response.status,404);
 const deleted=await call(`/api/orders/${o.order.id}/photos`,{method:'DELETE',cookie:o.cookie});assert.equal(deleted.response.status,200);assert.equal(deleted.data.order.photosAvailable,false);assert.equal(await env.BUCKET.get(saved.self_key),null);assert.equal(await env.BUCKET.get(saved.loved_key),null);assert.equal((await row(o)).payment_status,'pending');
 await notify(payload(o));assert.equal((await row(o)).payment_status,'approved');assert.ok((await row(o)).photos_deleted_at);assert.equal((await row(o)).self_key,null);
});
test('limpeza de abandonados mantém metadados e remove arquivos expirados',async()=>{
 const o=await create(),saved=await row(o);await env.DB.prepare('UPDATE orders SET photos_expires_at=? WHERE id=?').bind('2020-01-01T00:00:00.000Z',o.order.id).run();await maintenance(env);assert.equal(await env.BUCKET.head(saved.self_key),null);assert.ok((await row(o)).photos_deleted_at);assert.equal((await row(o)).scenario_key,'carinho-no-ceu');
});
