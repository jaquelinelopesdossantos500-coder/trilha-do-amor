import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {photoStorage} from '../.sites-runtime/tests/photo-storage.mjs';
import {createPhotoGateway} from '../.sites-runtime/tests/storage-gateway.mjs';
import {signedStorageHeaders,signatureMessage,encodeSignature,MAX_PHOTO_BYTES} from '../.sites-runtime/tests/storage-protocol.mjs';
import {handleApi,maintenance} from '../.sites-runtime/tests/backend.mjs';
const {Miniflare}=createRequire(import.meta.resolve('wrangler/package.json'))('miniflare');
const endpoint='https://abcdefghijklmnopqrst.supabase.co/functions/v1/tda-photo-storage';
const key='pedidos/TDA-0123456789ABCDEF/foto-cliente.png';
const originalFetch=globalThis.fetch;
let mf,env,photo,privateJwk,publicJwk,signingKey,gateway,ip=0,objects=new Map(),storageCalls=0,failLoved=false,lateCommit=null;
before(async()=>{
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey);publicJwk=await crypto.subtle.exportKey('jwk',pair.publicKey);signingKey=pair.privateKey;
 gateway=createPhotoGateway({url:'https://abcdefghijklmnopqrst.supabase.co',serverKey:'sb_secret_FICTIONAL_TEST_ONLY',publicKey:publicJwk});
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'supabase-storage-test'},cf:false});
 env={DB:await mf.getD1Database('DB'),APP_ENV:'production',SESSION_SECRET:'FICTIONAL_TEST_ONLY',PHOTO_STORAGE_PROVIDER:'supabase',SUPABASE_STORAGE_URL:endpoint,SUPABASE_STORAGE_PRIVATE_KEY:JSON.stringify(privateJwk),PAYMENT_MODE:'kirvano',ENABLE_LIVE_PAYMENTS:'true',KIRVANO_CHECKOUT_URL:'https://pay.kirvano.com/abed794c-74c4-4493-810f-b9a4708a56e4',KIRVANO_PRODUCT_ID:'FICTIONAL_PRODUCT',KIRVANO_OFFER_ID:'FICTIONAL_OFFER',KIRVANO_WEBHOOK_TOKEN:'FICTIONAL_TOKEN'};
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
 photo=await readFile('tests/fixtures/foto-teste.png');
 globalThis.fetch=async(url,options={})=>{
  if(String(url)===endpoint)return gateway(new Request(url,options));
  if(!String(url).startsWith('https://abcdefghijklmnopqrst.supabase.co/storage/v1/'))return originalFetch(url,options);
  storageCalls++;const headers=new Headers(options.headers);assert.equal(headers.get('apikey'),'sb_secret_FICTIONAL_TEST_ONLY');assert.equal(headers.has('authorization'),false,'Modern server key must not be sent as JWT');
  const pathname=new URL(url).pathname,base='/storage/v1/object/',info=pathname.startsWith(base+'info/');
  const path=decodeURIComponent(pathname.slice((info?base+'info/':base).length));
  if(options.method==='POST'){
   if(lateCommit===true&&path.includes('foto-cliente')){const bytes=Buffer.from(options.body),type=headers.get('content-type');lateCommit=()=>objects.set(path,{bytes,type});return Response.json({error:'Unknown upload outcome'},{status:503});}
   if(failLoved&&path.includes('foto-pessoa-querida'))return Response.json({error:'Storage fault'},{status:503});
   objects.set(path,{bytes:Buffer.from(options.body),type:headers.get('content-type')});return Response.json({Key:path});
  }
  if(options.method==='DELETE'){
   assert.equal(path,'trilha-do-amor-fotos');const {prefixes}=JSON.parse(Buffer.from(options.body).toString());for(const p of prefixes)objects.delete(path+'/'+p);return Response.json([]);
  }
  const object=objects.get(path);
  if(!object)return Response.json({statusCode:'404',error:'not_found',message:'Object not found'},{status:400});
  return info?Response.json({metadata:{size:object.bytes.length}}):new Response(object.bytes,{headers:{'Content-Type':object.type}});
 };
});
afterEach(()=>{failLoved=false;lateCommit=null;});
after(async()=>{globalThis.fetch=originalFetch;await mf?.dispose();});
async function call(path,{method='GET',data,cookie,form,environment=env}={}){
 const response=await handleApi(new Request('https://trilha.test'+path,{method,headers:{Origin:'https://trilha.test','CF-Connecting-IP':'198.51.100.'+(++ip),...(cookie?{Cookie:cookie}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})},body:form||(data!==undefined?JSON.stringify(data):undefined)}),environment);
 return {response,data:response.headers.get('content-type')?.includes('json')?await response.json():null};
}
async function session(){const {response}=await call('/api/session',{method:'POST',data:{}});return response.headers.get('set-cookie').split(';')[0];}
function form(requestKey=crypto.randomUUID()){
 const f=new FormData();for(const k of ['self','loved'])f.set(k,new File([photo],'foto-teste.png',{type:'image/png'}));f.set('scenario','abraco-na-luz');f.set('consent','true');f.set('policyVersion','2026-10-30-v1');f.set('requestKey',requestKey);return f;
}
async function create(cookie,requestKey){cookie||=await session();const r=await call('/api/orders',{method:'POST',cookie,form:form(requestKey)});assert.ok([200,201].includes(r.response.status),JSON.stringify(r.data));return {cookie,order:r.data.order};}
async function signed(action,objectKey='',bytes=new Uint8Array(),contentType){const headers=await signedStorageHeaders(privateJwk,action,objectKey,bytes);if(contentType)headers.set('Content-Type',contentType);return new Request(endpoint,{method:'POST',headers,body:bytes.length?new Uint8Array(bytes):undefined});}

test('Supabase configurado libera upload sem BUCKET e nunca publica a chave de assinatura',async()=>{
 const config=(await call('/api/config')).data;assert.equal(config.storageReady,true);assert.equal(config.checkoutReady,true);assert.equal('BUCKET' in env,false);assert.equal(JSON.stringify(config).includes(privateJwk.d),false);
 const missing=await call('/api/config',{environment:{...env,SUPABASE_STORAGE_PRIVATE_KEY:undefined,BUCKET:{}}});assert.equal(missing.data.storageReady,false,'Supabase must not silently fall back to R2');
});
test('gateway rejeita requisições sem assinatura antes de tocar o Storage',async()=>{
 const count=storageCalls;for(const method of ['GET','POST','DELETE'])assert.equal((await gateway(new Request(endpoint,{method}))).status,401);assert.equal(storageCalls,count);
});
test('assinatura valida ação, referência, hash do corpo, chave e validade temporal',async()=>{
 const valid=await signed('put',key,photo,'image/png'),count=storageCalls;
 for(const mutation of ['action','key','body','signature']){
  const headers=new Headers(valid.headers);let bytes=photo;
  if(mutation==='action')headers.set('x-tda-action','get');if(mutation==='key')headers.set('x-tda-key',key.replace('cliente','pessoa-querida'));if(mutation==='body')bytes=Buffer.from('tampered');if(mutation==='signature')headers.set('Authorization','Bearer '+'a'.repeat(86));
  assert.equal((await gateway(new Request(endpoint,{method:'POST',headers,body:bytes}))).status,401);
 }
 const headers=new Headers(valid.headers),old=String(Date.now()-120000);headers.set('x-tda-time',old);headers.set('Authorization','Bearer '+encodeSignature(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signingKey,signatureMessage('put',key,old,headers.get('x-tda-nonce'),headers.get('x-tda-content-sha256')))));
 assert.equal((await gateway(new Request(endpoint,{method:'POST',headers,body:photo}))).status,401);assert.equal(storageCalls,count);
});
test('gateway restringe arquivos ao bucket e às chaves esperadas, MIME e tamanho',async()=>{
 assert.equal((await gateway(await signed('put','../other-bucket/private.png',photo,'image/png'))).status,400);
 assert.equal((await gateway(await signed('put',key,photo,'image/svg+xml'))).status,415);
 const request=await signed('put',key,photo,'image/png');request.headers.set('content-length',String(MAX_PHOTO_BYTES+1));assert.equal((await gateway(request)).status,413);
 const bytes=new TextEncoder().encode(JSON.stringify({keys:['other-bucket/file']}));assert.equal((await gateway(await signed('delete','',bytes,'application/json'))).status,400);
});
test('adapter grava e recupera bytes privados, detecta ausência e exclui sem expor credenciais',async()=>{
 const store=photoStorage(env);await store.put(key,photo,{httpMetadata:{contentType:'image/png',cacheControl:'private, no-store'}});assert.ok(await store.head(key));assert.deepEqual(Buffer.from(await new Response((await store.get(key)).body).arrayBuffer()),photo);
 await store.delete(key);assert.equal(await store.head(key),null);assert.equal(await store.get(key),null);
});
test('pedido D1 e duas fotos Supabase são persistidos uma só vez, com recuperação privada',async()=>{
 const cookie=await session(),requestKey=crypto.randomUUID(),o=await create(cookie,requestKey),count=storageCalls;const again=await create(cookie,requestKey);assert.equal(again.order.id,o.order.id);assert.equal(storageCalls,count);
 const saved=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(o.order.id).first();assert.equal(saved.scenario_key,'abraco-na-luz');assert.equal(saved.upload_state,'ready');
 for(const p of [saved.self_key,saved.loved_key])assert.deepEqual(objects.get('trilha-do-amor-fotos/'+p).bytes,photo);
 const mine=await call(`/api/orders/${o.order.id}/photos/self`,{cookie});assert.equal(mine.response.status,200);assert.equal(mine.response.headers.get('cache-control'),'no-store');
 assert.equal((await call(`/api/orders/${o.order.id}/photos/self`,{cookie:await session()})).response.status,404);assert.equal((await call(`/api/orders/${o.order.id}/photos/self`)).response.status,401);
});
test('falha parcial Supabase faz rollback dos objetos e permite retry sem duplicar pedido',async()=>{
 const cookie=await session(),requestKey=crypto.randomUUID(),count=objects.size;failLoved=true;const failed=await call('/api/orders',{method:'POST',cookie,form:form(requestKey)});assert.equal(failed.response.status,503);assert.equal(objects.size,count);
 failLoved=false;const retry=await create(cookie,requestKey);assert.equal(retry.order.photosAvailable,true);assert.equal(objects.size,count+2);assert.equal((await env.DB.prepare('SELECT count(*) n FROM orders WHERE request_key=?').bind(requestKey).first()).n,1);
});
test('checkout verifica a presença real das duas fotos no Supabase antes de retornar a Kirvano',async()=>{
 const o=await create();const checkout=await call(`/api/orders/${o.order.id}/checkout`,{method:'POST',cookie:o.cookie,data:{}});assert.equal(checkout.response.status,200);assert.equal(new URL(checkout.data.url).origin+new URL(checkout.data.url).pathname,env.KIRVANO_CHECKOUT_URL);
 const row=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(o.order.id).first();objects.delete('trilha-do-amor-fotos/'+row.self_key);assert.equal((await call(`/api/orders/${o.order.id}/checkout`,{method:'POST',cookie:o.cookie,data:{}})).response.status,410);
});
test('exclusão pelo proprietário remove as duas fotos Supabase e preserva o pedido',async()=>{
 const o=await create(),row=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(o.order.id).first();assert.equal((await call(`/api/orders/${o.order.id}/photos`,{method:'DELETE',cookie:o.cookie})).response.status,200);
 assert.equal(objects.has('trilha-do-amor-fotos/'+row.self_key),false);assert.equal(objects.has('trilha-do-amor-fotos/'+row.loved_key),false);assert.ok(await env.DB.prepare('SELECT id FROM orders WHERE id=?').bind(o.order.id).first());
});
test('retenção horária exclui objetos Supabase vencidos e bloqueia acesso antes da limpeza',async()=>{
 const o=await create(),row=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(o.order.id).first();await env.DB.prepare("UPDATE orders SET photos_expires_at='2020-01-01T00:00:00.000Z' WHERE id=?").bind(o.order.id).run();assert.equal((await call(`/api/orders/${o.order.id}/photos/self`,{cookie:o.cookie})).response.status,410);await maintenance(env);assert.equal(objects.has('trilha-do-amor-fotos/'+row.self_key),false);assert.ok((await env.DB.prepare('SELECT photos_deleted_at FROM orders WHERE id=?').bind(o.order.id).first()).photos_deleted_at);
});


test('upload confirmado tardiamente é limpo mesmo após o retry substituir a tentativa falha',async()=>{
 const cookie=await session(),requestKey=crypto.randomUUID();lateCommit=true;
 const failed=await call('/api/orders',{method:'POST',cookie,form:form(requestKey)});assert.equal(failed.response.status,503);assert.equal(typeof lateCommit,'function');
 const commitLate=lateCommit;lateCommit=null;const retry=await create(cookie,requestKey);const valid=await env.DB.prepare('SELECT self_key FROM orders WHERE id=?').bind(retry.order.id).first();
 commitLate();const before=objects.size;assert.ok(before>=3);
 await env.DB.prepare("UPDATE photo_cleanup_jobs SET not_before='2020-01-01T00:00:00.000Z'").run();const result=await maintenance(env);
 assert.ok(result.cleanupChecks>=1);assert.ok(objects.has('trilha-do-amor-fotos/'+valid.self_key));assert.ok(objects.size<before);assert.equal((await env.DB.prepare('SELECT count(*) n FROM photo_cleanup_jobs').first()).n,0);
});

test('runtime real Workerd assina requisições e completa upload/leitura/exclusão sem opções incompatíveis',async()=>{
 const adapter=await readFile('.sites-runtime/tests/photo-storage.mjs','utf8');
 const runtime=new Miniflare({
  modules:[{type:'ESModule',path:'index.mjs',contents:`import {photoStorage} from './photo-storage.mjs';
export default {async fetch(request,env){
 const storage=photoStorage(env),key='pedidos/TDA-AAAAAAAAAAAAAAAA/foto-cliente.png';
 const bytes=new Uint8Array(await request.arrayBuffer());
 await storage.put(key,bytes,{httpMetadata:{contentType:'image/png',cacheControl:'private, no-store'}});
 const exists=!!await storage.head(key),file=await storage.get(key);
 const recovered=new Uint8Array(await new Response(file.body).arrayBuffer());
 await storage.delete(key);
 return Response.json({exists,bytes:[...recovered],deleted:await storage.head(key)===null});
}};`},{type:'ESModule',path:'photo-storage.mjs',contents:adapter}],
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,
  bindings:{PHOTO_STORAGE_PROVIDER:'supabase',SUPABASE_STORAGE_URL:endpoint,SUPABASE_STORAGE_PRIVATE_KEY:JSON.stringify(privateJwk)},
  outboundService:request=>gateway(request),
 });
 try{const response=await runtime.dispatchFetch('https://worker.test',{method:'POST',body:photo});assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal(result.exists,true);assert.equal(result.deleted,true);assert.deepEqual(Buffer.from(result.bytes),photo);}
 finally{await runtime.dispose();}
});
