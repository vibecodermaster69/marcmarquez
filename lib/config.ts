/** The rider this deployment tracks. The engine itself is rider-agnostic. */
export const TRACKED_RIDER_NAME = "Marc Marquez";
export const SEASON = 2026;

/**
 * Race durations, used to turn a session's scheduled START into its estimated
 * END. Generous on purpose — a red flag and restart still finishes inside these.
 */
export const SESSION_DURATION_MINUTES: Record<"SPR" | "RAC", number> = { SPR: 40, RAC: 75 };

/**
 * The gap between a race ENDING and the results being fetched.
 * Two hours: long enough for the classification to be final and for any
 * post-race penalty to be applied before we read it.
 *
 * The sync job is idempotent and self-healing, so this only affects how soon a
 * result is picked up, never whether it is correct.
 */
export const RESULTS_DELAY_MINUTES = 120;

/** How far back the sync job looks for sessions it has not yet ingested. */
export const SYNC_WINDOW_DAYS = 4;

/**
 * How many riders the simulation carries.
 *
 * Not just the current top three: a title fight can change shape. If Bezzecchi
 * crashes out of contention the threat becomes whoever is behind him, and a
 * model that only knows three riders would never see it coming. Six covers
 * everyone within realistic reach of the lead; beyond that the chance is
 * negligible and each extra rider costs simulation time for nothing.
 */
export const CONTENDER_DEPTH = 6;
