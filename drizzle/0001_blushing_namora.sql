CREATE TABLE `weekend_target_plans` (
	`event_id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`target_points` integer NOT NULL,
	`sprint_target` integer,
	`gp_target` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `weekend_target_plans_season_idx` ON `weekend_target_plans` (`season_id`);