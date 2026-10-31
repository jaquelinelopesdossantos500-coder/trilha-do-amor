import { PRICE_CENTS, addBusinessDays, boundedInt, type AppEnv } from "./configuration";
import { ApiError, hex } from "./security";
import { audit } from "./repository";
import type { OrderRow } from "./order-types";

export type ProviderPayment = {
  id: number | string; external_reference: string; status: string; currency_id: string;
  transaction_amount: number; transaction_amount_refunded?: number; collector_id: number | string;
  live_mode: boolean; date_last_updated: string; date_approved?: string;
};
export async function mercadoFetch(env: AppEnv, path: string, init: RequestInit = {}) {
  if (!env.MP_ACCESS_TOKEN) throw new ApiError(503, "O pagamento ainda está sendo configurado.");
  let response: Response;
  try { response = await fetch("https://api.mercadopago.com" + path, {
    ...init, signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init.headers },
  }); } catch { throw new ApiError(503, "O serviço de pagamento não respondeu. Tente novamente em instantes."); }
  if (!response.ok) throw new ApiError(503, "Não foi possível consultar o pagamento. Tente novamente em instantes.");
  return response.json();
}
export async function createPreference(env: AppEnv, o: OrderRow, sandbox: boolean) {
  const base = env.PUBLIC_BASE_URL!.replace(/\/$/, "");
  const returnUrl = `${base}/?pedido=${encodeURIComponent(o.id)}&retorno=1`;
  const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
  const data = await mercadoFetch(env, "/checkout/preferences", { method: "POST",
    headers: { "X-Idempotency-Key": o.id + ":" + (o.preference_expires_at || "initial") },
    body: JSON.stringify({
      external_reference: o.id, items: [{ id: "reencontro-8s-3fotos", title: "Trilha do Amor · 1 vídeo de 8s + 3 fotos", quantity: 1, currency_id: "BRL", unit_price: PRICE_CENTS / 100 }],
      payer: { name: o.name, email: o.email },
      back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl }, auto_return: "approved",
      notification_url: `${base}/api/webhooks/mercadopago?source_news=webhooks`,
      metadata: { order_id: o.id, scenario: o.scenario },
      expires: true, expiration_date_to: expiresAt,
      statement_descriptor: "TRILHA DO AMOR",
    }),
  }) as { id?: string; init_point?: string; sandbox_init_point?: string };
  const url = sandbox ? data.sandbox_init_point : data.init_point;
  if (!data.id || !url) throw new ApiError(503, "Não foi possível abrir o checkout. Tente novamente.");
  const parsedUrl = new URL(url), hostname = parsedUrl.hostname;
  if (parsedUrl.protocol !== "https:") throw new ApiError(503, "O provedor retornou um checkout inválido.");
  if (!hostname.endsWith(".mercadopago.com.br") && hostname !== "mercadopago.com.br" && !hostname.endsWith(".mercadopago.com") && hostname !== "mercadopago.com") throw new ApiError(503, "O provedor retornou um checkout inválido.");
  return { id: data.id, url, expiresAt };
}
export async function validWebhook(request: Request, env: AppEnv, id: string) {
  if (!env.MP_WEBHOOK_SECRET || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return false;
  const requestId = request.headers.get("x-request-id") || "";
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(requestId)) return false;
  const parts = (request.headers.get("x-signature") || "").split(",").map(p => p.trim().split("="));
  const ts = parts.find(([k]) => k === "ts")?.[1];
  const signatures = parts.filter(([k,v]) => k === "v1" && /^[a-fA-F0-9]{64}$/.test(v || "")).map(([,v]) => v);
  if (!ts || !/^\d{10,13}$/.test(ts) || signatures.length === 0) return false;
  const timestamp = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.MP_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  for (const signature of signatures) {
    const bytes = Uint8Array.from(signature.match(/../g)!, s => parseInt(s,16));
    if (await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(manifest))) return true;
  }
  return false;
}
export async function applyProviderPayment(env: AppEnv, payment: ProviderPayment) {
  const o = await env.DB!.prepare("SELECT * FROM orders WHERE id = ?").bind(payment.external_reference || "").first<OrderRow>();
  if (!o) return;
  const isSandbox = env.PAYMENT_MODE === "mercadopago-sandbox";
  if (o.payment_provider !== "mercadopago" || !env.MP_COLLECTOR_ID || String(payment.collector_id) !== env.MP_COLLECTOR_ID ||
    payment.currency_id !== "BRL" || Math.round(Number(payment.transaction_amount) * 100) !== o.amount_cents ||
    payment.live_mode !== !isSandbox || o.is_test !== Number(isSandbox)) {
    await audit(env, o.id, "payment_mismatch", String(payment.id)); throw new ApiError(422, "O pagamento não corresponde ao pedido.");
  }
  if (o.payment_id && o.payment_id !== String(payment.id) && o.payment_status === "approved") {
    await audit(env, o.id, "duplicate_payment_review", String(payment.id)); return;
  }
  const mapping: Record<string,string> = { approved: "approved", pending: "pending", in_process: "pending", authorized: "pending", rejected: "rejected", cancelled: "cancelled", refunded: "refunded", charged_back: "refunded" };
  const status = Number(payment.transaction_amount_refunded || 0) > 0 ? "refunded" : mapping[payment.status];
  if (!status) return;
  const providerTime = new Date(payment.date_last_updated);
  if (!Number.isFinite(providerTime.getTime())) throw new ApiError(422, "Data de pagamento inválida.");
  const now = new Date(), time = now.toISOString();
  const paidAt = payment.date_approved && Number.isFinite(Date.parse(payment.date_approved)) ? new Date(payment.date_approved).toISOString() : time;
  const expiry = new Date(now.getTime() + boundedInt(env.RETENTION_DAYS,30,1,90) * 86400000).toISOString();
  const result = await env.DB!.prepare(`UPDATE orders SET payment_id = ?, payment_status = ?, provider_updated_at = ?, updated_at = ?,
    paid_at = CASE WHEN ? = 'approved' THEN COALESCE(paid_at, ?) ELSE paid_at END,
    delivery_due_at = CASE WHEN ? = 'approved' THEN COALESCE(delivery_due_at, ?) ELSE delivery_due_at END,
    photos_expires_at = CASE WHEN ? = 'approved' AND paid_at IS NULL THEN ? ELSE photos_expires_at END,
    production_status = CASE WHEN ? = 'approved' AND production_status = 'awaiting_payment' THEN 'awaiting_production'
      WHEN ? IN ('refunded','cancelled') AND production_status != 'delivered' THEN 'cancelled' ELSE production_status END
    WHERE id = ? AND (provider_updated_at IS NULL OR provider_updated_at < ?)`)
    .bind(String(payment.id), status, providerTime.toISOString(), time,
      status, paidAt, status, addBusinessDays(new Date(paidAt),o.delivery_days), status, expiry,
      status, status, o.id, providerTime.toISOString()).run();
  if (result.meta.changes) await audit(env, o.id, "payment_" + status, String(payment.id));
}
export async function reconcile(env: AppEnv, o: OrderRow) {
  if (o.payment_provider !== "mercadopago") return;
  const data = await mercadoFetch(env, `/v1/payments/search?external_reference=${encodeURIComponent(o.id)}&sort=date_last_updated&criteria=asc&limit=50`) as { results?: ProviderPayment[] };
  for (const payment of data.results || []) if (payment.external_reference === o.id) await applyProviderPayment(env, payment);
}
