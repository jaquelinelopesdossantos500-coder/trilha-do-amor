import { ApiError } from "./security";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function imageDimensions(b: Uint8Array, type: string): [number, number] | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (type === "image/png" && b.length >= 33 && [137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n) && String.fromCharCode(...b.slice(12,16)) === "IHDR") return [view.getUint32(16), view.getUint32(20)];
  if (type === "image/jpeg" && b[0] === 255 && b[1] === 216) {
    let p = 2;
    while (p + 8 < b.length) {
      if (b[p] !== 255) return null;
      while (b[p] === 255) p++;
      const marker = b[p++]; if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (p + 2 > b.length) return null;
      const len = view.getUint16(p); if (len < 2 || p + len > b.length) return null;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && len >= 8) return [view.getUint16(p+5), view.getUint16(p+3)];
      p += len;
    }
  }
  if (type === "image/webp" && b.length >= 30 && String.fromCharCode(...b.slice(0,4)) === "RIFF" && String.fromCharCode(...b.slice(8,12)) === "WEBP") {
    const kind = String.fromCharCode(...b.slice(12,16));
    if (kind === "VP8X") return [1+b[24]+(b[25]<<8)+(b[26]<<16), 1+b[27]+(b[28]<<8)+(b[29]<<16)];
    if (kind === "VP8 " && b[23] === 157 && b[24] === 1 && b[25] === 42) return [view.getUint16(26,true)&16383,view.getUint16(28,true)&16383];
    if (kind === "VP8L" && b[20] === 47) return [1+b[21]+((b[22]&63)<<8),1+(b[22]>>6)+(b[23]<<2)+((b[24]&15)<<10)];
  }
  return null;
}
export async function validateImage(file: FormDataEntryValue | null) {
  if (!file || typeof file === "string" || file.size < 64 || file.size > MAX_IMAGE_BYTES) throw new ApiError(400, "Envie uma foto JPEG, PNG ou WebP de até 10 MB.");
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new ApiError(400, "Formato não aceito. Use JPEG, PNG ou WebP.");
  const bytes = new Uint8Array(await file.arrayBuffer()), dimensions = imageDimensions(bytes, file.type);
  const complete = file.type === "image/jpeg" ? bytes[bytes.length-2]===255 && bytes[bytes.length-1]===217 :
    file.type === "image/png" ? String.fromCharCode(...bytes.slice(-8,-4)) === "IEND" :
    new DataView(bytes.buffer).getUint32(4,true) + 8 === bytes.length;
  if (!complete || !dimensions || dimensions.some(n => n < 64 || n > 8192) || dimensions[0] * dimensions[1] > 36000000) throw new ApiError(400, "A imagem não é válida ou tem dimensões excessivas. Escolha outra foto.");
  return { bytes, type: file.type };
}
