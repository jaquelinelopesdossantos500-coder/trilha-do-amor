import type { AppEnv } from "./configuration";
import type { OrderRow } from "./order-types";
import { ApiError, hash, readBytes } from "./security";
import { confirmationEmail, validEmail } from "./order-email";

export type BackgroundContext = {waitUntil(promise: Promise<unknown>): void};
type EmailJob = {id:string;order_id:string;recipient:string|null;status:string;payload_json:string|null;resend_email_id:string|null;attempts:number;first_attempt_at:string|null;lease_until:string|null};
type DeliveryEvent = {id:string;event_type:string;resend_email_id:string;occurred_at:string};
const deliveryRanks: Record<string,number> = {"email.sent":10,"email.delivery_delayed":15,"email.delivered":20,"email.failed":30,"email.bounced":40,"email.suppressed":45,"email.complained":50};

/** Put this statement in the same D1 transaction as payment approval. */
export function confirmationEnqueue(env: AppEnv, orderId: string, now: string) {
  return env.DB!.prepare(`INSERT INTO email_outbox (id,order_id,recipient,status,next_attempt_at,created_at,updated_at)
    SELECT 'confirmation:'||id,id,email,CASE WHEN email IS NULL THEN 'awaiting_recipient' ELSE 'pending' END,?,?,?
    FROM orders WHERE id=? AND payment_provider='pulsefy' AND payment_status='approved' AND is_test=0
    ON CONFLICT(order_id,kind) DO NOTHING`).bind(now,now,now,orderId);
}

export function startConfirmationDelivery(env: AppEnv, context: BackgroundContext | undefined, orderId: string) {
  if (context && env.EMAIL_CONFIRMATIONS_ENABLED === "true") context.waitUntil(
    processConfirmationEmails(env,{orderId}).catch(() => { console.error("Trilha do Amor: email processing unavailable"); })
  );
}

// Only an authenticated, already matched paid-sale replay can supply a missing address.
export async function resumeConfirmation(env: AppEnv, orderId: string, paymentId: string, email: string | undefined, context?: BackgroundContext) {
  const now = new Date().toISOString();
  await env.DB!.batch([
    env.DB!.prepare("UPDATE orders SET email=COALESCE(email,?) WHERE id=? AND payment_provider='pulsefy' AND payment_status='approved' AND payment_id=? AND is_test=0")
      .bind(validEmail(email)?email:null,orderId,paymentId),
    confirmationEnqueue(env,orderId,now),
    env.DB!.prepare(`UPDATE email_outbox SET recipient=(SELECT email FROM orders WHERE id=?),status='pending',updated_at=?
      WHERE order_id=? AND status='awaiting_recipient' AND first_attempt_at IS NULL
      AND EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_status='approved' AND payment_provider='pulsefy' AND payment_id=? AND email IS NOT NULL AND is_test=0)`)
      .bind(orderId,now,orderId,orderId,paymentId),
  ]);
  startConfirmationDelivery(env,context,orderId);
}

async function recipientHash(env: AppEnv, recipient: string) {
  return hash(`${env.SESSION_SECRET}:email-suppression:${recipient.toLowerCase().trim()}`);
}

async function applyDeliveryEvents(env: AppEnv, emailId: string) {
  const job = await env.DB!.prepare("SELECT * FROM email_outbox WHERE resend_email_id=?").bind(emailId).first<EmailJob>();
  if (!job) return;
  const events = await env.DB!.prepare("SELECT * FROM email_delivery_events WHERE resend_email_id=? AND processed_at IS NULL ORDER BY received_at,id").bind(emailId).all<DeliveryEvent>();
  for (const event of events.results) {
    const rank = deliveryRanks[event.event_type];
    const now = new Date().toISOString();
    const statements = [
      env.DB!.prepare("UPDATE email_outbox SET delivery_status=?,delivery_rank=?,delivery_at=?,updated_at=? WHERE id=? AND delivery_rank<?")
        .bind(event.event_type.slice(6),rank,event.occurred_at,now,job.id,rank),
      env.DB!.prepare("UPDATE email_delivery_events SET outcome='applied',processed_at=? WHERE id=? AND processed_at IS NULL").bind(now,event.id),
    ];
    if (job.recipient && ["email.bounced","email.complained","email.suppressed"].includes(event.event_type)) statements.push(
      env.DB!.prepare("INSERT INTO email_suppressions (recipient_hash,reason,event_id,created_at) VALUES (?,?,?,?) ON CONFLICT(recipient_hash) DO NOTHING")
        .bind(await recipientHash(env,job.recipient),event.event_type.slice(6),event.id,now)
    );
    await env.DB!.batch(statements);
  }
}

/** Durable outbox, plus provider idempotency for timeouts and concurrent retries. */
export async function processConfirmationEmails(env: AppEnv, options: {orderId?:string;now?:number;fetcher?:typeof fetch} = {}) {
  if (!env.DB || env.EMAIL_CONFIRMATIONS_ENABLED !== "true" || !env.RESEND_API_KEY || !env.RESEND_FROM || !env.SESSION_SECRET) return {processed:0};
  const millis = options.now ?? Date.now(), now = new Date(millis).toISOString();
  const jobs = await env.DB.prepare(`SELECT * FROM email_outbox WHERE status IN ('pending','retry','sending') AND next_attempt_at<=?
    AND (lease_until IS NULL OR lease_until<=?) ${options.orderId ? "AND order_id=?" : ""} ORDER BY next_attempt_at,id LIMIT ${options.orderId ? 1 : 5}`)
    .bind(...[now,now,...(options.orderId?[options.orderId]:[])]).all<EmailJob>();
  let processed = 0;
  for (const candidate of jobs.results) {
    // Resend keeps idempotency keys for 24h. Stop before expiry if acceptance was ambiguous.
    if (candidate.first_attempt_at && millis-Date.parse(candidate.first_attempt_at)>=23*3600000) {
      await env.DB.prepare("UPDATE email_outbox SET status='manual_review',last_error='idempotency_window_elapsed',updated_at=? WHERE id=? AND (lease_until IS NULL OR lease_until<=?)").bind(now,candidate.id,now).run(); continue;
    }
    const lease = new Date(millis+120000).toISOString();
    const claimed = await env.DB.prepare(`UPDATE email_outbox SET status='sending',lease_until=?,attempts=attempts+1,updated_at=?
      WHERE id=? AND status IN ('pending','retry','sending') AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?)`)
      .bind(lease,now,candidate.id,now,now).run();
    if (!claimed.meta.changes) continue;
    processed++;
    const job = await env.DB.prepare("SELECT * FROM email_outbox WHERE id=?").bind(candidate.id).first<EmailJob>();
    if (!job) continue;
    const finish = async (status:string, error:string|null, delay=0) => {
      await env.DB!.prepare("UPDATE email_outbox SET status=?,last_error=?,next_attempt_at=?,lease_until=NULL,updated_at=? WHERE id=? AND status='sending' AND lease_until=?")
        .bind(status,error,new Date(millis+delay).toISOString(),now,job.id,lease).run();
    };
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(job.order_id).first<OrderRow>();
    if (!order || order.payment_status !== "approved" || order.payment_provider !== "pulsefy" || order.is_test) { await finish("cancelled",null); continue; }
    if (!validEmail(job.recipient)) { await finish("awaiting_recipient","missing_recipient"); continue; }
    if (await env.DB.prepare("SELECT 1 FROM email_suppressions WHERE recipient_hash=?").bind(await recipientHash(env,job.recipient)).first()) { await finish("suppressed","recipient_suppressed"); continue; }
    let payload = job.payload_json;
    if (!payload) {
      try { payload = JSON.stringify(confirmationEmail({...order,email:job.recipient},env)); }
      catch { await finish("retry","email_configuration_incomplete",300000); continue; }
      await env.DB.prepare("UPDATE email_outbox SET payload_json=? WHERE id=? AND status='sending' AND lease_until=?").bind(payload,job.id,lease).run();
    }
    await env.DB.prepare("UPDATE email_outbox SET first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=? AND status='sending' AND lease_until=?").bind(now,job.id,lease).run();
    const retryDelay = Math.min(3600000,60000 * 5 ** Math.min(job.attempts-1,3));
    try {
      const response = await (options.fetcher || fetch)("https://api.resend.com/emails",{method:"POST",redirect:"manual",signal:AbortSignal.timeout(8000),
        headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":`order-confirmation/${order.id}/v1`},body:payload});
      const bytes = await readBytes(new Request("https://response.invalid",{method:"POST",body:response.body,duplex:"half"} as RequestInit),16384);
      let data: {id?:unknown;name?:unknown} = {};
      try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* Retry an ambiguous response with the original payload and key. */ }
      if (response.ok && typeof data.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(data.id)) {
        await env.DB.prepare("UPDATE email_outbox SET status='accepted',resend_email_id=?,accepted_at=?,payload_json=NULL,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND status='sending' AND lease_until=?")
          .bind(data.id,now,now,job.id,lease).run();
        await applyDeliveryEvents(env,data.id);
      } else if (response.status===409 && data.name==="invalid_idempotent_request") await finish("manual_review","idempotency_payload_conflict");
      else if (response.status===429 || response.status>=500 || response.status===401 || response.status===403 || response.status===409 || response.ok) await finish("retry",`provider_http_${response.status}`,retryDelay);
      else await finish("failed",`provider_http_${response.status}`);
    } catch { await finish("retry","provider_unavailable",retryDelay); }
    if (!options.orderId && jobs.results.length>1) await new Promise(resolve=>setTimeout(resolve,600));
  }
  return {processed};
}

export async function resendWebhook(request: Request, env: AppEnv) {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_")) throw new ApiError(503,"Notificações de e-mail não configuradas.");
  const id = request.headers.get("svix-id") || "", timestamp = request.headers.get("svix-timestamp") || "", signatures = request.headers.get("svix-signature") || "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now()/1000-Number(timestamp))>300 || signatures.length>1024) throw new ApiError(401,"Notificação não autenticada.");
  const bytes = await readBytes(request,65536);
  let valid = false;
  try {
    const key = await crypto.subtle.importKey("raw",Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0)),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    const prefix = new TextEncoder().encode(`${id}.${timestamp}.`), signed = new Uint8Array(prefix.length+bytes.length); signed.set(prefix); signed.set(bytes,prefix.length);
    for (const signature of signatures.split(" ").slice(0,5)) {
      const [version,value] = signature.split(",");
      if (version==="v1" && value) valid = await crypto.subtle.verify("HMAC",key,Uint8Array.from(atob(value),c=>c.charCodeAt(0)),signed) || valid;
    }
  } catch { valid = false; }
  if (!valid) throw new ApiError(401,"Notificação não autenticada.");
  let event: {type?:unknown;created_at?:unknown;data?:{email_id?:unknown}};
  try { event = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApiError(400,"Dados inválidos."); }
  if (!event || typeof event.type!=="string" || !deliveryRanks[event.type]) return {received:true,ignored:true};
  const emailId = event.data?.email_id;
  if (typeof emailId!=="string" || !/^[A-Za-z0-9_-]{1,100}$/.test(emailId) || typeof event.created_at!=="string" || !Number.isFinite(Date.parse(event.created_at))) throw new ApiError(422,"Notificação de e-mail inválida.");
  const now = new Date().toISOString();
  const result = await env.DB!.prepare("INSERT INTO email_delivery_events (id,event_type,resend_email_id,occurred_at,received_at,outcome,body_hash) VALUES (?,?,?,?,?,'received',?) ON CONFLICT(id) DO NOTHING")
    .bind(id,event.type,emailId,new Date(event.created_at).toISOString(),now,await hash(new TextDecoder().decode(bytes))).run();
  await applyDeliveryEvents(env,emailId);
  return {received:true,...(!result.meta.changes?{duplicate:true}:{})};
}
