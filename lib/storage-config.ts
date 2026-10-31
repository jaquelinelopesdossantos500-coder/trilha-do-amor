export type PhotoStorageEnv = {
  BUCKET?: R2Bucket; // Local/legacy adapter only; production selects Supabase explicitly.
  PHOTO_STORAGE_PROVIDER?: string;
  SUPABASE_STORAGE_URL?: string;
  SUPABASE_STORAGE_PRIVATE_KEY?: string;
};
function validEndpoint(value:string|undefined){
  if(!value)return false;
  try{const url=new URL(value);return url.protocol==="https:"&&/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)&&url.pathname==="/functions/v1/tda-photo-storage"&&!url.search&&!url.hash&&!url.username&&!url.password;}
  catch{return false;}
}
export function storageConfigured(env:PhotoStorageEnv){
  if(env.PHOTO_STORAGE_PROVIDER==="supabase")return validEndpoint(env.SUPABASE_STORAGE_URL)&&!!env.SUPABASE_STORAGE_PRIVATE_KEY;
  return (!env.PHOTO_STORAGE_PROVIDER||env.PHOTO_STORAGE_PROVIDER==="r2")&&!!env.BUCKET;
}
