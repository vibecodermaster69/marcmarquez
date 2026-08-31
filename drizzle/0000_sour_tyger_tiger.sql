CREATE TABLE `championship_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text,
	`taken_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`tracked_rider_id` text NOT NULL,
	`tracked_points` integer NOT NULL,
	`leader_points` integer NOT NULL,
	`gap_to_leader` integer NOT NULL,
	`rounds_remaining` integer NOT NULL,
	`points_available` integer NOT NULL,
	`required_now` integer,
	`minimum_position` integer,
	`anchor_event_id` text,
	`anchor_condition` text,
	`state` text,
	`probability` real,
	`confidence_low` real,
	`confidence_high` real,
	`standings_json` text,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tracked_rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshots_season_idx` ON `championship_snapshots` (`season_id`);--> statement-breakpoint
CREATE TABLE `circuits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`place` text,
	`nation` text
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`circuit_id` text NOT NULL,
	`round` integer NOT NULL,
	`short_name` text NOT NULL,
	`name` text NOT NULL,
	`date_start` text NOT NULL,
	`date_end` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`circuit_id`) REFERENCES `circuits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_season_idx` ON `events` (`season_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_season_round` ON `events` (`season_id`,`round`);--> statement-breakpoint
CREATE TABLE `riders` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`number` integer,
	`country_iso` text
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`current` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_year_unique` ON `seasons` (`year`);--> statement-breakpoint
CREATE TABLE `session_results` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`rider_id` text NOT NULL,
	`position` integer,
	`points` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`dnf` integer DEFAULT false NOT NULL,
	`team_name` text,
	`constructor_name` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `results_session_idx` ON `session_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `results_rider_idx` ON `session_results` (`rider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `results_session_rider` ON `session_results` (`session_id`,`rider_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`date_utc` text NOT NULL,
	`status` text NOT NULL,
	`condition` text,
	`definitive` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_event_type_definitive` ON `sessions` (`event_id`,`type`) WHERE "sessions"."definitive" = 1;--> statement-breakpoint
CREATE INDEX `sessions_event_idx` ON `sessions` (`event_id`);--> statement-breakpoint
CREATE TABLE `standings` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`after_event_id` text,
	`rider_id` text NOT NULL,
	`position` integer NOT NULL,
	`points` integer NOT NULL,
	`team_name` text,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`after_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `standings_season_event_rider` ON `standings` (`season_id`,`after_event_id`,`rider_id`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`ran_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`target` text NOT NULL,
	`status` text NOT NULL,
	`rows_written` integer DEFAULT 0 NOT NULL,
	`error` text
);
