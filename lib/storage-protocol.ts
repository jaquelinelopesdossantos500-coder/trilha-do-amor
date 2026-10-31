// Shared, dependency-free protocol for the Worker and the Supabase Edge Function.
export const PHOTO_BUCKET = "trilha-do-amor-fotos";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const STORAGE_CLOCK_WINDOW_MS = 60_000;
export type StorageAction = "put" | "get" | "head" | "delete";
export function validPhotoKey(key: string) {
  return /^pedidos\/TDA-[A-F0-9]{16}\/foto-(cliente|pessoa-querida)\.(jpg|png|webp)$/.test(key);
}
export async function bodyDigest(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function signatureMessage(action: string, key: string, timestamp: string, nonce: string, digest: string) {
  return new TextEncoder().encode(["tda-photo-storage/v1", "POST", action, key, timestamp, nonce, digest].join("\n"));
}
export function encodeSignature(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeSignature(value: string) {
  if (!/^[A-Za-z0-9_-]{86}$/.test(value)) return null;
  try { return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=="), char => char.charCodeAt(0)); }
  catch { return null; }
}
export async function signedStorageHeaders(privateJwk: JsonWebKey, action: StorageAction, key: string, body: Uint8Array) {
  const timestamp = String(Date.now()), nonce = crypto.randomUUID(), digest = await bodyDigest(body);
  const signingKey = await crypto.subtle.importKey("jwk", privateJwk, {name:"ECDSA",namedCurve:"P-256"}, false, ["sign"]);
  const signature = await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"}, signingKey, signatureMessage(action,key,timestamp,nonce,digest));
  return new Headers({
    Authorization: "Bearer " + encodeSignature(signature),
    "x-tda-action": action, "x-tda-key": key, "x-tda-time": timestamp,
    "x-tda-nonce": nonce, "x-tda-content-sha256": digest,
  });
}
export async function verifyStorageHeaders(request: Request, publicJwk: JsonWebKey) {
  const h=request.headers, action=h.get("x-tda-action")||"",key=h.get("x-tda-key")||"";
  const timestamp=h.get("x-tda-time")||"",nonce=h.get("x-tda-nonce")||"",digest=h.get("x-tda-content-sha256")||"";
  const signature=decodeSignature((h.get("authorization")||"").replace(/^Bearer /,""));
  if(request.method!=="POST"||!signature||!["put","get","head","delete"].includes(action)||key.length>180||
    !/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>STORAGE_CLOCK_WINDOW_MS||
    !/^[a-f0-9-]{36}$/.test(nonce)||! /^[a-f0-9]{64}$/.test(digest))return null;
  const verificationKey=await crypto.subtle.importKey("jwk",publicJwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  if(!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},verificationKey,signature,signatureMessage(action,key,timestamp,nonce,digest)))return null;
  return {action:action as StorageAction,key,digest};
}
export async function limitedStorageBody(request: Pick<Request,"headers"|"body">, limit: number) {
  const length=request.headers.get("content-length");
  if(length&&Number(length)>limit){await request.body?.cancel();throw new RangeError("body too large");}
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new RangeError("body too large");}chunks.push(value);}
  }finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
