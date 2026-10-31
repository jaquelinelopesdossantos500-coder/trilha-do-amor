import { readFile,writeFile } from "node:fs/promises";
import { randomBytes,pbkdf2Sync } from "node:crypto";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
let muted=false;
const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
const rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
try {
 try{await readFile(".dev.vars");throw new Error(".dev.vars já existe. Edite-o ou remova-o antes de reconfigurar.");}catch(e){if(e.code!=="ENOENT")throw e;}
 process.stdout.write("Crie uma senha administrativa local (mínimo de 12 caracteres): ");muted=true;
 const password=await rl.question("");muted=false;process.stdout.write("\n");
 if(password.length<12)throw new Error("A senha deve ter pelo menos 12 caracteres.");
 const salt=randomBytes(16).toString("hex"),rounds=100000;
 const hash=`pbkdf2:${rounds}:${salt}:${pbkdf2Sync(password,salt,rounds,32,"sha256").toString("hex")}`;
 const template=await readFile(".dev.vars.example","utf8");
 await writeFile(".dev.vars",template.replace('SESSION_SECRET=""',`SESSION_SECRET="${randomBytes(32).toString("hex")}"`).replace('ADMIN_PASSWORD_HASH=""',`ADMIN_PASSWORD_HASH="${hash}"`),{mode:0o600});
 console.log("Desenvolvimento configurado. Nenhuma cobrança real foi habilitada.");
}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();}
