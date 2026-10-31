CREATE TABLE `photo_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`object_keys` text NOT NULL,
	`not_before` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photo_cleanup_due` ON `photo_cleanup_jobs` (`not_before`);