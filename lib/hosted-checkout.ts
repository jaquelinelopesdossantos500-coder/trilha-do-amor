import { KIRVANO_CHECKOUT_URL, PULSEFY_CHECKOUT_URL, kirvanoCheckoutConfigured, pulsefyCheckoutConfigured, type AppEnv } from "./configuration";
import { photoStorage } from "./photo-storage";
import { storageConfigured } from "./storage-config";
import { ApiError, randomToken } from "./security";
import { audit, getOrder } from "./repository";
import type { OrderRow } from "./order-types";

export function isPulsefyCheckout(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url=new URL(value), expected=new URL(PULSEFY_CHECKOUT_URL);
    return !url.username && !url.password && url.origin===expected.origin && url.pathname===expected.pathname;
  } catch { return false; }
}

export async function createHostedCheckout(env: AppEnv, order: OrderRow, provider: "kirvano" | "pulsefy") {
  if (!(provider==="pulsefy"?pulsefyCheckoutConfigured(env):kirvanoCheckoutConfigured(env))) throw new ApiError(503,"Não foi possível iniciar o pagamento agora. Tente novamente mais tarde.");
  if(order.upload_state!=="ready"||order.photos_deleted_at||order.photos_expires_at<=new Date().toISOString()) throw new ApiError(410,"As fotos precisam estar salvas antes do pagamento. Reenvie-as para continuar.");
  if(!storageConfigured(env)||!order.self_key||!order.loved_key) throw new ApiError(503,"Não foi possível confirmar o envio das fotos. Tente novamente.");
  const stored=await Promise.all([photoStorage(env).head(order.self_key),photoStorage(env).head(order.loved_key)]);
  if(stored.some(photo=>!photo)) throw new ApiError(410,"As fotos deste pedido não estão disponíveis. Inicie um novo pedido para reenviá-las.");
  // Existing unpaid Pulsefy checkouts were previously labelled kirvano. Preserve their references.
  const legacy=provider==="pulsefy"&&order.payment_provider==="kirvano"&&isPulsefyCheckout(order.checkout_url);
  if(order.payment_provider&&order.payment_provider!==provider&&!legacy) throw new ApiError(409,"Este pedido pertence a outro meio de pagamento. Inicie um novo pedido.");
  const candidate="tda_"+randomToken().slice(0,40), now=new Date().toISOString();
  await env.DB!.prepare("UPDATE orders SET checkout_reference=COALESCE(checkout_reference,?),payment_provider=?,updated_at=? WHERE id=? AND payment_status IN ('pending','rejected') AND (payment_provider IS NULL OR payment_provider=? OR (?=1 AND payment_provider='kirvano'))")
    .bind(candidate,provider,now,order.id,provider,Number(legacy)).run();
  const saved=await getOrder(env,order.id);
  if(saved.payment_status==="approved")return {approved:true};
  if(["refunded","cancelled"].includes(saved.payment_status))throw new ApiError(409,"Este pedido foi encerrado. Crie um novo reencontro.");
  if(!saved.checkout_reference||saved.payment_provider!==provider)throw new ApiError(503,"Não foi possível vincular o pagamento ao pedido. Tente novamente.");
  const url=new URL(provider==="pulsefy"?PULSEFY_CHECKOUT_URL:KIRVANO_CHECKOUT_URL);url.searchParams.set("src",saved.checkout_reference);
  await env.DB!.prepare("UPDATE orders SET checkout_url=? WHERE id=?").bind(url.toString(),order.id).run();
  await audit(env,order.id,provider+"_checkout_created");
  return {url:url.toString()};
}
