import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { events, seasons, standings } from "../db/schema";
import { isScoringSession, toRounds, type MotoGpClient } from "../motogp/client";
import {
  ingestSession,
  log,
  resolveDefinitiveSessions,
  upsertEvent,
  upsertRider,
  upsertScoringSession,
  type ValidationIssue
} from "./ingest";

export { resolveDefinitiveSessions, validateClassification, type ValidationIssue } from "./ingest";

export interface SeedReport {
  year: number;
  events: number;
  sessions: number;
  results: number;
  standings: number;
  rejected: ValidationIssue[];
}

/**
 * Seeds one full season: calendar, scoring sessions, results and standings.
 *
 * Idempotent by construction — every write is an upsert keyed on the upstream
 * UUID, so running this twice produces the same database, never doubled points.
 */
export async function seedSeason(db: Db, client: MotoGpClient, year: number): Promise<SeedReport> {
  const allSeasons = await client.seasons();
  const season = allSeasons.find((s) => s.year === year);
  if (!season) throw new Error(`Season ${year} not found upstream`);

  db.insert(seasons)
    .values({ id: season.id, year: season.year, current: season.current })
    .onConflictDoUpdate({ target: seasons.id, set: { current: season.current } })
    .run();

  const categoryId = await client.motogpCategoryId(season.id);
  const rounds = toRounds(await client.events(season.id));

  const report: SeedReport = { year, events: 0, sessions: 0, results: 0, standings: 0, rejected: [] };

  for (const event of rounds) {
    upsertEvent(db, season.id, event);
    report.events += 1;

    const apiSessions = (await client.sessions(event.id, categoryId)).filter((s) => isScoringSession(s.type));
    const resolved = await resolveDefinitiveSessions(client, apiSessions);

    for (const { session, definitive } of resolved) {
      upsertScoringSession(db, event.id, session, definitive);
      report.sessions += 1;

      const target = `${year} ${event.short_name} ${session.type}`;

      // A superseded session (an abandoned, restarted race) awarded no
      // championship points, so it contributes no results.
      if (!definitive) {
        log(db, target, "OK", 0, "superseded by a restarted session; awarded no points", `${session.id}-superseded`);
        continue;
      }

      if (session.status !== "FINISHED") continue;

      const outcome = await ingestSession(db, client, session, target);
      if (outcome.rejected) report.rejected.push(outcome.rejected);
      report.results += outcome.written;
    }
  }

  // Championship standings as published upstream — the independent check the engine is measured against.
  const table = await client.standings(season.id, categoryId);
  const lastFinished = [...rounds].reverse().find((e) => e.status === "FINISHED") ?? null;
  for (const row of table) {
    upsertRider(db, row.rider);
    db.insert(standings)
      .values({
        id: `${season.id}-${lastFinished?.id ?? "current"}-${row.rider.id}`,
        seasonId: season.id,
        afterEventId: lastFinished?.id ?? null,
        riderId: row.rider.id,
        position: row.position,
        points: row.points,
        teamName: row.team?.name ?? null
      })
      .onConflictDoUpdate({
        target: [standings.seasonId, standings.afterEventId, standings.riderId],
        set: { position: row.position, points: row.points }
      })
      .run();
    report.standings += 1;
  }

  return report;
}

/** Rounds still to run in a season, by date order. */
export function remainingRounds(db: Db, seasonId: string, today: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.seasonId, seasonId))
    .all()
    .filter((e) => e.dateEnd >= today)
    .sort((a, b) => a.round - b.round);
}
