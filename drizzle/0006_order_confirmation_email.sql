CREATE TABLE email_outbox (
 id text PRIMARY KEY NOT NULL, order_id text NOT NULL, kind text NOT NULL DEFAULT 'order_confirmation',
 recipient text, status text NOT NULL DEFAULT 'pending', payload_json text, resend_email_id text,
 attempts integer NOT NULL DEFAULT 0, next_attempt_at text NOT NULL, first_attempt_at text, lease_until text,
 accepted_at text, delivery_status text, delivery_rank integer NOT NULL DEFAULT 0, delivery_at text,
 last_error text, created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX email_outbox_order_kind ON email_outbox(order_id,kind);
--> statement-breakpoint
CREATE UNIQUE INDEX email_outbox_provider_id ON email_outbox(resend_email_id);
--> statement-breakpoint
CREATE INDEX email_outbox_due ON email_outbox(status,next_attempt_at);
--> statement-breakpoint
CREATE TABLE email_delivery_events (
 id text PRIMARY KEY NOT NULL, event_type text NOT NULL, resend_email_id text NOT NULL,
 occurred_at text NOT NULL, received_at text NOT NULL, processed_at text, outcome text NOT NULL,
 body_hash text NOT NULL
);
--> statement-breakpoint
CREATE INDEX email_delivery_events_message ON email_delivery_events(resend_email_id,processed_at);
--> statement-breakpoint
CREATE TABLE email_suppressions (
 recipient_hash text PRIMARY KEY NOT NULL, reason text NOT NULL, event_id text NOT NULL, created_at text NOT NULL
);
