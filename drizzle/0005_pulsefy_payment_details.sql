ALTER TABLE orders ADD COLUMN payment_total_cents integer;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN payment_currency text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN payment_details_json text;
