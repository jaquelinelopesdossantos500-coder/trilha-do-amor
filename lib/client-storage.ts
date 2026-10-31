// randomUUID requires HTTPS; getRandomValues also works on local HTTP previews.
export function clientUUID() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const storage = {
  get(key:string){try{return localStorage.getItem(key);}catch{return null;}},
  set(key:string,value:string){try{localStorage.setItem(key,value);}catch{/* Session cookies still protect the current order. */}},
  remove(key:string){try{localStorage.removeItem(key);}catch{/* Storage may be disabled by the browser. */}},
};
