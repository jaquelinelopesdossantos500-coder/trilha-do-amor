export const META_PIXEL_ID = "1278560048663680";
export const META_CONSENT_KEY = "tda_meta_consent_v1";
type Pixel = ((...args: unknown[]) => void) & {queue:unknown[][];callMethod?:(...args:unknown[])=>void;push?:Pixel;loaded?:boolean;version?:string};
declare global { interface Window {fbq?:Pixel;_fbq?:Pixel;tdaMetaReady?:boolean;} }
export function marketingAllowed(){try{return window.localStorage.getItem(META_CONSENT_KEY)==="granted";}catch{return false;}}
export function initializeMetaPixel(){
 if(typeof window==="undefined"||!marketingAllowed()||window.location.pathname.startsWith('/admin'))return false;
 if(window.tdaMetaReady)return true;
 if(!window.fbq){const pixel:Pixel=Object.assign((...args:unknown[])=>{if(pixel.callMethod)pixel.callMethod(...args);else pixel.queue.push(args);},{queue:[] as unknown[][]});pixel.push=pixel;pixel.loaded=true;pixel.version='2.0';window.fbq=pixel;window._fbq=pixel;}
 window.fbq('set','autoConfig',false,META_PIXEL_ID);
 window.fbq('init',META_PIXEL_ID);
 window.tdaMetaReady=true;
 window.fbq('track','PageView');
 const script=document.createElement('script');script.id='tda-meta-pixel';script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';document.head.appendChild(script);
 return true;
}
export function trackMetaEvent(name:'ViewContent'|'InitiateCheckout'|'Purchase'|'Contact',data:Record<string,unknown>={},eventId?:string){
 try{
  if(!initializeMetaPixel())return false;
  const key=eventId?`tda_meta_${META_PIXEL_ID}_${name}_${eventId}`:null;
  if(key&&window.localStorage.getItem(key))return false;
  window.fbq!('track',name,data,...(eventId?[{eventID:eventId}]:[]));
  if(key)window.localStorage.setItem(key,'queued');
  return true;
 }catch{return false;}
}
export function trackConfirmedPurchase(order:{id:string;isTest:boolean;paymentStatus:string;paymentTotalCents?:number|null;amountCents:number}){
 if(order.isTest||order.paymentStatus!=='approved')return false;
 const cents=order.paymentTotalCents??order.amountCents;if(!Number.isSafeInteger(cents)||cents<0)return false;
 return trackMetaEvent('Purchase',{value:cents/100,currency:'BRL',content_ids:['trilha-do-amor'],content_type:'product',num_items:1},`tda_purchase_${order.id}`);
}
