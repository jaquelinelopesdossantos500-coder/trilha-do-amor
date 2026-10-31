import { readFile,writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
const {values}=parseArgs({options:{"database-id":{type:"string"},bucket:{type:"string"},name:{type:"string",default:"trilha-do-amor"}}});
if(!/^[a-f0-9-]{36}$/.test(values["database-id"]||""))throw new Error("Informe --database-id UUID. Esse identificador não é segredo.");
const config=JSON.parse(await readFile("dist/server/wrangler.json","utf8"));
const production=JSON.parse(await readFile("cloudflare.wrangler.jsonc","utf8"));
config.account_id=production.account_id;config.routes=production.routes;config.workers_dev=production.workers_dev;
config.name=values.name;delete config.topLevelName;
config.d1_databases=[{binding:"DB",database_name:"trilha-do-amor",database_id:values["database-id"],migrations_dir:"../../drizzle"}];
config.r2_buckets=[]; // Production photographs use Supabase, not R2.
config.triggers={crons:["0 * * * *"]};
config.vars={...production.vars};
config.observability={...production.observability};
await writeFile("dist/server/cloudflare.wrangler.json",JSON.stringify(config,null,2)+"\n");
console.log("Configuração preparada em dist/server/cloudflare.wrangler.json. Nenhum recurso foi criado e nenhuma publicação foi executada.");
