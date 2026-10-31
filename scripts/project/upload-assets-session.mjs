// Receives a short-lived, upload-only Cloudflare token via stdin.
// It never persists or prints the input token. The completion token is returned
// only to the caller's private tool state and must not be forwarded to chat.
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdout.write("Ready for asset session JSON on stdin (input hidden).\n");
let input="";for await(const chunk of process.stdin){input+=chunk;const end=input.indexOf("\n");if(end>=0){input=input.slice(0,end);if(process.stdin.isTTY)process.stdin.setRawMode(false);break;}}
const {jwt,accountId,buckets,manifest,assetDirectory}=JSON.parse(input);
if(!/^[a-f0-9]{32}$/.test(accountId)||!jwt||!Array.isArray(buckets))throw new Error("Invalid upload session.");
const mime={".js":"application/javascript",".css":"text/css",".html":"text/html",".svg":"image/svg+xml",".webp":"image/webp",".mp4":"video/mp4",".json":"application/json",".txt":"text/plain",".ico":"image/x-icon",".woff2":"font/woff2"};
let completion=jwt;
for(const bucket of buckets){
 const form=new FormData();
 for(const hash of bucket){const entry=Object.entries(manifest).find(([,v])=>v.hash===hash);if(!entry)throw new Error("Unknown asset hash.");
  const [path]=entry;const file=resolve(assetDirectory,"."+path);if(!file.startsWith(resolve(assetDirectory)+"/"))throw new Error("Invalid asset path.");
  const bytes=await readFile(file);form.append(hash,new File([bytes.toString("base64")],hash,{type:mime[extname(path)]||"application/octet-stream"}));
 }
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/assets/upload?base64=true`,{method:"POST",headers:{Authorization:`Bearer ${jwt}`},body:form,signal:AbortSignal.timeout(60000)});
 const data=await r.json();if(!r.ok||!data.success)throw new Error("Cloudflare asset upload failed: "+r.status+" "+JSON.stringify(data.errors));
 if(data.result?.jwt)completion=data.result.jwt;
}
process.stdout.write(JSON.stringify({jwt:completion,uploadedBuckets:buckets.length}));
