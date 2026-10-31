const DB_NAME = "trilha-do-amor-draft-v1";
export type DraftContext = { scenario: string; requestKey: string; stage: "photos" | "preparing" | "checkout"; startedAt?: number; orderId?: string };
export type PhotoDraft = { self: File | null; loved: File | null; expires: number; context?: DraftContext };
async function database() {
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore("draft");
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
export async function saveDraft(self: File|null,loved: File|null,context?: DraftContext) {
  const db=await database();
  try { await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("draft","readwrite");
    tx.objectStore("draft").put({self,loved,context,expires:Date.now()+12*3600000},"photos");
    tx.oncomplete=()=>resolve(); tx.onerror=tx.onabort=()=>reject(new Error("Não foi possível salvar suas fotos neste navegador. Tente novamente."));
  }); } finally { db.close(); }
}
export async function loadDraft(): Promise<PhotoDraft|null> {
  const db=await database();
  try { return await new Promise((resolve,reject)=>{
    const tx=db.transaction("draft","readwrite"), store=tx.objectStore("draft"), req=store.get("photos");
    let result: PhotoDraft|null=null;
    req.onsuccess=()=>{
      const value=req.result;
      if (!value || !Number.isFinite(value.expires) || value.expires<Date.now()) { store.delete("photos"); return; }
      const file=(entry:unknown):File|null=>entry instanceof Blob && entry.size>0 ? entry instanceof File ? entry : new File([entry],"foto.jpg",{type:entry.type}) : null;
      const self=file(value.self),loved=file(value.loved),ctx=value.context;
      const context=ctx && typeof ctx.scenario==="string" && /^[a-f0-9-]{36}$/.test(ctx.requestKey||"") && ["photos","preparing","checkout"].includes(ctx.stage) ? ctx as DraftContext : undefined;
      if (!self&&!loved&&!context?.orderId) {store.delete("photos");return;}
      result={self,loved,expires:value.expires,context};
    };
    tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(new Error("Não foi possível recuperar suas fotos salvas."));
  }); } finally { db.close(); }
}
export async function clearDraft() {
  const db=await database();
  try { await new Promise<void>((resolve,reject)=>{const tx=db.transaction("draft","readwrite");tx.objectStore("draft").clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); } finally { db.close(); }
}
export async function preparePhoto(file: File) {
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Formato de imagem não permitido. Escolha uma foto em JPG, PNG ou WebP.");
  if (file.size>10*1024*1024) throw new Error("A foto deve ter até 10 MB.");
  let image: ImageBitmap;
  try { image=await createImageBitmap(file,{imageOrientation:"from-image"}); }
  catch { throw new Error("Não conseguimos abrir essa foto. Escolha outro arquivo."); }
  try {
    if (image.width<64 || image.height<64 || image.width*image.height>36000000) throw new Error("Escolha uma foto nítida, com tamanho entre 64 pixels e 36 megapixels.");
    const scale=Math.min(1,2048/Math.max(image.width,image.height));
    const canvas=document.createElement("canvas"); canvas.width=Math.round(image.width*scale); canvas.height=Math.round(image.height*scale);
    const ctx=canvas.getContext("2d"); if(!ctx)throw new Error("Não foi possível preparar a foto neste navegador.");
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Não foi possível preparar a foto.")),"image/jpeg",0.88));
    return new File([blob],"foto.jpg",{type:"image/jpeg"}); // Re-encoding removes EXIF and location metadata.
  } finally { image.close(); }
}
