import {ApiError} from "./security";
import {MAX_PHOTO_BYTES,validPhotoKey,signedStorageHeaders,type StorageAction} from "./storage-protocol";
import {storageConfigured,type PhotoStorageEnv} from "./storage-config";

export class PhotoStorageError extends ApiError {
  constructor(readonly phase:"sign"|"request"|"response",readonly upstreamStatus:number|null,readonly errorType:string){
    super(503,"Não foi possível acessar suas fotos agora. Confira sua conexão e tente novamente.");
  }
}
export interface PhotoStorage {
  put(key:string,bytes:Uint8Array,options:{httpMetadata:{contentType:string;cacheControl:string}}):Promise<unknown>;
  get(key:string):Promise<{body:ReadableStream}|null>;
  head(key:string):Promise<object|null>;
  delete(keys:string|string[]):Promise<void>;
}
export function photoStorage(env:PhotoStorageEnv):PhotoStorage{
  if(!storageConfigured(env))throw new ApiError(503,"Não foi possível acessar as fotos agora. Tente novamente.");
  if(env.PHOTO_STORAGE_PROVIDER!=="supabase")return env.BUCKET!;
  async function request(action:StorageAction,key="",body:Uint8Array=new Uint8Array(),contentType?:string){
    if(key&&!validPhotoKey(key))throw new ApiError(400,"Referência de foto inválida.");
    if(body.length>MAX_PHOTO_BYTES)throw new ApiError(413,"A foto deve ter até 10 MB.");
    let phase:"sign"|"request"|"response"="sign",upstreamStatus:number|null=null;
    try{
      const headers=await signedStorageHeaders(JSON.parse(env.SUPABASE_STORAGE_PRIVATE_KEY!),action,key,body);
      if(contentType)headers.set("Content-Type",contentType);
      phase="request";
      const response=await fetch(env.SUPABASE_STORAGE_URL!,{method:"POST",headers,body:body.length?new Uint8Array(body).buffer:undefined,signal:AbortSignal.timeout(30000),redirect:"manual"});
      phase="response";upstreamStatus=response.status;
      if(response.status===404){await response.body?.cancel();return null;}
      if(!response.ok){await response.body?.cancel();throw new Error("storage unavailable");}
      return response;
    }catch(error){
      // Never propagate remote bodies, credentials or private object paths to the caller/logs.
      throw new PhotoStorageError(phase,upstreamStatus,error instanceof Error?error.name.slice(0,60):"UnknownError");
    }
  }
  return {
    async put(key,bytes,options){const response=await request("put",key,bytes,options.httpMetadata.contentType);if(!response)throw new ApiError(503,"Não foi possível guardar sua foto. Tente novamente.");await response.body?.cancel();},
    async get(key){const response=await request("get",key);return response?.body?{body:response.body}:null;},
    async head(key){const response=await request("head",key);if(!response)return null;await response.body?.cancel();return {exists:true};},
    async delete(value){const keys=Array.isArray(value)?value:[value];if(keys.some(key=>!validPhotoKey(key))||keys.length>2)throw new ApiError(400,"Referências de fotos inválidas.");if(!keys.length)return;const response=await request("delete","",new TextEncoder().encode(JSON.stringify({keys})),"application/json");if(!response)throw new ApiError(503,"Não foi possível excluir suas fotos. Tente novamente.");await response.body?.cancel();},
  };
}
