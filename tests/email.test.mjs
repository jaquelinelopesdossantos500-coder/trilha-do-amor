import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {handleApi} from '../.sites-runtime/tests/backend.mjs';
import {confirmationEnqueue,processConfirmationEmails,resendWebhook} from '../.sites-runtime/tests/email-delivery.mjs';
import {confirmationEmail} from '../.sites-runtime/tests/order-email.mjs';
const {Miniflare}=createRequire(import.meta.resolve('wrangler/package.json'))('miniflare');
const pulsefyToken='FICTIONAL_PULSEFY_TOKEN_FOR_EMAIL_TESTS_ONLY', signingKey=Buffer.from('fictional-webhook-signing-secret-tests-only').toString('base64');
const originalFetch=globalThis.fetch;
let mf,env,sale=12000;
before(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'email-test-db'},cf:false});
 env={DB:await mf.getD1Database('DB'),APP_ENV:'production',SESSION_SECRET:'FICTIONAL_SESSION_FOR_EMAIL_TESTS',PULSEFY_WEBHOOK_TOKEN:pulsefyToken,PUBLIC_BASE_URL:'https://trilhadoamor.site',WHATSAPP_NUMBER:'5553991905194',RESEND_FROM:'Trilha do Amor <pedidos@notificacoes.example.test>',RESEND_REPLY_TO:'support@example.test',RESEND_API_KEY:'FICTIONAL_LOCAL_KEY',RESEND_WEBHOOK_SECRET:'whsec_'+signingKey,EMAIL_CONFIRMATIONS_ENABLED:'true'};
 for(const file of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await env.DB.prepare(sql).run();
});
after(async()=>{globalThis.fetch=originalFetch;await mf?.dispose();});
async function order({email='buyer@example.test',status='pending',isTest=0}={}){
 const id=crypto.randomUUID(),now=new Date().toISOString(),paymentId=String(++sale),number='TDA-'+id.replaceAll('-','').slice(0,16).toUpperCase();
 await env.DB.prepare(`INSERT INTO orders (id,number,owner_hash,request_key,scenario,scenario_key,created_at,updated_at,consent_at,policy_version,delivery_days,photos_expires_at,upload_state,payment_status,payment_provider,payment_id,checkout_url,checkout_reference,email,name,is_test,payment_total_cents,payment_currency) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
 .bind(id,number,'fictional-owner',crypto.randomUUID(),'carinho','carinho-no-ceu',now,now,now,'2026-10-30-v1',2,now,'ready',status,'pulsefy',paymentId,'https://pulsefy.shop/c/o8gsg5c','tda_'+id.replaceAll('-','').padEnd(40,'a'),email,'Cliente <Fictício>',isTest,2790,'BRL').run();
 return env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
}
function event(o,{email=o.email,type='pedido_pago',test=false}={}){
 return {event:type,timestamp:new Date().toISOString(),payload:{...(test?{test:true}:{}),order:{id:o.payment_id,status:type==='reembolso'?'refunded':'completed',amount:27.9,currency:'BRL',is_renewal:false,created_at:new Date().toISOString()},checkout_link:o.checkout_url,product:{id:'fictional-product',name:'Homenagem',billing_type:'one_time'},payment:{method:'pix'},tracking:{src:o.checkout_reference},customer:{name:o.name,...(email?{email}:{})}}};
}
const row=o=>env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(o.id).first();
const job=o=>env.DB.prepare('SELECT * FROM email_outbox WHERE order_id=?').bind(o.id).first();
async function notify(o,options={},context){return handleApi(new Request('https://trilhadoamor.site/api/webhooks/pulsefy',{method:'POST',headers:{Authorization:'Bearer '+pulsefyToken,'Content-Type':'application/json'},body:JSON.stringify(event(o,options))}),{...env,EMAIL_CONFIRMATIONS_ENABLED:context?'true':'false'},context);}
async function queued(options={}){const o=await order({status:'approved',...options});await confirmationEnqueue(env,o.id,new Date().toISOString()).run();return o;}
function signed({type='email.delivered',emailId=crypto.randomUUID(),id='msg_'+crypto.randomUUID().replaceAll('-',''),timestamp=String(Math.floor(Date.now()/1000)),extra={}}={}){
 const body=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:emailId,to:['PII_MUST_NOT_BE_PERSISTED@example.test'],...extra}});
 const signature=createHmac('sha256',Buffer.from(signingKey,'base64')).update(`${id}.${timestamp}.${body}`).digest('base64');
 return new Request('https://trilhadoamor.site/api/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature},body});
}
const accepted=id=>new Response(JSON.stringify({id}),{status:200});

test('pagamento confirmado enfileira uma confirmação e reentregas não duplicam',async()=>{
 const o=await order();assert.equal((await notify(o)).status,200);assert.equal((await row(o)).payment_status,'approved');assert.equal((await job(o)).status,'pending');
 await notify(o);await notify(o);assert.equal((await env.DB.prepare('SELECT count(*) n FROM email_outbox WHERE order_id=?').bind(o.id).first()).n,1);
});
test('aprovação e fila são atômicas quando a gravação do e-mail falha',async()=>{
 const o=await order();await env.DB.prepare(`CREATE TRIGGER email_test_failure BEFORE INSERT ON email_outbox WHEN NEW.order_id='${o.id}' BEGIN SELECT RAISE(FAIL,'fictional failure'); END`).run();
 assert.equal((await notify(o)).status,503);assert.equal((await row(o)).payment_status,'pending');assert.equal(await job(o),null);
 await env.DB.prepare('DROP TRIGGER email_test_failure').run();assert.equal((await notify(o)).status,200);assert.equal((await row(o)).payment_status,'approved');assert.ok(await job(o));
});
test('teste oficial, pedido pendente, acesso, teste interno e reembolso não geram confirmação',async()=>{
 for(const options of [{test:true},{type:'pedido_pendente'},{type:'envio_acesso'},{type:'reembolso'}]){const o=await order();await notify(o,options);assert.equal(await job(o),null);}
 const o=await order({isTest:1});await notify(o);assert.equal(await job(o),null);
});
test('destinatário ausente aguarda e reentrega autenticada pode completar o contato',async()=>{
 const o=await order({email:null});await notify(o);assert.equal((await job(o)).status,'awaiting_recipient');
 await notify(o,{email:'complete@example.test'});assert.equal((await job(o)).recipient,'complete@example.test');assert.equal((await job(o)).status,'pending');
});
test('mensagem inclui WhatsApp, número, cenário, texto simples e dados escapados',async()=>{
 const o=await order({status:'approved'});o.payment_total_cents=3680;o.payment_details_json=JSON.stringify({items:[{name:'Foto <especial>',amountCents:890}]});
 const message=confirmationEmail(o,env);assert.match(message.subject,new RegExp(o.number));assert.match(message.html,/Cliente &lt;Fictício&gt;/);assert.match(message.html,/Foto &lt;especial&gt;/);assert.match(message.text,/36,80/);assert.match(message.text,/O carinho no céu/);assert.match(message.text,/até 2 dias úteis/);
 assert.match(message.html,/https:\/\/wa.me\/5553991905194\?text=/);assert.match(message.text,new RegExp(o.number));assert.match(message.html,/Receber meu material pelo WhatsApp/);assert.doesNotMatch(message.html,/pedidos\/.*foto|<script|<svg|<video/);assert.match(message.text,/o material será entregue/i);assert.deepEqual(message.to,['buyer@example.test']);assert.equal(message.reply_to,'support@example.test');
});
test('envio aceito usa chave estável, guarda identificador e não reenvia',async()=>{
 const o=await queued();let calls=0;const emailId=crypto.randomUUID();
 const fetcher=async(url,init)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(init.redirect,'manual');assert.equal(init.headers['Idempotency-Key'],`order-confirmation/${o.id}/v1`);return accepted(emailId);};
 await processConfirmationEmails(env,{orderId:o.id,fetcher});const saved=await job(o);assert.equal(saved.status,'accepted');assert.equal(saved.resend_email_id,emailId);assert.equal(saved.payload_json,null);assert.equal(saved.delivery_status,null);
 await processConfirmationEmails(env,{orderId:o.id,fetcher});assert.equal(calls,1);
});
test('falha de rede mantém pagamento e repete corpo idêntico com mesma chave',async()=>{
 const o=await queued(),start=Date.now();let sentBody,sentKey;
 await processConfirmationEmails(env,{orderId:o.id,now:start,fetcher:async(_,init)=>{sentBody=init.body;sentKey=init.headers['Idempotency-Key'];throw new Error('NETWORK_SECRET_MUST_NOT_BE_SAVED');}});
 assert.equal((await job(o)).status,'retry');assert.equal((await row(o)).payment_status,'approved');assert.equal((await job(o)).last_error,'provider_unavailable');
 await env.DB.prepare('UPDATE orders SET name=?,email=? WHERE id=?').bind('Nome alterado','different@example.test',o.id).run();
 await processConfirmationEmails(env,{orderId:o.id,now:start+61000,fetcher:async(_,init)=>{assert.equal(init.body,sentBody);assert.equal(init.headers['Idempotency-Key'],sentKey);return accepted(crypto.randomUUID());}});assert.equal((await job(o)).status,'accepted');assert.equal((await job(o)).recipient,'buyer@example.test');
});
test('duas execuções concorrentes enviam uma única chamada ao provedor',async()=>{
 const o=await queued();let calls=0;
 const fetcher=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,80));return accepted(crypto.randomUUID());};
 await Promise.all([processConfirmationEmails(env,{orderId:o.id,fetcher}),processConfirmationEmails(env,{orderId:o.id,fetcher})]);assert.equal(calls,1);assert.equal((await job(o)).status,'accepted');
});
test('cota e indisponibilidade permitem retry; endereço inválido falha sem alterar compra',async()=>{
 for(const status of [429,500,403,422]){const o=await queued();await processConfirmationEmails(env,{orderId:o.id,fetcher:async()=>new Response(JSON.stringify({name:'validation_error'}),{status})});assert.equal((await job(o)).status,status===422?'failed':'retry');assert.equal((await row(o)).payment_status,'approved');}
});
test('após janela segura de idempotência não arrisca enviar mensagem duplicada',async()=>{
 const o=await queued();await env.DB.prepare("UPDATE email_outbox SET first_attempt_at=?,status='retry' WHERE order_id=?").bind(new Date(Date.now()-24*3600000).toISOString(),o.id).run();let calls=0;
 await processConfirmationEmails(env,{orderId:o.id,fetcher:async()=>{calls++;return accepted(crypto.randomUUID());}});assert.equal(calls,0);assert.equal((await job(o)).status,'manual_review');
});
test('reembolso cancela e-mail pendente antes do envio',async()=>{
 const o=await order();await notify(o);await notify(o,{type:'reembolso'});assert.equal((await job(o)).status,'cancelled');let calls=0;
 await processConfirmationEmails(env,{orderId:o.id,fetcher:async()=>{calls++;return accepted(crypto.randomUUID());}});assert.equal(calls,0);
});
test('processamento imediato usa waitUntil e falha no provedor não falha o webhook financeiro',async()=>{
 const o=await order(),pending=[];globalThis.fetch=async()=>new Response('{}',{status:503});
 try {const response=await notify(o,{}, {waitUntil:p=>pending.push(p)});assert.equal(response.status,200);assert.equal(pending.length,1);await Promise.all(pending);assert.equal((await job(o)).status,'retry');assert.equal((await row(o)).payment_status,'approved');}finally{globalThis.fetch=originalFetch;}
});
test('webhook Resend rejeita ausência, assinatura adulterada, corpo alterado e timestamp antigo',async()=>{
 const o=await queued(),before=await row(o);
 const noSignature=await handleApi(new Request('https://trilhadoamor.site/api/webhooks/resend',{method:'POST',body:'{}'}),env);assert.equal(noSignature.status,401);
 const request=signed();const wrong=new Request(request);wrong.headers.set('svix-signature','v1,'+Buffer.alloc(32).toString('base64'));assert.equal((await handleApi(wrong,env)).status,401);
 const stale=signed({timestamp:String(Math.floor(Date.now()/1000)-600)});assert.equal((await handleApi(stale,env)).status,401);
 const correct=signed(),body=await correct.text();const changed=new Request(correct.url,{method:'POST',headers:correct.headers,body:body+' '});assert.equal((await handleApi(changed,env)).status,401);
 assert.equal((await row(o)).payment_status,before.payment_status);
});
test('entrega assinada e duplicada atualiza só e-mail, sem guardar dados pessoais do payload',async()=>{
 const o=await queued(),emailId=crypto.randomUUID();await processConfirmationEmails(env,{orderId:o.id,fetcher:async()=>accepted(emailId)});
 const request=signed({emailId}),duplicate=request.clone();assert.equal((await handleApi(request,env)).status,200);const result=await handleApi(duplicate,env);assert.equal((await result.json()).duplicate,true);assert.equal((await job(o)).delivery_status,'delivered');assert.equal((await row(o)).payment_status,'approved');
 const audit=await env.DB.prepare('SELECT * FROM email_delivery_events WHERE resend_email_id=?').bind(emailId).all();assert.equal(audit.results.length,1);assert.equal(JSON.stringify(audit).includes('PII_MUST_NOT_BE_PERSISTED'),false);
 await resendWebhook(signed({type:'email.sent',emailId}),env);assert.equal((await job(o)).delivery_status,'delivered');
});
test('callback chega antes da resposta da API e é conciliado depois',async()=>{
 const o=await queued(),emailId=crypto.randomUUID();await processConfirmationEmails(env,{orderId:o.id,fetcher:async()=>{await resendWebhook(signed({emailId}),env);return accepted(emailId);}});assert.equal((await job(o)).delivery_status,'delivered');
});
test('rejeição e reclamação suspendem novos envios sem guardar endereço na supressão',async()=>{
 for(const type of ['email.bounced','email.complained','email.suppressed']){const email=`${type.slice(6)}@example.test`,o=await queued({email}),emailId=crypto.randomUUID();await processConfirmationEmails(env,{orderId:o.id,fetcher:async()=>accepted(emailId)});await resendWebhook(signed({type,emailId}),env);
  const another=await queued({email});let calls=0;await processConfirmationEmails(env,{orderId:another.id,fetcher:async()=>{calls++;return accepted(crypto.randomUUID());}});assert.equal(calls,0);assert.equal((await job(another)).status,'suppressed');}
 const suppressions=await env.DB.prepare('SELECT * FROM email_suppressions').all();assert.equal(JSON.stringify(suppressions).includes('@'),false);
});
test('configuração pública nunca revela credenciais de envio ou assinatura',async()=>{
 const response=await handleApi(new Request('https://trilhadoamor.site/api/config'),env),data=await response.text();for(const secret of [env.RESEND_API_KEY,env.RESEND_WEBHOOK_SECRET])assert.equal(data.includes(secret),false);
});

test('runtime real Workerd envia pela API Resend e autentica retorno de entrega',async()=>{
 const adapter=await readFile('.sites-runtime/tests/email-delivery.mjs','utf8');let calls=0;const emailId=crypto.randomUUID();
 const bindings=Object.fromEntries(Object.entries(env).filter(([key,value])=>key!=='DB'&&typeof value==='string'));
 const runtime=new Miniflare({modules:[{type:'ESModule',path:'index.mjs',contents:`import {processConfirmationEmails,resendWebhook} from './email-delivery.mjs';export default {async fetch(request,env){if(new URL(request.url).pathname==='/callback')return Response.json(await resendWebhook(request,env));return Response.json(await processConfirmationEmails(env,{orderId:new URL(request.url).searchParams.get('order')}));}};`},{type:'ESModule',path:'email-delivery.mjs',contents:adapter}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'email-workerd-test-db'},cf:false,bindings,
 outboundService:async request=>{calls++;assert.equal(new URL(request.url).hostname,'api.resend.com');assert.ok(request.headers.get('idempotency-key'));assert.equal((await request.json()).to[0],'runtime@example.test');return accepted(emailId);}});
 try{
  const DB=await runtime.getD1Database('DB');for(const file of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  const o=await order({status:'approved',email:'runtime@example.test'}),keys=Object.keys(o);await DB.prepare(`INSERT INTO orders (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(o)).run();await confirmationEnqueue({...env,DB},o.id,new Date().toISOString()).run();
  const result=await runtime.dispatchFetch('https://worker.test/?order='+o.id);assert.equal(result.status,200,await result.clone().text());assert.equal(calls,1);assert.equal((await DB.prepare('SELECT status FROM email_outbox WHERE order_id=?').bind(o.id).first()).status,'accepted');
  const callback=signed({emailId});const response=await runtime.dispatchFetch('https://worker.test/callback',{method:'POST',headers:Object.fromEntries(callback.headers),body:await callback.text()});assert.equal(response.status,200,await response.clone().text());assert.equal((await DB.prepare('SELECT delivery_status FROM email_outbox WHERE order_id=?').bind(o.id).first()).delivery_status,'delivered');
 }finally{await runtime.dispose();}
});
