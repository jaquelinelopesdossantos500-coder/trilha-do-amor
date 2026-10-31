CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`transaction_id` text,
	`order_id` text,
	`event_time` text,
	`received_at` text NOT NULL,
	`processed_at` text,
	`outcome` text NOT NULL,
	`body_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_events_order` ON `payment_events` (`order_id`);--> statement-breakpoint
CREATE INDEX `payment_events_transaction` ON `payment_events` (`transaction_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `scenario_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `checkout_reference` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `buyer_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `kirvano_checkout_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `kirvano_event_time` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `kirvano_event_rank` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_checkout_reference` ON `orders` (`checkout_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_provider_transaction` ON `orders` (`payment_provider`,`payment_id`);
--> statement-breakpoint
UPDATE orders SET scenario_key = CASE scenario WHEN 'escadaria' THEN 'escadaria-dourada' WHEN 'carinho' THEN 'carinho-no-ceu' WHEN 'nuvens' THEN 'abraco-nas-nuvens' WHEN 'luz' THEN 'abraco-na-luz' ELSE scenario END WHERE scenario_key='';
