"use client";
import {useEffect,useState} from 'react';
import {initializeMetaPixel,META_CONSENT_KEY,trackMetaEvent} from '../lib/meta-pixel';
export default function MetaPixel(){
 const [show,setShow]=useState(false);
 useEffect(()=>{
  if(location.pathname.startsWith('/admin'))return;
  try{setShow(!localStorage.getItem(META_CONSENT_KEY));}catch{}
  initializeMetaPixel();
  const contact=(event:MouseEvent)=>{const target=event.target instanceof Element?event.target.closest('a[href]'):null;if(target instanceof HTMLAnchorElement&&new URL(target.href).hostname==='wa.me')trackMetaEvent('Contact',{content_name:'Atendimento WhatsApp'});};
  const preferences=()=>setShow(true);
  document.addEventListener('click',contact);window.addEventListener('tda-marketing-preferences',preferences);
  return()=>{document.removeEventListener('click',contact);window.removeEventListener('tda-marketing-preferences',preferences);};
 },[]);
 function choose(allow:boolean){try{localStorage.setItem(META_CONSENT_KEY,allow?'granted':'denied');}catch{}if(allow){initializeMetaPixel();window.fbq?.('consent','grant');window.dispatchEvent(new Event('tda-marketing-enabled'));}else if(window.fbq)window.fbq('consent','revoke');setShow(false);}
 return show?<aside className="marketing-consent" aria-label="Preferências de anúncios"><p>Podemos usar o Pixel da Meta para medir visitas e compras e melhorar nossos anúncios? <a href="/privacidade">Saiba mais</a></p><div><button onClick={()=>choose(false)}>Recusar</button><button className="marketing-accept" onClick={()=>choose(true)}>Aceitar</button></div></aside>:null;
}
