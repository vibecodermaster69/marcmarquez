import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { events, seasons, sessionResults, sessions } from "../db/schema";

export interface WeekendHaul {
  riderId: string;
  eventId: string;
  circuitId: string;
  round: number;
  year: number;
  points: number;
  /** Split by session, so a simulation can hold one session fixed. */
  sprintPoints: number;
  gpPoints: number;
  dnf: boolean;
}

/**
 * Every rider's points haul for every completed weekend, sprint and Grand Prix
 * combined. Only definitive sessions count — a superseded, restarted race
 * awarded nothing and must not appear as a zero.
 *
 * Points and DNFs only. Nothing about conditions enters this pipeline.
 */
export function weekendHauls(db: Db): WeekendHaul[] {
  const seasonYear = new Map(db.select().from(seasons).all().map((s) => [s.id, s.year]));
  const eventById = new Map(db.select().from(events).all().map((e) => [e.id, e]));
  const definitive = db.select().from(sessions).all().filter((s) => s.definitive);
  const sessionById = new Map(definitive.map((s) => [s.id, s]));

  const byKey = new Map<string, WeekendHaul>();
  const sessionsSeen = new Map<string, Set<string>>();

  for (const result of db.select().from(sessionResults).all()) {
    const session = sessionById.get(result.sessionId);
    if (!session) continue;
    const event = eventById.get(session.eventId);
    if (!event) continue;

    const key = `${result.riderId}:${event.id}`;
    const haul = byKey.get(key) ?? {
      riderId: result.riderId,
      eventId: event.id,
      circuitId: event.circuitId,
      round: event.round,
      year: seasonYear.get(event.seasonId) ?? 0,
      points: 0,
      sprintPoints: 0,
      gpPoints: 0,
      dnf: false
    };
    haul.points += result.points;
    if (session.type === "SPR") haul.sprintPoints += result.points;
    else haul.gpPoints += result.points;
    // A weekend counts as a DNF only if the Grand Prix itself was not finished.
    if (session.type === "RAC" && result.dnf) haul.dnf = true;
    byKey.set(key, haul);

    const seen = sessionsSeen.get(key) ?? new Set<string>();
    seen.add(session.type);
    sessionsSeen.set(key, seen);
  }

  // Only weekends where the rider actually appeared in the Grand Prix are a
  // meaningful sample; a rider absent from the entry list is not a zero score.
  return [...byKey.entries()]
    .filter(([key]) => sessionsSeen.get(key)?.has("RAC"))
    .map(([, haul]) => haul);
}
