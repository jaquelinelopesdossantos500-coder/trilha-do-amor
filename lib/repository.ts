import {photoStorage} from "./photo-storage";
import { PRICE_CENTS, type AppEnv } from "./configuration";
import type { OrderRow } from "./order-types";
import { ApiError, owner } from "./security";
export async function audit(env: AppEnv, orderId: string | null, kind: string, detail: string | null = null) {
  await env.DB!.prepare("INSERT INTO events (id, order_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), orderId, kind, detail, new Date().toISOString()).run();
}
export async function getOrder(env: AppEnv, id: string) {
  const o = await env.DB!.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
  if (!o) throw new ApiError(404, "Pedido não encontrado."); return o;
}
export async function alignUnpaidCatalogPrice(env: AppEnv, order: OrderRow) {
  if (order.amount_cents === PRICE_CENTS || order.paid_at || order.payment_id) return order;
  if (order.payment_status !== "pending" && order.payment_status !== "rejected") return order;
  const now = new Date().toISOString();
  await env.DB!.prepare("UPDATE orders SET amount_cents = ?, updated_at = ? WHERE id = ? AND paid_at IS NULL AND payment_id IS NULL AND payment_status IN ('pending','rejected') AND amount_cents <> ?")
    .bind(PRICE_CENTS, now, order.id, PRICE_CENTS).run();
  return getOrder(env, order.id);
}
export async function customerOrder(request: Request, env: AppEnv, id: string) {
  const hash = await owner(request, env);
  const o = await env.DB!.prepare("SELECT * FROM orders WHERE id = ? AND owner_hash = ?").bind(id, hash).first<OrderRow>();
  if (!o) throw new ApiError(404, "Pedido não encontrado neste navegador."); return o;
}
export async function deletePhotos(env: AppEnv, o: OrderRow) {
  const keys = [o.self_key, o.loved_key].filter((k): k is string => !!k);
  if (keys.length) await photoStorage(env).delete(keys);
  await env.DB!.prepare("UPDATE orders SET self_key = NULL, loved_key = NULL, self_type = NULL, loved_type = NULL, photos_deleted_at = ?, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), new Date().toISOString(), o.id).run();
}
