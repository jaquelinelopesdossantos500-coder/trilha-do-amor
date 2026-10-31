CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`kind` text NOT NULL,
	`detail` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`owner_hash` text NOT NULL,
	`request_key` text NOT NULL,
	`scenario` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`upload_state` text DEFAULT 'uploading' NOT NULL,
	`self_key` text,
	`loved_key` text,
	`self_type` text,
	`loved_type` text,
	`consent_at` text NOT NULL,
	`policy_version` text NOT NULL,
	`name` text,
	`email` text,
	`whatsapp` text,
	`amount_cents` integer DEFAULT 2790 NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`payment_provider` text,
	`payment_id` text,
	`preference_id` text,
	`checkout_url` text,
	`checkout_lock_until` text,
	`provider_updated_at` text,
	`is_test` integer DEFAULT 0 NOT NULL,
	`production_status` text DEFAULT 'awaiting_payment' NOT NULL,
	`delivery_days` integer NOT NULL,
	`delivery_due_at` text,
	`paid_at` text,
	`completed_at` text,
	`photos_expires_at` text NOT NULL,
	`photos_deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_owner_request` ON `orders` (`owner_hash`,`request_key`);--> statement-breakpoint
CREATE INDEX `orders_created` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_expiry` ON `orders` (`photos_expires_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
