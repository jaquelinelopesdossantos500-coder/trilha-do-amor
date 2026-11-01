declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_ENV?: string;
    PAYMENT_MODE?: string;
    ENABLE_LIVE_PAYMENTS?: string;
    MP_ACCESS_TOKEN?: string;
    MP_WEBHOOK_SECRET?: string;
    MP_COLLECTOR_ID?: string;
    ADMIN_PASSWORD_HASH?: string;
    SESSION_SECRET?: string;
    EMAIL_CONFIRMATIONS_ENABLED?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM?: string;
    RESEND_REPLY_TO?: string;
    RESEND_WEBHOOK_SECRET?: string;
    PUBLIC_BASE_URL?: string;
    WHATSAPP_NUMBER?: string;
    SUPPORT_EMAIL?: string;
    BUSINESS_NAME?: string;
    BUSINESS_DOCUMENT?: string;
    BUSINESS_ADDRESS?: string;
    POLICIES_APPROVED?: string;
    AI_PROVIDER_NAME?: string;
    DELIVERY_DAYS?: string;
    RETENTION_DAYS?: string;
    UNPAID_RETENTION_HOURS?: string;
  }
}
