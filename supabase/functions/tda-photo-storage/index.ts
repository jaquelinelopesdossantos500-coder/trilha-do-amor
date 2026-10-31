import {createPhotoGateway} from "./handler.ts";
import {STORAGE_PUBLIC_KEY} from "./public-key.ts";
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
let serverKey="";
try{serverKey=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{/* Legacy projects may not have new keys yet. */}
serverKey ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
Deno.serve(createPhotoGateway({url:Deno.env.get("SUPABASE_URL")||"",serverKey,publicKey:STORAGE_PUBLIC_KEY}));
