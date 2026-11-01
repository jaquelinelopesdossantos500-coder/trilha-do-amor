import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(), number: text("number").notNull().unique(),
  ownerHash: text("owner_hash").notNull(), requestKey: text("request_key").notNull(),
  scenario: text("scenario").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  scenarioKey: text("scenario_key").notNull().default(""),
  uploadState: text("upload_state").notNull().default("uploading"),
  selfKey: text("self_key"), lovedKey: text("loved_key"), selfType: text("self_type"), lovedType: text("loved_type"),
  consentAt: text("consent_at").notNull(), policyVersion: text("policy_version").notNull(),
  name: text("name"), email: text("email"), whatsapp: text("whatsapp"),
  amountCents: integer("amount_cents").notNull().default(2790),
  paymentTotalCents: integer("payment_total_cents"), paymentCurrency: text("payment_currency"), paymentDetailsJson: text("payment_details_json"),
  paymentStatus: text("payment_status").notNull().default("pending"), paymentProvider: text("payment_provider"),
  paymentId: text("payment_id"), preferenceId: text("preference_id"), checkoutUrl: text("checkout_url"),
  preferenceIsTest: integer("preference_is_test"), preferenceExpiresAt: text("preference_expires_at"),
  checkoutLockUntil: text("checkout_lock_until"), providerUpdatedAt: text("provider_updated_at"),
  isTest: integer("is_test").notNull().default(0),
  productionStatus: text("production_status").notNull().default("awaiting_payment"),
  deliveryDays: integer("delivery_days").notNull(), deliveryDueAt: text("delivery_due_at"),
  paidAt: text("paid_at"), completedAt: text("completed_at"),
  photosExpiresAt: text("photos_expires_at").notNull(), photosDeletedAt: text("photos_deleted_at"),
  checkoutReference: text("checkout_reference"), buyerId: text("buyer_id"),
  kirvanoCheckoutId: text("kirvano_checkout_id"), kirvanoEventTime: text("kirvano_event_time"),
  kirvanoEventRank: integer("kirvano_event_rank").notNull().default(0),
  revision: integer("revision").notNull().default(0),
}, t => [
  uniqueIndex("orders_owner_request").on(t.ownerHash, t.requestKey),
  index("orders_created").on(t.createdAt), index("orders_expiry").on(t.photosExpiresAt),
  uniqueIndex("orders_checkout_reference").on(t.checkoutReference),
  uniqueIndex("orders_provider_transaction").on(t.paymentProvider,t.paymentId),
]);
export const paymentEvents = sqliteTable("payment_events", {
  id: text("id").primaryKey(), provider: text("provider").notNull(), eventType: text("event_type").notNull(),
  transactionId: text("transaction_id"), orderId: text("order_id"), eventTime: text("event_time"),
  receivedAt: text("received_at").notNull(), processedAt: text("processed_at"),
  outcome: text("outcome").notNull(), bodyHash: text("body_hash").notNull(),
},t=>[index("payment_events_order").on(t.orderId),index("payment_events_transaction").on(t.transactionId)]);
export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(), expiresAt: text("expires_at").notNull(),
});
export const customerSessions = sqliteTable("customer_sessions", {
  tokenHash: text("token_hash").primaryKey(), expiresAt: text("expires_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull().default(1), expiresAt: integer("expires_at").notNull(),
});
export const events = sqliteTable("events", {
  id: text("id").primaryKey(), orderId: text("order_id"), kind: text("kind").notNull(), detail: text("detail"), createdAt: text("created_at").notNull(),
});

// Durable cleanup of uncertain uploads. Independent of orders so retries may retire failed attempts.
export const photoCleanupJobs = sqliteTable("photo_cleanup_jobs", {
  id: text("id").primaryKey(),
  objectKeys: text("object_keys").notNull(),
  notBefore: text("not_before").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [index("photo_cleanup_due").on(t.notBefore)]);

export const emailOutbox = sqliteTable("email_outbox", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull(), kind: text("kind").notNull().default("order_confirmation"),
  recipient: text("recipient"), status: text("status").notNull().default("pending"), payloadJson: text("payload_json"), resendEmailId: text("resend_email_id"),
  attempts: integer("attempts").notNull().default(0), nextAttemptAt: text("next_attempt_at").notNull(), firstAttemptAt: text("first_attempt_at"), leaseUntil: text("lease_until"),
  acceptedAt: text("accepted_at"), deliveryStatus: text("delivery_status"), deliveryRank: integer("delivery_rank").notNull().default(0), deliveryAt: text("delivery_at"),
  lastError: text("last_error"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("email_outbox_order_kind").on(t.orderId,t.kind),uniqueIndex("email_outbox_provider_id").on(t.resendEmailId),index("email_outbox_due").on(t.status,t.nextAttemptAt)]);

export const emailDeliveryEvents = sqliteTable("email_delivery_events", {
  id: text("id").primaryKey(), eventType: text("event_type").notNull(), resendEmailId: text("resend_email_id").notNull(),
  occurredAt: text("occurred_at").notNull(), receivedAt: text("received_at").notNull(), processedAt: text("processed_at"), outcome: text("outcome").notNull(), bodyHash: text("body_hash").notNull(),
}, t => [index("email_delivery_events_message").on(t.resendEmailId,t.processedAt)]);

export const emailSuppressions = sqliteTable("email_suppressions", {
  recipientHash: text("recipient_hash").primaryKey(), reason: text("reason").notNull(), eventId: text("event_id").notNull(), createdAt: text("created_at").notNull(),
});
