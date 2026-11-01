import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {handleApi} from '../.sites-runtime/tests/backend.mjs';
const {Miniflare}=createRequire(import.meta.resolve('wrangler/package.json'))('miniflare');
const checkoutUrl='https://pulsefy.shop/c/o8gsg5c';
const testSecret='FICTIONAL_PULSEFY_WEBHOOK_TOKEN_FOR_LOCAL_TESTS_ONLY';
let mf,env,photo,ip=0,sale=4000;
before(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'pulsefy-test-db'},r2Buckets:['BUCKET'],cf:false});
 env={DB:await mf.getD1Database('DB'),BUCKET:await mf.getR2Bucket('BUCKET'),APP_ENV:'production',PAYMENT_MODE:'pulsefy',SESSION_SECRET:'FICTIONAL_SESSION_SECRET',ENABLE_LIVE_PAYMENTS:'true',PULSEFY_CHECKOUT_URL:checkoutUrl,PULSEFY_WEBHOOK_TOKEN:testSecret,WHATSAPP_NUMBER:'5553991905194'};
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
 photo=await readFile('tests/fixtures/foto-teste.png');
});
after(()=>mf?.dispose());
async function call(path,{method='GET',data,cookie,form,headers={},environment=env,webhook=false,raw}={}){
 const response=await handleApi(new Request('https://trilha.test'+path,{method,headers:{...(!webhook?{Origin:'https://trilha.test'}:{}),'CF-Connecting-IP':'198.51.100.'+(++ip),...(cookie?{Cookie:cookie}:{}),...(data!==undefined||raw?{'Content-Type':'application/json'}:{}),...headers},body:form||raw||(data!==undefined?JSON.stringify(data):undefined)}),environment);
 return {response,data:response.headers.get('content-type')?.includes('json')?await response.json():null};
}
async function session(){const r=await call('/api/session',{method:'POST',data:{}});assert.equal(r.response.status,200);return r.response.headers.get('set-cookie').split(';')[0];}
async function create(environment=env){
 const cookie=await session(),form=new FormData(),requestKey=crypto.randomUUID();
 form.set('self',new File([photo],'pessoa-ficticia.png',{type:'image/png'}));form.set('loved',new File([photo],'foto-ficticia.png',{type:'image/png'}));form.set('scenario','carinho');form.set('requestKey',requestKey);form.set('policyVersion','2026-10-30-v1');form.set('consent','true');
 const r=await call('/api/orders',{method:'POST',form,cookie,environment});assert.equal(r.response.status,201,JSON.stringify(r.data));return {cookie,order:r.data.order};
}
async function checkout(o,environment=env){const r=await call(`/api/orders/${o.order.id}/checkout`,{method:'POST',cookie:o.cookie,data:{},environment});assert.equal(r.response.status,200,JSON.stringify(r.data));return new URL(r.data.url);}
async function prepared(environment=env){const o=await create(environment);o.url=await checkout(o,environment);return o;}
async function row(o){return env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(o.order.id).first();}
function payload(o,event='pedido_pago',overrides={}){
 const status=event==='reembolso'?'refunded':'completed';
 return {event,event_label:event==='reembolso'?'Reembolso':'Pedido pago',timestamp:'2026-10-31T12:00:00-03:00',payload:{
  order:{id:++sale,status,amount:27.9,currency:'BRL',is_renewal:false,created_at:'2026-10-31T11:59:00-03:00'},
  customer:{name:'Cliente Fictício',email:'ficcao@example.test',phone:'(53) 99190-5194',cpf:'NEVER_STORE_THIS_DOCUMENT',password:'NEVER_STORE_ACCESS_PASSWORD'},
  checkout_link:checkoutUrl,checkoutUrl,product:{id:'fictional-main-product',name:'Trilha do Amor – Reencontro em Vídeo',billing_type:'one_time',checkout_slug:'o8gsg5c'},
  payment:{method:'pix',gateway:'fictional-gateway',gateway_transaction_id:'FICTIONAL_TRANSACTION'},tracking:{src:o.url.searchParams.get('src')},
  amount:27.9,status:status==='completed'?'paid':'refunded',...overrides,
 }};
}
async function notify(body,{token=testSecret,...options}={}){return call('/api/webhooks/pulsefy',{method:'POST',data:body,webhook:true,headers:token?{Authorization:'Bearer '+token}:{},...options});}

test('Pulsefy mantém fotos privadas, cenário, referência estável e configuração sem secrets',async()=>{
 const o=await prepared(),again=await checkout(o);assert.equal(o.url.href,again.href);assert.equal(o.url.origin+o.url.pathname,checkoutUrl);assert.match(o.url.searchParams.get('src'),/^tda_[a-f0-9]{40}$/);
 const r=await row(o);assert.equal(r.scenario,'carinho');assert.equal(r.payment_provider,'pulsefy');assert.ok(await env.BUCKET.head(r.self_key));assert.ok(await env.BUCKET.head(r.loved_key));
 const config=(await call('/api/config')).data;assert.equal(config.mode,'pulsefy');assert.equal(config.checkoutReady,true);assert.equal(config.whatsapp,'5553991905194');assert.equal(JSON.stringify(config).includes(testSecret),false);
 assert.equal((await call('/api/config',{environment:{...env,PULSEFY_WEBHOOK_TOKEN:undefined}})).data.checkoutReady,true);
});
test('novas tentativas migram checkouts Pulsefy antigos sem trocar ID ou referência',async()=>{
 const legacy={...env,PAYMENT_MODE:'kirvano',KIRVANO_CHECKOUT_URL:checkoutUrl},o=await prepared(legacy),before=await row(o);
 assert.equal((await checkout(o)).href,o.url.href);const after=await row(o);assert.equal(after.id,before.id);assert.equal(after.checkout_reference,before.checkout_reference);assert.equal(after.payment_provider,'pulsefy');assert.equal(after.self_key,before.self_key);
});
test('webhook aceita Bearer sem Origin, mas rejeita ausência, token errado e query token',async()=>{
 const o=await prepared(),p=payload(o);
 for(const token of [null,'wrong','x'.repeat(48)])assert.equal((await notify(p,{token})).response.status,401);
 assert.equal((await call('/api/webhooks/pulsefy?token='+testSecret,{method:'POST',data:p,webhook:true})).response.status,401);
 assert.equal((await notify(p,{environment:{...env,PULSEFY_WEBHOOK_TOKEN:undefined}})).response.status,503);
 const approved=await notify(p);assert.equal(approved.response.status,200);assert.equal(approved.response.headers.get('location'),null);assert.equal((await row(o)).payment_status,'approved');
});
test('teste manual oficial responde 200 sem aprovar ou associar o pedido',async()=>{
 const o=await prepared(),p=payload(o,'pedido_pago',{test:true,order:{id:90001,status:'completed',amount:197,currency:'BRL'},checkout_link:'https://pulsefy.shop/c/exemplo-checkout',tracking:{utm_source:'instagram'}});
 const r=await notify(p);assert.equal(r.response.status,200);assert.equal(r.data.test,true);assert.equal((await row(o)).payment_status,'pending');assert.equal((await row(o)).paid_at,null);
});
test('envio de acesso e outros eventos nunca aprovam um pagamento',async()=>{
 const o=await prepared();for(const event of ['envio_acesso','pedido_pendente','pix_gerado','pagamento_recusado','qualquer_evento'])assert.equal((await notify(payload(o,event))).data.ignored,true);
 assert.equal((await row(o)).payment_status,'pending');
});
test('produto, checkout, moeda, preço, estado e correlação divergentes não aprovam',async()=>{
 const o=await prepared(),p=payload(o),base=p.payload;
 const changes=[{checkout_link:'https://evil.example/c/o8gsg5c'},{checkoutUrl:'https://pulsefy.shop/c/outro'},{order:{...base.order,currency:'USD'}},{order:{...base.order,amount:1},amount:1},{order:{...base.order,status:'pending'}},{status:'pending'},{tracking:{src:o.order.id}},{product:{...base.product,billing_type:'recurring'}},{subscription_plan:{id:1}},{offer:{id:1,price:1,currency:'BRL'}},{amount:27.91},{order_bumps:[{product_id:'extra',name:'Extra',amount:1.001,currency:'BRL'}]}];
 for(const change of changes)assert.equal((await notify({...p,payload:{...base,...change}})).response.status,422,JSON.stringify(change));
 const unmatched=await notify({...p,payload:{...base,tracking:{src:'tda_'+'a'.repeat(40)}}});assert.equal(unmatched.data.outcome,'unmatched');assert.equal((await row(o)).payment_status,'pending');
});
test('pedido pago persiste venda, contato de entrega e prazo sem divulgar CPF, senha ou fotos',async()=>{
 const o=await prepared(),r=await notify(payload(o));assert.equal(r.data.outcome,'applied');const saved=await row(o);
 assert.equal(saved.payment_status,'approved');assert.equal(saved.production_status,'awaiting_production');assert.equal(saved.payment_total_cents,2790);assert.equal(saved.payment_currency,'BRL');assert.equal(saved.whatsapp,'53991905194');assert.equal(saved.email,'ficcao@example.test');assert.ok(saved.paid_at);assert.ok(saved.delivery_due_at);assert.ok(await env.BUCKET.head(saved.self_key));
 const events=await env.DB.prepare('SELECT * FROM events WHERE order_id=?').bind(o.order.id).all();for(const secret of ['ficcao@example.test','NEVER_STORE_THIS_DOCUMENT','NEVER_STORE_ACCESS_PASSWORD'])assert.equal(JSON.stringify(events).includes(secret),false);
 assert.equal(JSON.stringify(saved).includes('NEVER_STORE_THIS_DOCUMENT'),false);assert.equal(JSON.stringify(saved).includes('NEVER_STORE_ACCESS_PASSWORD'),false);
 const publicOrder=(await call('/api/orders/'+o.order.id,{cookie:o.cookie})).data.order;assert.equal(publicOrder.paymentTotalCents,2790);assert.deepEqual(publicOrder.purchasedExtras,[]);assert.equal(JSON.stringify(publicOrder).includes('gatewayTransactionId'),false);
});
test('identificador opaco do gateway aceita pontuação sem controlar a identificação da venda',async()=>{
 const o=await prepared(),p=payload(o);p.payload.payment.gateway_transaction_id='pay:example/txn.123';
 assert.equal((await notify(p)).response.status,200);const saved=await row(o);assert.equal(saved.payment_id,String(p.payload.order.id));assert.equal(JSON.parse(saved.payment_details_json).gatewayTransactionId,'pay:example/txn.123');
});
test('order bumps preservam valor pago e itens de entrega sem alterar preço-base',async()=>{
 const o=await prepared(),p=payload(o,'pedido_pago',{order_bumps:[{product_id:'extra-restauracao',name:'Restauração de foto',amount:8.9,currency:'BRL'},{product_id:'extra-musica',name:'Música personalizada',amount:14.9,currency:'BRL'}],amount:51.7});p.payload.order.amount=51.7;
 assert.equal((await notify(p)).response.status,200);const saved=await row(o);assert.equal(saved.amount_cents,2790);assert.equal(saved.payment_total_cents,5170);
 const visible=(await call('/api/orders/'+o.order.id,{cookie:o.cookie})).data.order;assert.deepEqual(visible.purchasedExtras.map(x=>x.amountCents),[890,1490]);assert.equal(visible.paymentTotalCents,5170);
});
test('reentregas com outro timestamp não duplicam confirmação nem renovam retenção ou prazo',async()=>{
 const o=await prepared(),p=payload(o);await notify(p);const before=await row(o);const again=await notify({...p,timestamp:'2026-10-31T19:00:00Z'});assert.equal(again.data.duplicate,true);
 const after=await row(o);for(const key of ['paid_at','delivery_due_at','photos_expires_at','revision'])assert.equal(after[key],before[key]);
 assert.equal((await env.DB.prepare("SELECT count(*) n FROM payment_events WHERE provider='pulsefy' AND transaction_id=?").bind(String(p.payload.order.id)).first()).n,1);
});
test('webhook migra pedido legado do mesmo checkout antes de uma nova tentativa',async()=>{
 const o=await prepared({...env,PAYMENT_MODE:'kirvano',KIRVANO_CHECKOUT_URL:checkoutUrl}),before=await row(o);assert.equal((await notify(payload(o))).data.outcome,'applied');const after=await row(o);
 assert.equal(after.payment_provider,'pulsefy');assert.equal(after.id,before.id);assert.equal(after.checkout_reference,before.checkout_reference);assert.equal(after.payment_status,'approved');
});
test('mesma venda não aprova dois pedidos e outra venda não substitui compra quitada',async()=>{
 const a=await prepared(),b=await prepared(),p=payload(a);await notify(p);
 assert.equal((await notify({...p,payload:{...p.payload,tracking:{src:b.url.searchParams.get('src')}}})).response.status,422);assert.equal((await row(b)).payment_status,'pending');
 assert.equal((await notify(payload(a))).data.outcome,'other_sale_review');assert.equal((await row(a)).payment_id,String(p.payload.order.id));
});
test('reembolso prevalece sobre aprovação, qualquer que seja a ordem de entrega',async()=>{
 for(const refundFirst of [false,true]){
  const o=await prepared(),p=payload(o),refund={...p,event:'reembolso',payload:{...p.payload,status:'refunded',order:{...p.payload.order,status:'refunded'}}};
  await notify(refundFirst?refund:p);await notify(refundFirst?p:refund);await notify(p);
  const saved=await row(o);assert.equal(saved.payment_status,'refunded');assert.equal(saved.production_status,'cancelled');if(refundFirst)assert.equal(saved.paid_at,null);
 }
});
test('aprovações e reembolso concorrentes convergem sem restaurar compra reembolsada',async()=>{
 const o=await prepared(),p=payload(o),refund={...p,event:'reembolso',payload:{...p.payload,status:'refunded',order:{...p.payload.order,status:'refunded'}}};
 const results=await Promise.all([notify(p),notify(p),notify(refund)]);assert.ok(results.every(r=>r.response.status===200));assert.equal((await row(o)).payment_status,'refunded');
});
test('confirmação financeira continua funcionando durante indisponibilidade das fotos',async()=>{
 const o=await prepared();assert.equal((await notify(payload(o),{environment:{...env,BUCKET:undefined}})).response.status,200);assert.equal((await row(o)).payment_status,'approved');
});
test('retorno na URL não aprova e não libera pedido sem sessão proprietária',async()=>{
 const o=await prepared();assert.equal((await call(`/api/orders/${o.order.id}?status=approved`,{cookie:o.cookie})).data.order.paymentStatus,'pending');assert.equal((await call('/api/orders/'+o.order.id)).response.status,401);
 assert.equal((await call('/api/orders/'+o.order.id,{cookie:await session()})).response.status,404);
});
test('corpo inválido e payload acima do limite são rejeitados antes de persistir dados',async()=>{
 const headers={Authorization:'Bearer '+testSecret};assert.equal((await call('/api/webhooks/pulsefy',{method:'POST',webhook:true,headers,raw:'{invalid'})).response.status,400);
 assert.equal((await notify({event:'pedido_pago',payload:{large:'x'.repeat(65536)},timestamp:'2026-10-31T12:00:00Z'})).response.status,413);
});

test('recuperação exige sessão, mantém cenário/fotos e não mistura pedidos de clientes diferentes',async()=>{
 const o=await prepared(),unrelated=await prepared();
 assert.equal((await call('/api/orders/recover')).response.status,401);
 const recovered=await call('/api/orders/recover',{cookie:o.cookie});assert.equal(recovered.response.status,200);assert.equal(recovered.data.order.id,o.order.id);assert.equal(recovered.data.order.number,o.order.number);assert.equal(recovered.data.order.scenario,'carinho');assert.equal(recovered.data.order.photosAvailable,true);assert.deepEqual(recovered.data.orders,[]);assert.equal(JSON.stringify(recovered.data).includes(unrelated.order.id),false);assert.equal(JSON.stringify(recovered.data).includes('self_key'),false);assert.equal(recovered.response.headers.get('cache-control'),'no-store');
 const empty=await call('/api/orders/recover',{cookie:await session()});assert.equal(empty.data.order,null);assert.deepEqual(empty.data.orders,[]);
});
test('recuperação de vários checkouts da mesma sessão não escolhe um pedido pelo status de pagamento',async()=>{
 const o=await prepared(),other=await create();const who=(await env.DB.prepare('SELECT owner_hash FROM orders WHERE id=?').bind(o.order.id).first()).owner_hash;
 await env.DB.prepare('UPDATE orders SET owner_hash=? WHERE id=?').bind(who,other.order.id).run();other.cookie=o.cookie;await checkout(other);await notify(payload(o));
 const recovered=await call('/api/orders/recover',{cookie:o.cookie});assert.equal(recovered.data.order,null);assert.deepEqual(recovered.data.orders.map(x=>x.id).sort(),[o.order.id,other.order.id].sort());
});
test('chave repetida com outro cenário não reaproveita silenciosamente o pedido anterior',async()=>{
 const o=await create(),saved=await row(o),form=new FormData();form.set('scenario','luz');form.set('requestKey',saved.request_key);form.set('policyVersion','2026-10-30-v1');form.set('consent','true');
 const response=await call('/api/orders',{method:'POST',form,cookie:o.cookie});assert.equal(response.response.status,409);assert.equal((await row(o)).scenario,'carinho');
});
