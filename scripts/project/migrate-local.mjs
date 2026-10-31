import { readFile,writeFile,mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import "../sites-env.mjs";
await mkdir(".sites-runtime",{recursive:true});
let config;
try{config=JSON.parse(await readFile("dist/server/wrangler.json","utf8"));}catch{throw new Error("Execute o build antes de aplicar as migrações locais.");}
config.main=resolve("dist/server/index.js");
config.assets={...config.assets,directory:resolve("dist/client")};
config.d1_databases=config.d1_databases.map(db=>({...db,migrations_dir:resolve("drizzle")}));
const path=resolve(".sites-runtime/migrations.wrangler.json");
await writeFile(path,JSON.stringify(config,null,2));
const result=spawnSync(process.execPath,["--import","./scripts/sites-env.mjs","./node_modules/wrangler/bin/wrangler.js","d1","migrations","apply","DB","--local","--config",path,"--persist-to",".wrangler/state"],{stdio:"inherit"});
process.exitCode=result.status||0;
