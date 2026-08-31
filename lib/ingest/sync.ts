import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { SEASON, SYNC_WINDOW_DAYS } from "../config";
import { events, seasons, sessions } from "../db/schema";
import { isScoringSession, toRounds, type MotoGpClient } from "../motogp/client";
import { ingestSession, isAlreadyIngested, log, resolveDefinitiveSessions, upsertEvent, upsertScoringSession, type ValidationIssue } from "./ingest";
import { fetchAfter, isDue } from "./schedule";
import { writeSnapshot } from "./snapshot";

export interface SyncReport {
  ranAt: string;
  year: number;
  eventsInWindow: number;
  ingested: string[];
  waiting: string[];
  alreadyHad: number;
  rejected: ValidationIssue[];
  snapshotWritten: boolean;
  error?: string;
}

const DAY = 86_400_000;

/**
 * One sync pass.
 *
 * Scans only the events near `now`, finds scoring sessions whose results are
 * due and not yet stored, ingests them, and writes a championship snapshot if
 * anything changed.
 *
 * Three properties make this safe to run on any schedule, as often as you like:
 *   - it is idempotent (results upsert on (session, rider));
 *   - it ingests only sessions motogp.com reports FINISHED, so a fetch that
 *     fires early costs one wasted request, never a wrong result;
 *   - it is self-healing — a missed run is picked up by the next one, because
 *     "due and not yet stored" does not expire.
 */
export async function syncNow(
  db: Db,
  client: MotoGpClient,
  options: { year?: number; now?: Date } = {}
): Promise<SyncReport> {
  const year = options.year ?? SEASON;
  const now = options.now ?? new Date();
  const report: SyncReport = {
    ranAt: now.toISOString(),
    year,
    eventsInWindow: 0,
    ingested: [],
    waiting: [],
    alreadyHad: 0,
    rejected: [],
    snapshotWritten: false
  };

  try {
    const allSeasons = await client.seasons();
    const season = allSeasons.find((s) => s.year === year);
    if (!season) throw new Error(`Season ${year} not found upstream`);

    db.insert(seasons)
      .values({ id: season.id, year: season.year, current: season.current })
      .onConflictDoUpdate({ target: seasons.id, set: { current: season.current } })
      .run();

    const categoryId = await client.motogpCategoryId(season.id);
    const rounds = toRounds(await client.events(season.id));

    // Keep the whole calendar current — it came back in the same request, and a
    // partial calendar would make "rounds remaining" wrong.
    for (const event of rounds) upsertEvent(db, season.id, event);

    // Only fetch SESSIONS for events near now — a sync pass is 1-3 requests, not a re-seed.
    const windowStart = now.getTime() - SYNC_WINDOW_DAYS * DAY;
    const windowEnd = now.getTime() + DAY;
    const inWindow = rounds.filter((e) => {
      const start = new Date(`${e.date_start}T00:00:00+00:00`).getTime();
      const end = new Date(`${e.date_end}T23:59:59+00:00`).getTime();
      return end >= windowStart && start <= windowEnd;
    });
    report.eventsInWindow = inWindow.length;

    for (const event of inWindow) {
      const apiSessions = (await client.sessions(event.id, categoryId)).filter((s) => isScoringSession(s.type));
      const resolved = await resolveDefinitiveSessions(client, apiSessions);

      for (const { session, definitive } of resolved) {
        upsertScoringSession(db, event.id, session, definitive);
        const target = `${year} ${event.short_name} ${session.type}`;

        if (!definitive) {
          log(db, target, "OK", 0, "superseded by a restarted session; awarded no points", `${session.id}-superseded`);
          continue;
        }

        if (isAlreadyIngested(db, session.id)) {
          report.alreadyHad += 1;
          continue;
        }

        const scheduled = { id: session.id, type: session.type as "SPR" | "RAC", dateUtc: session.date, status: session.status };
        const eventDates = { dateStart: event.date_start, dateEnd: event.date_end };

        // The hard gate: upstream must call it finished.
        if (session.status !== "FINISHED") {
          report.waiting.push(`${target} — not finished (fetch after ${fetchAfter(scheduled, eventDates).toISOString()})`);
          continue;
        }

        // The soft gate: give the classification time to settle before reading it.
        if (!isDue(scheduled, eventDates, now)) {
          report.waiting.push(`${target} — finished, waiting out the ${fetchAfter(scheduled, eventDates).toISOString()} settle window`);
          continue;
        }

        const outcome = await ingestSession(db, client, session, target);
        if (outcome.rejected) report.rejected.push(outcome.rejected);
        else report.ingested.push(target);
      }
    }

    if (report.ingested.length > 0) {
      const lastSessionId = db
        .select()
        .from(sessions)
        .all()
        .find((s) => report.ingested.some((t) => t.endsWith(s.type)))?.id ?? null;
      report.snapshotWritten = writeSnapshot(db, year, lastSessionId);
    }

    log(db, `${year} sync`, "OK", report.ingested.length, report.ingested.join(", ") || "nothing due");
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    log(db, `${year} sync`, "FAILED", 0, report.error);
  }

  return report;
}

/** The sessions this deployment is still waiting on, for status reporting. */
export function pendingSessions(db: Db, year: number, now: Date) {
  const season = db.select().from(seasons).where(eq(seasons.year, year)).get();
  if (!season) return [];
  const calendar = db.select().from(events).where(eq(events.seasonId, season.id)).all();
  const byId = new Map(calendar.map((e) => [e.id, e]));

  return db
    .select()
    .from(sessions)
    .all()
    .filter((s) => s.definitive && byId.has(s.eventId))
    .map((s) => {
      const event = byId.get(s.eventId)!;
      const scheduled = { id: s.id, type: s.type, dateUtc: s.dateUtc, status: s.status };
      return { session: s, event, fetchAt: fetchAfter(scheduled, { dateStart: event.dateStart, dateEnd: event.dateEnd }) };
    })
    .filter((x) => x.fetchAt.getTime() > now.getTime())
    .sort((a, b) => a.fetchAt.getTime() - b.fetchAt.getTime());
}
