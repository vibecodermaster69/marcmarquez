import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { circuits, events, riders, sessionResults, sessions, syncLog } from "../db/schema";
import {
  isDnf,
  type ApiClassificationEntry,
  type ApiEvent,
  type ApiSession,
  type MotoGpClient
} from "../motogp/client";
import { pointsForPosition } from "../points";

export interface ValidationIssue {
  sessionId: string;
  reason: string;
}

/**
 * Validates a classification before it is allowed near the database.
 * A malformed fetch is rejected and logged; it never overwrites good data.
 */
export function validateClassification(
  type: "SPR" | "RAC",
  entries: ApiClassificationEntry[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenPositions = new Set<number>();
  const seenRiders = new Set<string>();

  if (entries.length === 0) issues.push({ sessionId: "", reason: "empty classification" });

  for (const entry of entries) {
    if (seenRiders.has(entry.rider.id)) {
      issues.push({ sessionId: "", reason: `duplicate rider ${entry.rider.full_name}` });
    }
    seenRiders.add(entry.rider.id);

    if (entry.position !== null) {
      if (seenPositions.has(entry.position)) {
        issues.push({ sessionId: "", reason: `duplicate position ${entry.position}` });
      }
      seenPositions.add(entry.position);
    }

    // The points upstream reports must match the points the position earns.
    // This is the check that catches a silently changed points system.
    const expected = pointsForPosition(type, entry.position);
    const actual = entry.points ?? 0;
    if (expected !== actual) {
      issues.push({
        sessionId: "",
        reason: `points mismatch for ${entry.rider.full_name}: position ${entry.position} should score ${expected}, API says ${actual}`
      });
    }
  }

  return issues;
}

export function upsertRider(
  db: Db,
  entry: { id: string; full_name: string; number: number | null; country: { iso: string } }
) {
  db.insert(riders)
    .values({ id: entry.id, fullName: entry.full_name, number: entry.number, countryIso: entry.country?.iso ?? null })
    .onConflictDoUpdate({ target: riders.id, set: { fullName: entry.full_name, number: entry.number } })
    .run();
}

export function upsertCircuit(db: Db, event: ApiEvent) {
  db.insert(circuits)
    .values({
      id: event.circuit.id,
      name: event.circuit.name,
      place: event.circuit.place ?? null,
      nation: event.circuit.nation ?? null
    })
    .onConflictDoNothing()
    .run();
}

export function upsertEvent(db: Db, seasonId: string, event: ApiEvent & { round: number }) {
  upsertCircuit(db, event);
  db.insert(events)
    .values({
      id: event.id,
      seasonId,
      circuitId: event.circuit.id,
      round: event.round,
      shortName: event.short_name,
      name: event.name,
      dateStart: event.date_start,
      dateEnd: event.date_end,
      status: event.status
    })
    .onConflictDoUpdate({
      target: events.id,
      set: { round: event.round, status: event.status, dateStart: event.date_start, dateEnd: event.date_end }
    })
    .run();
}

export function upsertScoringSession(db: Db, eventId: string, session: ApiSession, definitive: boolean) {
  db.insert(sessions)
    .values({
      id: session.id,
      eventId,
      type: session.type as "SPR" | "RAC",
      dateUtc: session.date,
      status: session.status,
      condition: session.condition?.track ?? null,
      definitive
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: { status: session.status, dateUtc: session.date, definitive }
    })
    .run();
}

export function log(
  db: Db,
  target: string,
  status: "OK" | "FAILED" | "REJECTED",
  rowsWritten: number,
  error?: string,
  id?: string
) {
  db.insert(syncLog)
    .values({ id: id ?? `${target}-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, target, status, rowsWritten, error: error ?? null })
    .onConflictDoNothing()
    .run();
}

export interface IngestOutcome {
  written: number;
  rejected: ValidationIssue | null;
}

/**
 * Fetches, validates and stores one scoring session's classification.
 * Idempotent: the upsert is keyed on (session, rider), so a re-run of a session
 * already ingested rewrites the same rows rather than adding points.
 */
export async function ingestSession(
  db: Db,
  client: MotoGpClient,
  session: ApiSession,
  target: string
): Promise<IngestOutcome> {
  const type = session.type as "SPR" | "RAC";
  const classification = await client.classification(session.id);
  const issues = validateClassification(type, classification);

  if (issues.length > 0) {
    const reason = issues.map((i) => i.reason).join("; ");
    log(db, target, "REJECTED", 0, reason);
    return { written: 0, rejected: { sessionId: session.id, reason } };
  }

  for (const entry of classification) {
    upsertRider(db, entry.rider);
    db.insert(sessionResults)
      .values({
        id: entry.id,
        sessionId: session.id,
        riderId: entry.rider.id,
        position: entry.position,
        points: entry.points ?? 0,
        status: entry.status,
        dnf: isDnf(entry.status),
        teamName: entry.team?.name ?? null,
        constructorName: entry.constructor?.name ?? null
      })
      .onConflictDoUpdate({
        target: [sessionResults.sessionId, sessionResults.riderId],
        set: { position: entry.position, points: entry.points ?? 0, status: entry.status, dnf: isDnf(entry.status) }
      })
      .run();
  }

  log(db, target, "OK", classification.length);
  return { written: classification.length, rejected: null };
}

/**
 * Picks which session of each type actually counts for the championship.
 *
 * A red-flagged Grand Prix appears twice upstream: the abandoned run and the
 * restart. Only one awards points, so the definitive session is the one that
 * awarded any — falling back to the latest by date when nothing has been scored
 * yet (an upcoming round), which keeps future events resolvable without a fetch.
 */
export async function resolveDefinitiveSessions(
  client: MotoGpClient,
  apiSessions: ApiSession[]
): Promise<{ session: ApiSession; definitive: boolean }[]> {
  const byType = new Map<string, ApiSession[]>();
  for (const session of apiSessions) {
    const list = byType.get(session.type) ?? [];
    list.push(session);
    byType.set(session.type, list);
  }

  const resolved: { session: ApiSession; definitive: boolean }[] = [];

  for (const [, group] of byType) {
    if (group.length === 1) {
      resolved.push({ session: group[0], definitive: true });
      continue;
    }

    const scored: { session: ApiSession; points: number }[] = [];
    for (const session of group) {
      if (session.status !== "FINISHED") {
        scored.push({ session, points: 0 });
        continue;
      }
      const classification = await client.classification(session.id);
      const points = classification.reduce((sum, e) => sum + (e.points ?? 0), 0);
      scored.push({ session, points });
    }

    const anyScored = scored.some((s) => s.points > 0);
    const winner = anyScored
      ? scored.reduce((a, b) => (b.points > a.points ? b : a)).session
      : [...group].sort((a, b) => b.date.localeCompare(a.date))[0];

    for (const session of group) {
      resolved.push({ session, definitive: session.id === winner.id });
    }
  }

  return resolved;
}

/** Has this session already been stored with results? */
export function isAlreadyIngested(db: Db, sessionId: string): boolean {
  return db.select().from(sessionResults).where(eq(sessionResults.sessionId, sessionId)).all().length > 0;
}
