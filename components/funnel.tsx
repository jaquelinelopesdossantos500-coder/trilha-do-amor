"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Brand, Icon } from "./brand";
import { orderWhatsappUrl } from "../lib/whatsapp";
import { SCENARIOS, PRICE_CENTS, POLICY_VERSION, type publicConfig } from "../lib/configuration";
import type { PublicOrder } from "../lib/order-types";
import { preparePhoto, loadDraft, saveDraft, clearDraft } from "../lib/client-media";
import { clientUUID,storage } from "../lib/client-storage";
import ReunionPreparation from "./reunion-preparation";
import LockedMemorialPreview from "./locked-memorial-preview";
import { preloadPreparationImages } from "../lib/preparation-media";
import type { DraftContext } from "../lib/client-media";

type Config=ReturnType<typeof publicConfig>;
type Step="scenes"|"photos"|"preparing"|"checkout"|"test"|"pending"|"success";
export const money=(cents:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
export const date=(value:string|null)=>value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(value)):"A definir";
export const statusNames:Record<string,string>={awaiting_payment:"Aguardando pagamento",awaiting_production:"Aguardando produção",in_production:"Em produção",ready:"Pronto para entrega",delivered:"Entregue",cancelled:"Cancelado",approved:"Confirmado",pending:"Aguardando confirmação",rejected:"Pagamento não aprovado",refunded:"Reembolsado"};
type ApiResponse={order:PublicOrder;orders:PublicOrder[];next:string|null;events:{kind:string;detail:string|null;created_at:string}[];url?:string;approved?:boolean;simulation?:boolean;deleted:number;error?:string};
export async function api<T=ApiResponse>(path:string,options:RequestInit={}):Promise<T> {
  let r:Response; try {r=await fetch(path,{...options,cache:"no-store",credentials:"same-origin"});} catch {throw new Error("Não foi possível conectar. Confira sua internet e tente novamente.");}
  const data=await r.json().catch(()=>({error:"O serviço não respondeu. Tente novamente."})) as T & {error?:string};
  if(!r.ok)throw Object.assign(new Error(data.error||"Não foi possível concluir."),{status:r.status});return data;
}
const post=(body:unknown):RequestInit=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
function usePhotoUrl(photo:File|null) {
  const [url,setUrl]=useState("");useEffect(()=>{if(!photo){setUrl("");return;}const u=URL.createObjectURL(photo);setUrl(u);return()=>URL.revokeObjectURL(u);},[photo]);return url;
}
function Footer(){return <footer className="footer"><nav aria-label="Informações"><a href="/termos">Termos de Uso</a><span>·</span><a href="/privacidade">Privacidade</a><span>·</span><a href="/entrega">Entrega e reembolso</a></nav><p>Uma recriação artística com inteligência artificial.</p><p className="footer-sign">O amor fica. A lembrança ganha vida.</p></footer>;}

export default function Funnel({initialReturn=false}:{initialReturn?:boolean}={}) {
  const [step,setStep]=useState<Step>(initialReturn?"pending":"scenes"),[selected,setSelected]=useState(""),[playing,setPlaying]=useState<string|null>(null);
  const [self,setSelf]=useState<File|null>(null),[loved,setLoved]=useState<File|null>(null);
  const [config,setConfig]=useState<Config|null>(null),[order,setOrder]=useState<PublicOrder|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[photoBusy,setPhotoBusy]=useState<string|null>(null);
  const [preparationStartedAt,setPreparationStartedAt]=useState(0);
  const [confirmDeletion,setConfirmDeletion]=useState(false);
  const preparationWork=useRef<Promise<void>|null>(null),orderRef=useRef<PublicOrder|null>(null),restoredOrderId=useRef<string|null>(null);
  const preparationController=useRef<AbortController|null>(null);
  const requestKey=useRef(""),videos=useRef<Record<string,HTMLVideoElement|null>>({}),started=useRef(false),heading=useRef<HTMLHeadingElement>(null);
  const selfUrl=usePhotoUrl(self),lovedUrl=usePhotoUrl(loved),scene=SCENARIOS.find(s=>s.id===(order?.scenario||selected));
  function rememberOrder(o:PublicOrder){orderRef.current=o;restoredOrderId.current=o.id;setOrder(o);storage.set("tda_order_id",o.id);}
  function orderStep(o:PublicOrder):Step{return o.paymentStatus==="approved"?"success":["refunded","cancelled"].includes(o.paymentStatus)?"success":"checkout";}
  useEffect(()=>{
    if(started.current)return;started.current=true;
    requestKey.current=storage.get("tda_request_key")||clientUUID();storage.set("tda_request_key",requestKey.current);
    const saved=storage.get("tda_scene");if(SCENARIOS.some(s=>s.id===saved))setSelected(saved!);
    (async()=>{
      try {
        const draft=await loadDraft().catch(()=>null),context=draft?.context;
        if(draft){setSelf(draft.self);setLoved(draft.loved);}
        if(context&&SCENARIOS.some(s=>s.id===context.scenario)){setSelected(context.scenario);requestKey.current=context.requestKey;storage.set("tda_request_key",context.requestKey);storage.set("tda_scene",context.scenario);}
        restoredOrderId.current=new URLSearchParams(location.search).get("pedido")||context?.orderId||storage.get("tda_order_id");
        if(!initialReturn&&context?.stage==="preparing"&&((draft?.self&&draft.loved)||restoredOrderId.current)){
          setPreparationStartedAt(Number.isFinite(context.startedAt)?context.startedAt!:Date.now());setStep("preparing");return;
        }
        if(!initialReturn&&draft?.self&&draft.loved&&!restoredOrderId.current)setStep(context?.stage==="checkout"?"checkout":"photos");
        const cfg=await api<Config>("/api/config");setConfig(cfg);if(cfg.sessionReady??cfg.storageReady)await api("/api/session",post({}));
        const id=(cfg.sessionReady??cfg.storageReady)?restoredOrderId.current:null;
        if(id){try{const {order:o}=await api("/api/orders/"+encodeURIComponent(id));rememberOrder(o);setSelected(o.scenario);
          setStep((initialReturn||new URLSearchParams(location.search).has("retorno"))&&["pending","rejected"].includes(o.paymentStatus)?"pending":orderStep(o));
        }catch(e){if((e as {status:number}).status===404){storage.remove("tda_order_id");restoredOrderId.current=null;}else throw e;}}
      }catch(e){setError((e as Error).message);}
    })();
    const pause=()=>{if(document.hidden){Object.values(videos.current).forEach(v=>v?.pause());setPlaying(null);}};
    document.addEventListener("visibilitychange",pause);return()=>document.removeEventListener("visibilitychange",pause);
  },[]);
  useEffect(()=>{if(step==="photos")void preloadPreparationImages().catch(()=>{});},[step]);
  useEffect(()=>()=>preparationController.current?.abort(),[]);
  useEffect(()=>{window.scrollTo({top:0,behavior:"instant"});if(step!=="scenes")heading.current?.focus({preventScroll:true});setError("");setNotice("");setConfirmDeletion(false);},[step]);
  useEffect(()=>{
    if(!order||!["pending","success"].includes(step))return;
    const timer=setInterval(async()=>{if(document.hidden)return;try{const {order:o}=await api(`/api/orders/${order.id}`);setOrder(o);if(["approved","refunded","cancelled"].includes(o.paymentStatus))setStep("success");}catch{/* Manual refresh remains available. */}},15000);
    return()=>clearInterval(timer);
  },[order?.id,step]);
  function go(next:Step){Object.values(videos.current).forEach(v=>v?.pause());setPlaying(null);setStep(next);}
  async function select(id:string){
    if(id!==selected)preparationWork.current=null;
    setSelected(id);storage.set("tda_scene",id);setError("");Object.entries(videos.current).forEach(([k,v])=>{if(k!==id)v?.pause();});
    const video=videos.current[id];if(!video)return;
    if(!video.getAttribute("src"))video.src=`/media/${id}.mp4`;
    video.currentTime=0;video.muted=true;setPlaying(id);
    try{await video.play();}catch{setPlaying(null);setNotice("Cenário selecionado. Você já pode continuar.");}
  }
  async function photo(event:ChangeEvent<HTMLInputElement>,which:"self"|"loved"){
    const file=event.target.files?.[0];event.target.value="";if(!file)return;setPhotoBusy(which);setError("");
    try{const ready=await preparePhoto(file),a=which==="self"?ready:self,b=which==="loved"?ready:loved;
      preparationWork.current=null;if(which==="self")setSelf(ready);else setLoved(ready);await saveDraft(a,b,{scenario:selected,requestKey:requestKey.current,stage:"photos"}).catch(()=>{setNotice("Mantenha esta aba aberta para preservar suas fotos até o envio.");});
    }catch(e){setError((e as Error).message);}finally{setPhotoBusy(null);}
  }
  function prepareCheckout(){
    if((!order&&(!self||!loved))||!selected||busy)return;setPreparationStartedAt(Date.now());go("preparing");
  }
  async function persistPreparation(stage:DraftContext["stage"],startedAt:number){
    const current=orderRef.current;
    await saveDraft(current?null:self,current?null:loved,{scenario:current?.scenario||selected,requestKey:requestKey.current,stage,startedAt,orderId:current?.id||restoredOrderId.current||undefined});
  }
  async function prepareTransition(startedAt:number){
    setPreparationStartedAt(startedAt);setBusy(true);
    try{
      await persistPreparation("preparing",startedAt);
      if(!preparationWork.current){
        preparationWork.current=(async()=>{
          const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
          preparationController.current=controller;
          try{
          const cfg=await api<Config>("/api/config",{signal:controller.signal});setConfig(cfg);
          if(restoredOrderId.current&&!orderRef.current){
            if(!cfg.storageReady)throw new Error("Não foi possível recuperar seu pedido agora. Suas fotos e referências continuam preservadas; tente novamente.");
            await api("/api/session",{...post({}),signal:controller.signal});const {order:o}=await api("/api/orders/"+encodeURIComponent(restoredOrderId.current),{signal:controller.signal});rememberOrder(o);setSelected(o.scenario);
          }
          if(orderRef.current){if(!orderRef.current.photosAvailable)throw new Error("As fotos deste pedido não estão mais disponíveis. Volte ao início para reenviá-las.");return;}
          if(!cfg.storageReady)throw new Error("Não foi possível concluir o envio das fotos agora. Elas continuam salvas neste navegador; tente novamente.");
          await registerOrder(true,controller.signal);
          }finally{clearTimeout(timeout);if(preparationController.current===controller)preparationController.current=null;}
        })().catch(cause=>{preparationWork.current=null;throw cause;});
      }
      await preparationWork.current;
      await persistPreparation("preparing",startedAt);
    }finally{setBusy(false);}
  }
  async function finalizeTransition(){
    await persistPreparation("checkout",preparationStartedAt);
    if(orderRef.current){setSelf(null);setLoved(null);}
  }
  async function registerOrder(keepDraft=false,signal?:AbortSignal){
    if(orderRef.current)return orderRef.current;
    if(!self||!loved||!selected)throw new Error("Adicione as duas fotos para continuar.");
    await api("/api/session",{...post({}),signal});const form=new FormData();form.set("self",self);form.set("loved",loved);form.set("scenario",selected);form.set("consent","true");form.set("policyVersion",config?.policyVersion||POLICY_VERSION);form.set("requestKey",requestKey.current);
    const {order:o}=await api("/api/orders",{method:"POST",body:form,signal});rememberOrder(o);if(!keepDraft){await clearDraft().catch(()=>{});setSelf(null);setLoved(null);}return o;
  }
  async function pay(){
    if(busy)return;setBusy(true);setError("");
    try{const cfg=await api<Config>("/api/config");setConfig(cfg);
      if(!cfg.storageReady)throw new Error("Não foi possível enviar suas fotos agora. Elas continuam neste navegador; tente novamente em instantes.");
      const current=order||await registerOrder();
      const data=await api(`/api/orders/${current.id}/checkout`,post({}));if(data.approved){rememberOrder(data.order);go("success");}else if(data.simulation){rememberOrder(data.order);go("test");}else if(data.url){location.assign(data.url);}else throw new Error("Não foi possível iniciar o pagamento. Tente novamente em instantes.");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function simulate(status:string){if(!order)return;setBusy(true);setError("");try{const {order:o}=await api(`/api/orders/${order.id}/test-payment`,post({status}));rememberOrder(o);go(status==="approved"?"success":"pending");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function refresh(){if(!order)return;setBusy(true);setError("");try{const {order:o}=await api(`/api/orders/${order.id}/reconcile`,post({}));rememberOrder(o);if(["approved","refunded","cancelled"].includes(o.paymentStatus))go("success");else setNotice("Status consultado. Você verá a confirmação assim que o pagamento for aprovado.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function removePhotos(){
    if(!order||busy)return;setBusy(true);setError("");
    try{const {order:o}=await api(`/api/orders/${order.id}/photos`,{method:"DELETE"});rememberOrder(o);setSelf(null);setLoved(null);await clearDraft().catch(()=>{});setConfirmDeletion(false);setNotice("As duas fotografias foram excluídas. O registro do pedido foi preservado.");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function restart(){storage.remove("tda_order_id");storage.remove("tda_scene");storage.remove("tda_request_key");requestKey.current=clientUUID();storage.set("tda_request_key",requestKey.current);history.replaceState(null,"","/");preparationWork.current=null;orderRef.current=null;restoredOrderId.current=null;setOrder(null);setSelected("");setSelf(null);setLoved(null);clearDraft().catch(()=>{});go("scenes");}
  const currentIndex=step==="scenes"?1:step==="photos"?2:step==="preparing"?3:4;
  const whatsapp=orderWhatsappUrl(config?.whatsapp,order?.number);
  const showWhatsapp=!!whatsapp&&["pending","success"].includes(step);

  return <div className={`site-frame${step==="preparing"?" is-preparing":""}${showWhatsapp?" has-whatsapp":""}`}>
    {config?.testEnvironment&&<div className="test-ribbon">Ambiente de teste <span>· nenhuma cobrança real</span></div>}
    <header className="site-header"><Brand/></header>
    <main className={`funnel stage-${step}`}>
      {step!=="scenes"&&step!=="preparing"&&<div className="step-nav">{["photos","checkout","test"].includes(step)?<button className="back-button" onClick={()=>go(step==="photos"?(order?"checkout":"scenes"):step==="test"?"checkout":"photos")} disabled={busy}><Icon name="back"/> Voltar</button>:<span/>}<div className="step-indicator" aria-label={`Etapa ${currentIndex} de 4`}>{[1,2,3,4].map(n=><i key={n} className={n<=currentIndex?"done":""}/>)}</div><span className="step-count">0{currentIndex} <span>/ 04</span></span></div>}
      {step==="scenes"&&<>
        <div className="intro"><h1 ref={heading} tabIndex={-1}>Escolha o cenário</h1><p>Toque na cena e veja novamente<br className="only-tiny"/> quem fez tanta falta <span className="gold">♥</span></p></div>
        <div className="scene-grid" aria-label="Cenários para seu reencontro">{SCENARIOS.map((s,i)=><button key={s.id} className={`scene-card ${selected===s.id?"selected":""}`} onClick={()=>select(s.id)} aria-pressed={selected===s.id} aria-label={`${s.name}, selecionar e reproduzir prévia`}>
          <img src={`/media/${s.id}.webp`} alt={s.name} width="432" height="768" loading={i<2?"eager":"lazy"} fetchPriority={i<2?"high":"low"}/>
          <video ref={v=>{videos.current[s.id]=v;}} muted playsInline preload="none" className={playing===s.id?"visible":""} onEnded={()=>setPlaying(null)} onError={()=>{setPlaying(null);setNotice("Cenário selecionado. A prévia não carregou; você pode continuar.");}} aria-hidden="true"/>
          <span className="scene-shade"/><span className="scene-number">0{i+1}</span><span className="scene-choice"><Icon name="check"/></span>
          <span className="scene-caption"><span>{s.name}</span><span className="play-icon"><Icon name={playing===s.id?"spark":"play"}/></span></span>
        </button>)}</div>
        {!selected&&<p className="scene-helper"><Icon name="play"/> Escolha uma cena para começar</p>}
        {selected&&<div className="continue-dock"><button className="primary" onClick={()=>go("photos")}>CONTINUAR <Icon name="arrow"/></button><p>{SCENARIOS.find(s=>s.id===selected)?.name} <span>· selecionado</span></p></div>}
      </>}
      {step==="photos"&&<>
        <div className="intro photo-intro"><h1 ref={heading} tabIndex={-1}>Agora dê vida<br/>a esse reencontro <span className="gold">♥</span></h1><p>Envie uma foto sua e uma de quem você quer rever.</p></div>
        {order&&<div className="inline-note">O pedido {order.number} já foi registrado. Para usar outras fotos, <button className="text-link" onClick={restart}>comece um novo pedido</button>.</div>}
        <div className="photo-grid">{([{id:"self",label:"VOCÊ",text:"SUA FOTO",value:self,url:selfUrl||(order?.photosAvailable?`/api/orders/${order.id}/photos/self`:"")},{id:"loved",label:"QUEM VOCÊ QUER ENCONTRAR",text:"A FOTO DELE(A)",value:loved,url:lovedUrl||(order?.photosAvailable?`/api/orders/${order.id}/photos/loved`:"")}] as const).map(p=><div key={p.id} className="photo-field"><label htmlFor={`photo-${p.id}`} className="photo-heading">{p.label}</label><label className={`photo-drop ${p.url?"has-photo":""}`} htmlFor={`photo-${p.id}`}>
          <input id={`photo-${p.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>photo(e,p.id)} disabled={!!photoBusy||busy||!!order} aria-label={p.label==="VOCÊ"?"Selecionar sua foto":"Selecionar foto de quem você quer encontrar"}/>
          {p.url?<><img src={p.url} alt={p.label==="VOCÊ"?"Prévia da sua foto":"Prévia da foto de quem você quer encontrar"}/><span className="replace-photo"><Icon name={order?"check":"refresh"}/> {order?"Foto enviada":"Trocar foto"}</span><span className="photo-valid"><Icon name="check"/></span></>:<span className="upload-content">{photoBusy===p.id?<span className="small-spinner"/>:<Icon name="plus"/>}<strong>{photoBusy===p.id?"PREPARANDO…":p.text}</strong><span>Toque para adicionar</span></span>}
        </label></div>)}</div>
        <div className="photo-tip"><Icon name="photo"/><p>Escolha fotos nítidas, com um rosto por imagem e boa iluminação.</p></div>
        <p className="privacy-note"><Icon name="lock"/><span>Suas fotos serão usadas apenas para produzir seu pedido, conforme nossa <a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>.</span></p>
        <button className="primary" disabled={order?false:!self||!loved||!!photoBusy||busy} onClick={prepareCheckout}>{order?"CONTINUAR COM ESTE PEDIDO":"CRIAR MEU REENCONTRO"} <Icon name="arrow"/></button>
        <div className="selected-summary"><img src={`/media/${selected}.webp`} width="40" height="54" alt=""/><div><span>Seu cenário</span><strong>{SCENARIOS.find(s=>s.id===selected)?.name}</strong></div><button className="text-link" onClick={order?restart:()=>go("scenes")}>{order?"Novo pedido":"Alterar"}</button></div>
      </>}
      {step==="preparing"&&<ReunionPreparation startedAt={preparationStartedAt} onPrepare={prepareTransition} onFinalize={finalizeTransition} onContinue={()=>go("checkout")} onBack={()=>go("photos")}/>}
      {step==="checkout"&&(order||(self&&loved))&&<>
        <LockedMemorialPreview scenario={order?.scenario||selected} name={scene?.name||"Seu reencontro"}/>
        <div className="intro checkout-intro"><h1 ref={heading} tabIndex={-1}>Você está a um passo<br/>de transformar essa saudade<br/>em uma lembrança especial.</h1></div>
        <section className="offer"><div className="offer-top"><Icon name="spark"/> SEU REENCONTRO PERSONALIZADO</div><div className="offer-content"><div className="price-row"><div><span>Pagamento único</span><small>Sem taxas adicionais</small></div><strong>{money(order?.amountCents??config?.priceCents??PRICE_CENTS)}</strong></div><ul className="deliverables"><li><Icon name="film"/><span><strong>1 vídeo de 8 segundos</strong><small>Vertical · formato 9:16</small></span><Icon name="check"/></li><li><Icon name="photo"/><span><strong>3 fotografias personalizadas</strong><small>Para guardar ou compartilhar · formato 1:1</small></span><Icon name="check"/></li><li><Icon name="phone"/><span><strong>Entrega pelo WhatsApp</strong><small>Arquivos digitais para guardar</small></span><Icon name="check"/></li></ul><div className="delivery-note"><Icon name="heart"/><p>Feito com cuidado para você.<br/><span>Produção manual com IA após o pagamento. Entrega em até <strong>{order?.deliveryDays??config?.deliveryDays??2} dias úteis</strong>.</span></p></div>
          <div className="checkout-action"><p>Seus dados para entrega serão preenchidos no checkout seguro.</p><button type="button" className="primary" onClick={()=>{void pay();}} disabled={busy||!!photoBusy||(order?!order.photosAvailable:!self||!loved)}>{busy?<><span className="small-spinner"/> ABRINDO PAGAMENTO…</>:<>CRIAR MINHA HOMENAGEM <span>💛</span></>}</button></div>
          {order&&!order.photosAvailable&&<p className="error-message">O prazo das fotos terminou. Inicie um novo pedido para reenviá-las.</p>}
          <p className="secure-payment"><Icon name="lock"/>{config?.mode==="simulation"?"Checkout de teste · nenhuma cobrança real":config?.checkoutReady?"Pagamento seguro":"Pagamento único · sem mensalidade"}</p>
        </div></section><p className="art-note">Uma recriação artística com inteligência artificial, a partir das suas fotos. Os exemplos ilustram os cenários; cada resultado é único.</p>{order&&<p className="order-reference">Pedido {order.number}</p>}<button className="text-link reset-link" onClick={restart}>Começar um novo pedido</button>
      </>}
      {step==="test"&&order&&<section className="test-checkout"><div className="success-emblem"><Icon name="lock"/></div><span className="eyebrow">PAGAMENTO SIMULADO</span><h1 ref={heading} tabIndex={-1}>Vamos testar<br/>seu pedido?</h1><p>Este painel é exclusivo do desenvolvimento. Nenhum PIX, cartão ou cobrança será criado.</p><div className="test-total"><span>{order.number}</span><strong>{money(order.amountCents)}</strong></div><button className="primary" disabled={busy} onClick={()=>simulate("approved")}>SIMULAR APROVAÇÃO <Icon name="check"/></button><button className="secondary" disabled={busy} onClick={()=>simulate("pending")}>Simular pagamento pendente</button><button className="text-link" disabled={busy} onClick={()=>simulate("rejected")}>Simular pagamento recusado</button></section>}
      {step==="pending"&&!order&&<section className="status-page">
        <div className="success-emblem"><Icon name="heart"/></div>
        <span className="eyebrow">TRILHA DO AMOR</span>
        <h1 ref={heading} tabIndex={-1}>Obrigado pela<br/>confiança! <span className="gold">💛</span></h1>
        <p>Concluiu sua compra? Fale com a gente para conferir o pagamento e combinar o recebimento da sua homenagem.</p>
        {whatsapp&&<a className="primary material-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><Icon name="whatsapp"/> RECEBA SEU MATERIAL NO WHATSAPP</a>}
        <p className="subtle">Para consultar seu pedido aqui, use o mesmo navegador em que enviou as fotos. A produção começa após a confirmação do pagamento.</p>
        <button className="secondary" onClick={()=>location.reload()}>CONSULTAR MEU PEDIDO <Icon name="refresh"/></button>
        <a href="/" className="text-link">Voltar ao início</a>
      </section>}
      {step==="pending"&&order&&<section className="status-page">
        <div className="success-emblem"><Icon name="lock"/></div><span className="eyebrow">{order.number}</span>
        <h1 ref={heading} tabIndex={-1}>{order.paymentStatus==="rejected"?"O pagamento não foi aprovado":"Estamos aguardando a confirmação do seu pagamento."}</h1>
        <p>Seu pedido e suas fotos estão registrados. A produção começa após a confirmação do pagamento.</p>
        <div className="status-chip">{statusNames[order.paymentStatus]||order.paymentStatus}</div>
        {whatsapp&&<><a className="primary material-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><Icon name="whatsapp"/> RECEBA SEU MATERIAL NO WHATSAPP</a><p className="subtle">Já pagou? O atendimento pode conferir a aprovação e orientar sobre a entrega.</p></>}
        <button className={whatsapp?"secondary":"primary"} onClick={refresh} disabled={busy}>{busy?"CONSULTANDO…":"CONSULTAR PAGAMENTO"}<Icon name="refresh"/></button>
        <button className="text-link" onClick={()=>go(config?.mode==="simulation"?"test":"checkout")}>Voltar ao pagamento</button>
      </section>}
      {step==="success"&&order&&<section className="status-page"><div className="success-emblem"><Icon name={order.paymentStatus==="approved"?"check":"heart"}/></div><span className="eyebrow">{order.isTest?"CONFIRMAÇÃO DE TESTE":"OBRIGADO PELA CONFIANÇA"}</span><h1 ref={heading} tabIndex={-1}>{order.paymentStatus==="approved"?<>Seu reencontro<br/>está a caminho! <span className="gold">💛</span></>:"Atualização do seu pedido"}</h1><p>{order.paymentStatus==="approved"?"Seu pagamento foi confirmado. Vamos preparar sua homenagem com muito carinho. Receba 1 vídeo de 8 segundos e 3 fotos pelo WhatsApp, dentro do prazo indicado abaixo.":`Pagamento: ${statusNames[order.paymentStatus]||order.paymentStatus}. Entre em contato para mais informações.`}</p><dl className="receipt"><div><dt>Seu pedido</dt><dd>{order.number}</dd></div><div><dt>Cenário</dt><dd>{scene?.name}</dd></div><div><dt>Você recebe</dt><dd>1 vídeo de 8s + 3 fotos</dd></div><div><dt>{order.isTest?"Valor simulado":"Valor do pedido"}</dt><dd>{money(order.paymentTotalCents??order.amountCents)}</dd></div>{!!order.purchasedExtras?.length&&<div><dt>Adicionais</dt><dd>{order.purchasedExtras.map((item,index)=><span className="receipt-extra" key={`${item.productId}-${index}`}>{item.name} · {money(item.amountCents)}</span>)}</dd></div>}<div><dt>Entrega prevista</dt><dd>{date(order.deliveryDueAt)}</dd></div><div><dt>Pagamento</dt><dd>{statusNames[order.paymentStatus]||order.paymentStatus}</dd></div><div><dt>Produção</dt><dd className="gold">{statusNames[order.productionStatus]||order.productionStatus}</dd></div></dl>{whatsapp?<a className="primary material-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><Icon name="whatsapp"/> {order.paymentStatus==="approved"?"RECEBA SEU MATERIAL NO WHATSAPP":"FALAR COM O ATENDIMENTO"}</a>:<p className="inline-note">Consulte o contato de atendimento informado no checkout.</p>}<button className="secondary" onClick={refresh} disabled={busy}>Atualizar status <Icon name="refresh"/></button><p className="subtle">{order.productionStatus==="delivered"?"Pedido marcado como entregue pelo atendimento.":"Os arquivos serão produzidos e entregues dentro do prazo informado. O botão abre uma conversa com nosso atendimento."}</p><button className="text-link" onClick={restart}>Criar outro reencontro</button></section>}
      {order&&!["scenes","preparing","test"].includes(step)&&<details className="photo-privacy-control"><summary>Privacidade e exclusão das fotos</summary><p>As fotos têm acesso restrito e são usadas para produzir seu pedido. Consulte os prazos na <a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>.</p>{order.photosAvailable?<>{confirmDeletion?<><p role="alert">Excluir as duas fotos é definitivo e pode impedir a produção. Esta ação não cancela nem reembolsa o pagamento.</p><button className="secondary" disabled={busy} onClick={()=>{void removePhotos();}}>{busy?"EXCLUINDO…":"CONFIRMAR EXCLUSÃO DAS FOTOS"}</button><button className="text-link" disabled={busy} onClick={()=>setConfirmDeletion(false)}>Manter minhas fotos</button></>:<button className="text-link" onClick={()=>setConfirmDeletion(true)}>Excluir minhas fotos deste pedido</button>}</>:<p>As fotos deste pedido já não estão disponíveis.</p>}</details>}
      {error&&step!=="preparing"&&<p className="error-message" role="alert">{error}</p>}
      {notice&&<p className="notice-message" role="status">{notice}</p>}
    </main>
    {step!=="preparing"&&<Footer/>}
    {showWhatsapp&&<a className="whatsapp-float" href={whatsapp!} target="_blank" rel="noreferrer" aria-label="Falar com o Trilha do Amor pelo WhatsApp"><Icon name="whatsapp"/></a>}
  </div>;
}
