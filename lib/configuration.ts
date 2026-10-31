import {storageConfigured,type PhotoStorageEnv} from "./storage-config";
export const PRICE_CENTS = 2790;
export const KIRVANO_CHECKOUT_URL = "https://pay.kirvano.com/abed794c-74c4-4493-810f-b9a4708a56e4";
export const POLICY_VERSION = "2026-10-30-v1";
export const SCENARIOS = [
  { id: "escadaria", key:"escadaria-dourada", name: "A escadaria dourada", note: "Um caminho de luz até aquele abraço." },
  { id: "carinho", key:"carinho-no-ceu", name: "O carinho no céu", note: "O afeto que continua em cada lembrança." },
  { id: "nuvens", key:"abraco-nas-nuvens", name: "O abraço nas nuvens", note: "Um reencontro entre o céu e a saudade." },
  { id: "luz", key:"abraco-na-luz", name: "O abraço na luz", note: "Onde o amor encontra a sua luz." },
] as const;
export type AppEnv = PhotoStorageEnv & {
  DB?: D1Database;
  APP_ENV?: string; PAYMENT_MODE?: string; ENABLE_LIVE_PAYMENTS?: string;
  MP_ACCESS_TOKEN?: string; MP_WEBHOOK_SECRET?: string; MP_COLLECTOR_ID?: string;
  ADMIN_PASSWORD_HASH?: string; SESSION_SECRET?: string;
  PUBLIC_BASE_URL?: string; WHATSAPP_NUMBER?: string; SUPPORT_EMAIL?: string;
  BUSINESS_NAME?: string; BUSINESS_DOCUMENT?: string; BUSINESS_ADDRESS?: string;
  POLICIES_APPROVED?: string; AI_PROVIDER_NAME?: string; DELIVERY_DAYS?: string; RETENTION_DAYS?: string;
  UNPAID_RETENTION_HOURS?: string;
  KIRVANO_CHECKOUT_URL?: string; KIRVANO_WEBHOOK_TOKEN?: string; KIRVANO_PRODUCT_ID?: string; KIRVANO_OFFER_ID?: string;
};
export function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(value); return value && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
export function localTesting(request: Request, env: AppEnv) {
  const hostname = new URL(request.url).hostname;
  return env.APP_ENV === "development" && (import.meta.env.DEV || ["localhost", "127.0.0.1", "[::1]"].includes(hostname));
}
export function businessReady(env: AppEnv) {
  return !!(env.BUSINESS_NAME && env.BUSINESS_DOCUMENT && env.BUSINESS_ADDRESS &&
    env.SUPPORT_EMAIL && env.AI_PROVIDER_NAME && /^55\d{10,11}$/.test(env.WHATSAPP_NUMBER || "") &&
    /^[1-9]\d?$/.test(env.DELIVERY_DAYS || "") && env.POLICIES_APPROVED === "true");
}
export function publicConfig(request: Request, env: AppEnv) {
  const test = localTesting(request, env), sandbox = env.PAYMENT_MODE === "mercadopago-sandbox", kirvano=env.PAYMENT_MODE==="kirvano";
  const kirvanoReady=kirvano && !!(env.DB && storageConfigured(env) && env.SESSION_SECRET) && env.KIRVANO_CHECKOUT_URL===KIRVANO_CHECKOUT_URL && !!env.KIRVANO_WEBHOOK_TOKEN && !!env.KIRVANO_PRODUCT_ID && !!env.KIRVANO_OFFER_ID && env.ENABLE_LIVE_PAYMENTS==="true";
  const providerConfigured = !!(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET && env.MP_COLLECTOR_ID && env.PUBLIC_BASE_URL?.startsWith("https://"));
  return {
    priceCents: PRICE_CENTS, policyVersion: POLICY_VERSION,
    mode: kirvano?"kirvano":test && env.PAYMENT_MODE === "simulation" ? "simulation" : sandbox ? "sandbox" : env.PAYMENT_MODE === "live" ? "live" : "disabled",
    testEnvironment: test || sandbox,
    previewEnvironment: env.APP_ENV === "preview",
    storageReady: !!env.DB && storageConfigured(env),
    sessionReady: !!(env.DB && env.SESSION_SECRET),
    checkoutReady: kirvanoReady || (test && env.PAYMENT_MODE === "simulation") ||
      (!kirvano && providerConfigured && (sandbox || (env.PAYMENT_MODE === "live" && env.APP_ENV === "production" && env.ENABLE_LIVE_PAYMENTS === "true" && businessReady(env)))),
    deliveryDays: boundedInt(env.DELIVERY_DAYS, 2, 1, 90),
    retentionDays: boundedInt(env.RETENTION_DAYS, 30, 1, 90),
    unpaidRetentionHours: boundedInt(env.UNPAID_RETENTION_HOURS, 48, 1, 168),
    whatsapp: /^55\d{10,11}$/.test(env.WHATSAPP_NUMBER || "") ? env.WHATSAPP_NUMBER : null,
    supportEmail: env.SUPPORT_EMAIL || null,
    business: { name: env.BUSINESS_NAME || null, document: env.BUSINESS_DOCUMENT || null, address: env.BUSINESS_ADDRESS || null },
    policiesReady: businessReady(env),
    aiProviderName: env.AI_PROVIDER_NAME || null,
  };
}
export function addBusinessDays(start: Date, days: number) {
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
  const d = new Date(localDate + "T12:00:00Z"); let left = days;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) left--; }
  return new Date(d.toISOString().slice(0,10) + "T23:59:00-03:00").toISOString(); // Local holidays are adjusted in admin.
}
