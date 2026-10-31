import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as deferImmediate } from "node:timers";
import { Window } from "happy-dom";
import { IDBFactory } from "fake-indexeddb";
import React, { act } from "react";

const browser = new Window({url:"https://trilha.test"});
globalThis.window=browser; globalThis.document=browser.document;
globalThis.HTMLElement=browser.HTMLElement;
globalThis.location=browser.location;globalThis.history=browser.history;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.localStorage=browser.localStorage;
const {createRoot}=await import("react-dom/client");
const {default:Preparation}=await import("../.sites-runtime/tests/reunion-preparation.mjs");
const {default:Funnel}=await import("../.sites-runtime/tests/funnel.mjs");
const {saveDraft,loadDraft,clearDraft}=await import("../.sites-runtime/tests/client-media.mjs");
const nativeFetch=globalThis.fetch;
let root,container,imageFailure=false,reduced=false;
const requestKey="f42bebed-7444-4df0-9704-0061e83100d9";
const orderId="ba62df60-c6b8-41eb-b0b0-548ef63f8040";
const config={storageReady:true,checkoutReady:true,mode:"simulation",testEnvironment:true,policyVersion:"2026-10-30-v1",priceCents:2790,deliveryDays:2};
const order={id:orderId,number:"TA-TESTE",scenario:"carinho",amountCents:2790,paymentStatus:"pending",productionStatus:"awaiting_payment",photosAvailable:true,isTest:true,name:null,email:null,whatsapp:null,deliveryDays:2};
const pending=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async(t,ms)=>{await act(async()=>{t.mock.timers.tick(ms);});};
const activeSlide=()=>container.querySelector('.memory-slide[aria-hidden="false"]');
const click=async(element)=>{assert.ok(element,"Controle esperado está presente");await act(async()=>{element.click();});};
const waitFor=async(predicate)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(deferImmediate);});if(await predicate())return;}assert.fail("A condição não foi concluída");};

beforeEach(()=>{
 imageFailure=false;reduced=false;
 globalThis.indexedDB=new IDBFactory();browser.localStorage.clear();
 browser.matchMedia=()=>({matches:reduced,addEventListener(){},removeEventListener(){}});
 globalThis.Image=class {onload=null;onerror=null;set src(value){this.value=value;queueMicrotask(()=>imageFailure?this.onerror?.():this.onload?.());}};
 container=document.createElement("div");document.body.append(container);root=createRoot(container);
 globalThis.fetch=async()=>Response.json(config);
});
afterEach(async()=>{await act(async()=>{root.unmount();});container.remove();globalThis.fetch=nativeFetch;});
after(()=>browser.happyDOM.abort());

async function renderPreparation(props={}){
 const callbacks={onPrepare:async()=>{},onFinalize:async()=>{},onContinue:()=>{},...props};
 await act(async()=>{root.render(React.createElement(Preparation,{startedAt:Date.now(),...callbacks}));});
 return callbacks;
}

test("os três Stories ilustrativos aparecem na ordem correta em 0, 2 e 4 segundos",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 let advances=0;await renderPreparation({onContinue:()=>advances++});
 const sources=Array.from(container.querySelectorAll('.memory-slide img'),image=>image.getAttribute('src'));
 assert.deepEqual(sources,["/media/stories/abraco-na-varanda.webp","/media/stories/cafe-em-familia.webp","/media/escadaria.webp"]);
 assert.match(activeSlide().textContent,/Tem pessoas que deixam saudade/);
 await tick(t,1999);assert.match(activeSlide().textContent,/Tem pessoas que deixam saudade/);
 await tick(t,1);assert.match(activeSlide().textContent,/Uma fotografia pode trazer/);
 await tick(t,2000);assert.match(activeSlide().textContent,/compartilhar com quem também/);
 assert.equal(container.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),"66");
 await tick(t,2000);assert.equal(advances,0);assert.ok(container.querySelector('.is-leaving'));
 assert.equal(container.querySelector('.story-progress button:last-child span').style.transform,'scaleX(1)');
 await tick(t,280);assert.equal(advances,1);
 await tick(t,6000);assert.equal(advances,1);
});

test("seis segundos não liberam a oferta enquanto o salvamento estiver pendente",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 const saving=pending();let advances=0,finalizes=0;
 await renderPreparation({onPrepare:()=>saving.promise,onFinalize:async()=>finalizes++,onContinue:()=>advances++});
 await tick(t,6000);
 assert.equal(container.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),"100");
 assert.equal(container.querySelector('.transition-continue').disabled,true);assert.equal(advances,0);assert.equal(finalizes,0);
 await act(async()=>{saving.resolve();});
 await tick(t,280);assert.equal(advances,1);assert.equal(finalizes,1);
});

test("Continuar permite avanço antecipado somente após salvar, com uma única navegação",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 const saving=pending();let advances=0,finalizes=0;
 await renderPreparation({onPrepare:()=>saving.promise,onFinalize:async()=>finalizes++,onContinue:()=>advances++});
 const button=container.querySelector('.transition-continue');
 assert.equal(button.disabled,true);await click(button);assert.equal(finalizes,0);
 await act(async()=>saving.resolve());assert.equal(button.disabled,false);
 await act(async()=>{button.click();button.click();});await tick(t,280);
 assert.equal(finalizes,1);assert.equal(advances,1);
});

test("swipe e indicadores respeitam a imagem escolhida e não repetem o carrossel",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 await renderPreparation({onPrepare:()=>pending().promise});
 const frame=container.querySelector('.memory-carousel-window');
 await act(async()=>{
  frame.dispatchEvent(new browser.PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:250,clientY:100}));
  frame.dispatchEvent(new browser.PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:100,clientY:105}));
 });
 assert.match(activeSlide().textContent,/Uma fotografia pode trazer/);
 await tick(t,4500);assert.match(activeSlide().textContent,/Uma fotografia pode trazer/);
 await click(container.querySelector('[aria-label="Ver imagem 3 de 3"]'));
 await act(async()=>{
  frame.dispatchEvent(new browser.PointerEvent('pointerdown',{bubbles:true,pointerId:2,clientX:250,clientY:100}));
  frame.dispatchEvent(new browser.PointerEvent('pointerup',{bubbles:true,pointerId:2,clientX:100,clientY:100}));
 });
 await tick(t,1500);assert.match(activeSlide().textContent,/compartilhar com quem também/);
 assert.equal(container.querySelector('[aria-label="Ver imagem 3 de 3"]').getAttribute('aria-current'),'true');
});

test("falha de rede mostra erro e o retry retoma o salvamento sem liberar um sucesso falso",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 let attempts=0,advances=0;
 await renderPreparation({onPrepare:async()=>{if(++attempts===1)throw new Error("Falha de rede ao salvar as fotos.");},onContinue:()=>advances++});
 assert.match(container.querySelector('[role="alert"]').textContent,/Falha de rede/);
 await tick(t,6000);assert.equal(advances,0);
 await click(container.querySelector('.transition-error button'));
 assert.equal(attempts,2);assert.equal(container.querySelector('[role="alert"]'),null);
 await tick(t,6000);await tick(t,280);assert.equal(advances,1);
});

test("falha ao carregar uma imagem exige nova tentativa e mantém Continuar desabilitado",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 imageFailure=true;let advances=0;await renderPreparation({onContinue:()=>advances++});
 assert.match(container.querySelector('[role="alert"]').textContent,/carregar as imagens/);
 await tick(t,6000);assert.equal(advances,0);assert.equal(container.querySelector('.transition-continue').disabled,true);
 imageFailure=false;await click(container.querySelector('.transition-error button'));
 await tick(t,6000);await tick(t,280);assert.equal(advances,1);
});

test("falha no checkpoint da próxima etapa impede o fade e permite tentar novamente",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 let writes=0,advances=0;
 await renderPreparation({onFinalize:async()=>{if(++writes===1)throw new Error("Não foi possível salvar a próxima etapa.");},onContinue:()=>advances++});
 await tick(t,6000);assert.equal(advances,0);assert.match(container.querySelector('[role="alert"]').textContent,/salvar a próxima etapa/);
 assert.equal(container.querySelector('.is-leaving'),null);
 await click(container.querySelector('.transition-error button'));
 await tick(t,6000);await tick(t,280);assert.equal(advances,1);
});

test("movimento reduzido mantém as imagens sob controle manual e dispensa o fade animado",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 reduced=true;let advances=0;await renderPreparation({onContinue:()=>advances++});
 await tick(t,4000);assert.match(activeSlide().textContent,/Tem pessoas que deixam saudade/);
 await click(container.querySelector('[aria-label="Ver imagem 2 de 3"]'));assert.match(activeSlide().textContent,/Uma fotografia pode trazer/);
 await tick(t,2000);await tick(t,0);assert.equal(advances,1);
});

test("o rascunho restaura fotos, cenário, etapa e chave após recarregar",async()=>{
 const self=new File(["foto-ficticia-a"],"self.jpg",{type:"image/jpeg"});
 const loved=new File(["foto-ficticia-b"],"loved.jpg",{type:"image/jpeg"});
 const context={scenario:"luz",requestKey,stage:"preparing",startedAt:Date.now()};
 await saveDraft(self,loved,context);const restored=await loadDraft();
 assert.deepEqual(restored.context,context);assert.equal(await restored.self.text(),"foto-ficticia-a");assert.equal(await restored.loved.text(),"foto-ficticia-b");
 await saveDraft(null,null,{...context,stage:"checkout",orderId});
 const remote=await loadDraft();assert.equal(remote.context.orderId,orderId);assert.equal(remote.self,null);assert.equal(remote.context.stage,"checkout");
 await clearDraft();assert.equal(await loadDraft(),null);
});

async function seedTransition(){
 await saveDraft(new File(["foto-a"],"a.jpg",{type:"image/jpeg"}),new File(["foto-b"],"b.jpg",{type:"image/jpeg"}),{scenario:"carinho",requestKey,stage:"preparing",startedAt:Date.now()});
}
test("a transição registra um pedido, preserva referências privadas e não repete upload ao recarregar",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 let uploads=0;const keys=[];
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/config')return Response.json(config);
  if(path==='/api/session')return Response.json({ok:true});
  if(path==='/api/orders'){uploads++;keys.push(options.body.get('requestKey'));return Response.json({order});}
  if(path==='/api/orders/'+orderId)return Response.json({order});
  throw new Error('Unexpected endpoint: '+path);
 };
 await seedTransition();await act(async()=>root.render(React.createElement(Funnel)));
 await waitFor(()=>container.querySelector('.transition-continue')?.disabled===false);
 assert.equal(uploads,1);assert.deepEqual(keys,[requestKey]);
 await tick(t,6000);await waitFor(()=>container.querySelector('.is-leaving'));await tick(t,280);
 assert.match(container.textContent,/R\$\s*27,90/);assert.match(container.textContent,/Pedido TA-TESTE/);
 const saved=await loadDraft();assert.equal(saved.context.orderId,orderId);assert.equal(saved.context.stage,'checkout');assert.equal(saved.self,null);assert.equal(saved.loved,null);
 await act(async()=>root.unmount());root=createRoot(container);
 await act(async()=>root.render(React.createElement(Funnel)));
 await waitFor(()=>container.textContent.includes('Pedido TA-TESTE'));
 assert.equal(uploads,1);assert.equal(browser.localStorage.getItem('tda_order_id'),orderId);
});

test("perder a resposta de upload e tentar novamente conserva a mesma chave e o mesmo pedido",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 let attempts=0;const keys=[];
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/config')return Response.json(config);
  if(path==='/api/session')return Response.json({ok:true});
  if(path==='/api/orders'){
   keys.push(options.body.get('requestKey'));if(++attempts===1)throw new Error('Lost network response');return Response.json({order});
  }
  if(path==='/api/orders/'+orderId)return Response.json({order});
  throw new Error('Unexpected endpoint: '+path);
 };
 await seedTransition();await act(async()=>root.render(React.createElement(Funnel)));
 await waitFor(()=>container.querySelector('.transition-error button'));
 await tick(t,6000);assert.equal(container.querySelector('.offer'),null);
 const draft=await loadDraft();assert.ok(draft.self&&draft.loved);assert.equal(draft.context.requestKey,requestKey);
 await click(container.querySelector('.transition-error button'));
 await waitFor(()=>container.querySelector('.transition-continue')?.disabled===false);
 await tick(t,6000);await waitFor(()=>container.querySelector('.is-leaving'));await tick(t,280);
 assert.deepEqual(keys,[requestKey,requestKey]);assert.match(container.textContent,/Pedido TA-TESTE/);
});

test("Strict Mode não duplica o upload da preparação",async()=>{
 let uploads=0;
 globalThis.fetch=async path=>{
  if(path==='/api/config')return Response.json(config);
  if(path==='/api/session')return Response.json({ok:true});
  if(path==='/api/orders'){uploads++;return Response.json({order});}
  if(path==='/api/orders/'+orderId)return Response.json({order});
  throw new Error('Unexpected endpoint: '+path);
 };
 await seedTransition();await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Funnel))));
 await waitFor(()=>container.querySelector('.transition-continue')?.disabled===false);
 assert.equal(uploads,1);
});

test("recarregar durante o upload cancela a espera antiga e recupera o pedido pela mesma chave",async(t)=>{
 t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:100000});
 let requests=0,created=0;const keys=[];
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/config')return Response.json(config);
  if(path==='/api/session')return Response.json({ok:true});
  if(path==='/api/orders'){
   requests++;keys.push(options.body.get('requestKey'));
   if(requests===1){created++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Old navigation aborted')),{once:true}));}
   return Response.json({order});
  }
  if(path==='/api/orders/'+orderId)return Response.json({order});
  throw new Error('Unexpected endpoint: '+path);
 };
 await seedTransition();await act(async()=>root.render(React.createElement(Funnel)));
 await waitFor(()=>requests===1);
 const saved=await loadDraft();assert.equal(saved.context.stage,'preparing');assert.ok(saved.self&&saved.loved);
 await act(async()=>root.unmount());root=createRoot(container);
 await act(async()=>root.render(React.createElement(Funnel)));
 await waitFor(()=>container.querySelector('.transition-continue')?.disabled===false);
 await tick(t,6000);await waitFor(()=>container.querySelector('.is-leaving'));await tick(t,280);
 assert.equal(created,1);assert.equal(requests,2);assert.deepEqual(keys,[requestKey,requestKey]);
 assert.match(container.textContent,/Pedido TA-TESTE/);
});

test('oferta não pede nome, e-mail ou telefone e abre pagamento sem enviar contatos',async()=>{
 let body,uploads=0;
 await saveDraft(null,null,{scenario:'carinho',requestKey,stage:'checkout',orderId});
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/config')return Response.json({...config,mode:'kirvano',testEnvironment:false,sessionReady:true});
  if(path==='/api/session')return Response.json({ok:true});
  if(path==='/api/orders/'+orderId)return Response.json({order});
  if(path===`/api/orders/${orderId}/checkout`){body=JSON.parse(options.body);return Response.json({approved:true,order:{...order,paymentStatus:'approved',productionStatus:'awaiting_production'}});}
  if(path==='/api/orders'){uploads++;throw new Error('No duplicate upload');}
  throw new Error('Unexpected endpoint: '+path);
 };
 await act(async()=>root.render(React.createElement(Funnel)));await waitFor(()=>container.querySelector('.checkout-action button'));
 assert.equal(container.querySelector('form'),null);assert.equal(container.querySelector('input[type="email"],input[type="tel"],input[name="name"]'),null);assert.equal(container.querySelector('.test-ribbon'),null);
 await click(container.querySelector('.checkout-action button'));assert.deepEqual(body,{});assert.equal(uploads,0);assert.match(container.textContent,/Seu reencontroestá a caminho/);
});

test('pós-compra consulta o status real e monta WhatsApp com o ID sem exigir conversa',async()=>{
 let requests=0;
 browser.localStorage.setItem('tda_order_id',orderId);
 const approved={...order,number:'TDA-1234567890ABCDEF',paymentStatus:'approved',productionStatus:'awaiting_production',isTest:false};
 globalThis.fetch=async path=>{
  if(path==='/api/config')return Response.json({...config,mode:'kirvano',testEnvironment:false,sessionReady:true,whatsapp:'5511999999999'});
  if(path==='/api/session')return Response.json({ok:true});
  if(path==='/api/orders/'+orderId){requests++;return Response.json({order:approved});}
  throw new Error('Unexpected endpoint: '+path);
 };
 await act(async()=>root.render(React.createElement(Funnel,{initialReturn:true})));await waitFor(()=>container.querySelector('a[href^="https://wa.me/"]'));
 const link=new URL(container.querySelector('a[href^="https://wa.me/"]').href);
 assert.equal(link.pathname,'/5511999999999');assert.equal(link.searchParams.get('text'),`Olá! 💛 Acabei de fazer meu pedido no Trilha do Amor.\n\nMeu ID é: ${approved.number}\n\nGostaria de acompanhar a criação da minha homenagem.`);
 assert.equal(requests,1);assert.match(container.querySelector('.receipt').textContent,/PagamentoConfirmado/);assert.match(container.textContent,/TDA-1234567890ABCDEF/);
});

test('retorno pendente nunca mostra aprovação mesmo com armazenamento temporariamente indisponível',async()=>{
 browser.localStorage.setItem('tda_order_id',orderId);
 globalThis.fetch=async path=>{
  if(path==='/api/config')return Response.json({...config,mode:'kirvano',testEnvironment:false,storageReady:false,sessionReady:true});
  if(path==='/api/session')return Response.json({ok:true});
  if(path==='/api/orders/'+orderId)return Response.json({order});
  throw new Error('Unexpected endpoint: '+path);
 };
 await act(async()=>root.render(React.createElement(Funnel,{initialReturn:true})));await waitFor(()=>container.textContent.includes('Estamos aguardando a confirmação'));
 assert.equal(container.textContent.includes('está a caminho'),false);assert.match(container.textContent,/TA-TESTE/);assert.equal(container.querySelector('input'),null);
});

test('falha real de armazenamento preserva as fotos e permite voltar para revisão',async()=>{
 await seedTransition();globalThis.fetch=async path=>{
  if(path==='/api/config')return Response.json({...config,storageReady:false});
  throw new Error('Unexpected endpoint: '+path);
 };
 await act(async()=>root.render(React.createElement(Funnel)));await waitFor(()=>container.querySelector('.transition-error'));
 assert.match(container.querySelector('[role="alert"]').textContent,/envio das fotos/);assert.equal(container.querySelector('.offer'),null);assert.ok((await loadDraft()).self);
 const button=[...container.querySelectorAll('.transition-error button')].find(b=>b.textContent==='Revisar fotos');await click(button);assert.ok(container.querySelector('.photo-grid'));
});

test('exclusão de fotos só é enviada após confirmação explícita na página do pedido',async()=>{
 browser.localStorage.setItem('tda_order_id',orderId);let deletions=0;
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/config')return Response.json({...config,mode:'kirvano',testEnvironment:false});
  if(path==='/api/session')return Response.json({ok:true});
  if(path==='/api/orders/'+orderId)return Response.json({order:{...order,paymentStatus:'approved'}});
  if(path===`/api/orders/${orderId}/photos`){assert.equal(options.method,'DELETE');deletions++;return Response.json({order:{...order,paymentStatus:'approved',photosAvailable:false}});}
  throw new Error('Unexpected endpoint: '+path);
 };
 await act(async()=>root.render(React.createElement(Funnel,{initialReturn:true})));await waitFor(()=>container.querySelector('.photo-privacy-control'));
 await click(container.querySelector('.photo-privacy-control .text-link'));assert.equal(deletions,0);assert.match(container.querySelector('.photo-privacy-control [role="alert"]').textContent,/definitivo/);
 await click(container.querySelector('.photo-privacy-control .secondary'));assert.equal(deletions,1);await waitFor(()=>container.textContent.includes('foram excluídas'));assert.match(container.textContent,/foram excluídas/);
});

test('pausar Stories congela o progresso e impede avanço automático até retomar',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:100000});
 let advances=0;await renderPreparation({onContinue:()=>advances++});
 await tick(t,1000);await click(container.querySelector('[aria-label="Pausar Stories"]'));
 const progress=container.querySelector('[role="progressbar"]').getAttribute('aria-valuenow');
 await tick(t,10000);assert.equal(advances,0);assert.equal(container.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),progress);
 await click(container.querySelector('[aria-label="Reproduzir Stories"]'));
 await tick(t,5000);await tick(t,280);assert.equal(advances,1);
});

test('Stories pausados mantêm Continuar disponível quando o pedido já foi salvo',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:100000});
 let advances=0;await renderPreparation({onContinue:()=>advances++});
 await click(container.querySelector('[aria-label="Pausar Stories"]'));
 await click(container.querySelector('.transition-continue'));await tick(t,280);assert.equal(advances,1);
});

test('a oferta usa o cenário real do pedido no banner ilustrativo dos quatro cenários',async()=>{
 const names={escadaria:'A escadaria dourada',carinho:'O carinho no céu',nuvens:'O abraço nas nuvens',luz:'O abraço na luz'};
 for(const [scenario,name] of Object.entries(names)){
  browser.localStorage.clear();await clearDraft();
  await saveDraft(null,null,{scenario,requestKey,stage:'checkout',orderId});
  globalThis.fetch=async path=>{
   if(path==='/api/config')return Response.json({...config,mode:'kirvano',testEnvironment:false});
   if(path==='/api/session')return Response.json({ok:true});
   if(path==='/api/orders/'+orderId)return Response.json({order:{...order,scenario}});
   throw new Error('Unexpected endpoint: '+path);
  };
  await act(async()=>root.render(React.createElement(Funnel,{key:scenario})));
  await waitFor(()=>container.querySelector('.locked-preview-image'));
  assert.equal(container.querySelector('.locked-preview-image').getAttribute('src'),`/media/${scenario}.webp`);
  assert.match(container.querySelector('.locked-preview-kicker').textContent,new RegExp(name));
  assert.match(container.querySelector('.locked-preview-badge').textContent,/Prévia ilustrativa do cenário escolhido/);
  assert.ok(container.querySelector('.golden-lock svg'));
  assert.match(container.querySelector('.checkout-action button').textContent,/CRIAR MINHA HOMENAGEM/);
  assert.match(container.textContent,/Produção manual com IA após o pagamento/);
 }
});
