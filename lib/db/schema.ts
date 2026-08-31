import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * PHOENIX 93 — schema (M1).
 *
 * Mirrors the motogp.com pulselive API so ingest is a straight mapping, with
 * UUIDs kept as the primary keys: they are stable upstream, which is what makes
 * the ingest idempotent without a surrogate-key lookup on every write.
 */

export const seasons = sqliteTable("seasons", {
  id: text("id").primaryKey(),
  year: integer("year").notNull().unique(),
  current: integer("current", { mode: "boolean" }).notNull().default(false)
});

export const riders = sqliteTable("riders", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  number: integer("number"),
  countryIso: text("country_iso")
});

export const circuits = sqliteTable("circuits", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  place: text("place"),
  nation: text("nation")
});

/** Non-test Grand Prix only. `round` is derived by date order, not taken from upstream. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id),
    circuitId: text("circuit_id")
      .notNull()
      .references(() => circuits.id),
    round: integer("round").notNull(),
    shortName: text("short_name").notNull(),
    name: text("name").notNull(),
    dateStart: text("date_start").notNull(),
    dateEnd: text("date_end").notNull(),
    status: text("status").notNull()
  },
  (t) => ({
    seasonRound: unique("events_season_round").on(t.seasonId, t.round),
    bySeason: index("events_season_idx").on(t.seasonId)
  })
);

export type SessionType = "SPR" | "RAC";

/**
 * Only the two point-scoring sessions are stored. Practice and qualifying are
 * not championship inputs.
 *
 * A red-flagged race can appear twice (Catalonia 2026: RAC awarded nothing,
 * RAC 2 awarded the full points set after the restart). Both rows are kept for
 * traceability, but exactly one per (event, type) may be `definitive` — that is
 * the one the championship counts, enforced by a partial unique index.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    type: text("type").$type<SessionType>().notNull(),
    dateUtc: text("date_utc").notNull(),
    status: text("status").notNull(),
    condition: text("condition"),
    definitive: integer("definitive", { mode: "boolean" }).notNull().default(true)
  },
  (t) => ({
    oneDefinitivePerType: uniqueIndex("sessions_event_type_definitive")
      .on(t.eventId, t.type)
      .where(sql`${t.definitive} = 1`),
    byEvent: index("sessions_event_idx").on(t.eventId)
  })
);

/**
 * One row per rider per scoring session.
 * The (session_id, rider_id) uniqueness is what makes a re-run of the ingest
 * safe: an upsert on this key can never double-count points.
 */
export const sessionResults = sqliteTable(
  "session_results",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    riderId: text("rider_id")
      .notNull()
      .references(() => riders.id),
    position: integer("position"),
    points: integer("points").notNull().default(0),
    status: text("status").notNull(),
    dnf: integer("dnf", { mode: "boolean" }).notNull().default(false),
    teamName: text("team_name"),
    constructorName: text("constructor_name")
  },
  (t) => ({
    sessionRider: unique("results_session_rider").on(t.sessionId, t.riderId),
    bySession: index("results_session_idx").on(t.sessionId),
    byRider: index("results_rider_idx").on(t.riderId)
  })
);

/** Championship standings as published upstream, snapshotted per event. */
export const standings = sqliteTable(
  "standings",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id),
    afterEventId: text("after_event_id").references(() => events.id),
    riderId: text("rider_id")
      .notNull()
      .references(() => riders.id),
    position: integer("position").notNull(),
    points: integer("points").notNull(),
    teamName: text("team_name")
  },
  (t) => ({
    seasonEventRider: unique("standings_season_event_rider").on(t.seasonId, t.afterEventId, t.riderId)
  })
);

/**
 * The engine's output, written once per ingested session.
 * This is what turns the probability into a history rather than a number,
 * and it is the table the 2024/25 backtest writes into as well.
 */
export const championshipSnapshots = sqliteTable(
  "championship_snapshots",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    sessionId: text("session_id").references(() => sessions.id),
    takenAt: text("taken_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    trackedRiderId: text("tracked_rider_id")
      .notNull()
      .references(() => riders.id),
    trackedPoints: integer("tracked_points").notNull(),
    leaderPoints: integer("leader_points").notNull(),
    gapToLeader: integer("gap_to_leader").notNull(),
    roundsRemaining: integer("rounds_remaining").notNull(),
    pointsAvailable: integer("points_available").notNull(),
    // L1 outputs
    requiredNow: integer("required_now"),
    minimumPosition: integer("minimum_position"),
    anchorEventId: text("anchor_event_id").references(() => events.id),
    anchorCondition: text("anchor_condition"),
    state: text("state").$type<"OUT_OF_HIS_HANDS" | "LIVE_FIGHT" | "ALREADY_DECIDED">(),
    // L3 outputs — null until M6
    probability: real("probability"),
    confidenceLow: real("confidence_low"),
    confidenceHigh: real("confidence_high"),
    standingsJson: text("standings_json")
  },
  (t) => ({
    bySeason: index("snapshots_season_idx").on(t.seasonId)
  })
);

export const syncLog = sqliteTable("sync_log", {
  id: text("id").primaryKey(),
  ranAt: text("ran_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  target: text("target").notNull(),
  status: text("status").$type<"OK" | "FAILED" | "REJECTED">().notNull(),
  rowsWritten: integer("rows_written").notNull().default(0),
  error: text("error")
});
