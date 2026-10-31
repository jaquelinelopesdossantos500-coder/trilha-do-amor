export type OrderRow = {
  id: string; number: string; owner_hash: string; request_key: string; scenario: string;
  created_at: string; updated_at: string; upload_state: string;
  self_key: string | null; loved_key: string | null; self_type: string | null; loved_type: string | null;
  consent_at: string; policy_version: string; name: string | null; email: string | null; whatsapp: string | null;
  amount_cents: number; payment_status: string; payment_provider: string | null; payment_id: string | null;
  payment_total_cents: number | null; payment_currency: string | null; payment_details_json: string | null;
  preference_id: string | null; checkout_url: string | null; checkout_lock_until: string | null;
  preference_is_test: number | null; preference_expires_at: string | null;
  provider_updated_at: string | null; is_test: number; production_status: string;
  delivery_days: number; delivery_due_at: string | null; paid_at: string | null; completed_at: string | null;
  photos_expires_at: string; photos_deleted_at: string | null;
  scenario_key: string; checkout_reference: string | null; buyer_id: string | null;
  kirvano_checkout_id: string | null; kirvano_event_time: string | null; kirvano_event_rank: number; revision: number;
};
export type PurchasedExtra={productId:string;name:string;amountCents:number};
function purchasedExtras(value:string|null):PurchasedExtra[]{
  if(!value)return [];
  try{
    const details:unknown=JSON.parse(value);
    if(!details||typeof details!=="object"||!('items' in details)||!Array.isArray(details.items))return [];
    return details.items.slice(0,20).flatMap((item:unknown)=>{
      if(!item||typeof item!=="object"||!('productId' in item)||typeof item.productId!=="string"||!('name' in item)||typeof item.name!=="string"||!('amountCents' in item)||typeof item.amountCents!=="number"||!Number.isSafeInteger(item.amountCents)||item.amountCents<0)return [];
      return [{productId:item.productId,name:item.name,amountCents:item.amountCents}];
    });
  }catch{return [];}
}
export function visibleOrder(o: OrderRow) {
  return { id: o.id, number: o.number, scenario: o.scenario, createdAt: o.created_at,
    amountCents: o.amount_cents, paymentTotalCents:o.payment_total_cents??null, paymentCurrency:o.payment_currency??null, purchasedExtras:purchasedExtras(o.payment_details_json), paymentStatus: o.payment_status, productionStatus: o.production_status,
    deliveryDays: o.delivery_days, deliveryDueAt: o.delivery_due_at, completedAt: o.completed_at,
    isTest: !!o.is_test, name: o.name, email: o.email, whatsapp: o.whatsapp,
    photosAvailable: !o.photos_deleted_at && o.upload_state === "ready" && o.photos_expires_at > new Date().toISOString(),
    photosExpiresAt: o.photos_expires_at, scenarioKey:o.scenario_key,
    status:o.production_status==="delivered"?"entregue":["refunded","cancelled"].includes(o.payment_status)?"cancelado":o.payment_status==="approved"?["in_production","ready"].includes(o.production_status)?"em_producao":"pagamento_aprovado":o.photos_expires_at<new Date().toISOString()?"expirado":"aguardando_pagamento",
  };
}
export type PublicOrder = ReturnType<typeof visibleOrder>;
