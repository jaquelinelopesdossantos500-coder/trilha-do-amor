import {PHOTO_BUCKET,PHOTO_TYPES,MAX_PHOTO_BYTES,validPhotoKey,verifyStorageHeaders,limitedStorageBody,bodyDigest} from "../../../lib/storage-protocol.ts";

type GatewayConfig={url:string;serverKey:string;publicKey:JsonWebKey};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export function createPhotoGateway(config:GatewayConfig){
  return async(request:Request)=>{
    try{
      // Verify before reading a potentially large body. The verified digest then binds the exact bytes.
      const signed=await verifyStorageHeaders(request,config.publicKey);
      if(!signed)return json({error:"Unauthorized"},401);
      const {action,key,digest}=signed;
      if(action!=="delete"&&!validPhotoKey(key)||action==="delete"&&key)return json({error:"Invalid object key"},400);
      const bytes=await limitedStorageBody(request,action==="put"?MAX_PHOTO_BYTES:4096);
      if(await bodyDigest(bytes)!==digest)return json({error:"Invalid request digest"},401);
      if(!config.serverKey||!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.url))return json({error:"Storage unavailable"},503);
      const headers=new Headers({apikey:config.serverKey});
      // New server keys go only on apikey. Legacy fallback is retained for existing projects.
      if(!config.serverKey.startsWith("sb_secret_"))headers.set("Authorization","Bearer "+config.serverKey);
      const base=config.url+"/storage/v1",objectPath="/"+PHOTO_BUCKET+"/"+key.split("/").map(encodeURIComponent).join("/");
      let path:string,method:string,body:ArrayBuffer|undefined;
      if(action==="put"){
        const contentType=request.headers.get("content-type")||"";
        const extension=key.split(".").at(-1),expected={jpg:"image/jpeg",png:"image/png",webp:"image/webp"}[extension||""];
        if(!bytes.length||!PHOTO_TYPES.includes(contentType as typeof PHOTO_TYPES[number])||contentType!==expected)return json({error:"Invalid image"},415);
        path="/object"+objectPath;method="POST";body=bytes.buffer;headers.set("Content-Type",contentType);headers.set("x-upsert","true");headers.set("Cache-Control","private, no-store");
      }else if(action==="delete"){
        let keys:unknown;try{keys=JSON.parse(new TextDecoder().decode(bytes)).keys;}catch{return json({error:"Invalid keys"},400);}
        if(!Array.isArray(keys)||!keys.length||keys.length>2||keys.some(k=>typeof k!=="string"||!validPhotoKey(k)))return json({error:"Invalid keys"},400);
        path="/object/"+PHOTO_BUCKET;method="DELETE";body=new TextEncoder().encode(JSON.stringify({prefixes:keys})).buffer;headers.set("Content-Type","application/json");
      }else{
        if(bytes.length)return json({error:"Unexpected body"},400);
        path=(action==="head"?"/object/info":"/object")+objectPath;method="GET";
      }
      const upstream=await fetch(base+path,{method,headers,body,redirect:"error",signal:AbortSignal.timeout(20000)});
      if(!upstream.ok){
        // Storage may wrap a 404 inside a 400 JSON response. Do not treat auth/network failures as absence.
        let status=upstream.status;
        if(status===400){try{const error=JSON.parse(new TextDecoder().decode(await limitedStorageBody(upstream,16384)));if(String(error.statusCode)==="404"||["NoSuchKey","not_found"].includes(error.code||error.error))status=404;}catch{/* Keep as unavailable. */}}
        else await upstream.body?.cancel();
        return json({error:status===404?"Not found":"Storage unavailable"},status===404?404:503);
      }
      if(action!=="get"){await upstream.body?.cancel();return json({ok:true});}
      const contentType=upstream.headers.get("Content-Type")?.split(";")[0]||"";
      if(!PHOTO_TYPES.includes(contentType as typeof PHOTO_TYPES[number])){await upstream.body?.cancel();return json({error:"Invalid stored image"},503);}
      return new Response(upstream.body,{headers:{"Content-Type":contentType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
    }catch(error){return json({error:error instanceof RangeError?"File too large":"Storage unavailable"},error instanceof RangeError?413:503);}
  };
}
