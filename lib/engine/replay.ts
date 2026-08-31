import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { events, riders, seasons, sessionResults, sessions } from "../db/schema";
import { buildChampionshipState } from "./championship";
import { hasClinched } from "./clinch";
import type { ChampionshipState, ResultRow } from "./types";

export interface RoundState {
  round: number;
  shortName: string;
  state: ChampionshipState;
}

/**
 * Replays a season round by round, yielding the championship state after each.
 * Only definitive sessions contribute — a superseded, restarted race never does.
 */
export function replaySeason(db: Db, year: number): { rounds: RoundState[]; names: Map<string, string> } {
  const season = db.select().from(seasons).where(eq(seasons.year, year)).get();
  if (!season) throw new Error(`Season ${year} not seeded`);

  const calendar = db
    .select()
    .from(events)
    .where(eq(events.seasonId, season.id))
    .all()
    .sort((a, b) => a.round - b.round);

  const allSessions = db.select().from(sessions).all().filter((s) => s.definitive);
  const sessionsByEvent = new Map<string, string[]>();
  for (const s of allSessions) {
    sessionsByEvent.set(s.eventId, [...(sessionsByEvent.get(s.eventId) ?? []), s.id]);
  }
  const typeOf = new Map(allSessions.map((s) => [s.id, s.type]));

  const resultsBySession = new Map<string, ResultRow[]>();
  for (const r of db.select().from(sessionResults).all()) {
    const type = typeOf.get(r.sessionId);
    if (!type) continue;
    const list = resultsBySession.get(r.sessionId) ?? [];
    list.push({ riderId: r.riderId, sessionType: type, position: r.position, points: r.points });
    resultsBySession.set(r.sessionId, list);
  }

  // Derived from the highest round number, not the row count: a partially
  // populated calendar must not silently shrink the season.
  const totalRounds = calendar.reduce((max, e) => Math.max(max, e.round), 0);
  const accumulated: ResultRow[] = [];
  const rounds: RoundState[] = [];

  for (const event of calendar) {
    const ids = sessionsByEvent.get(event.id) ?? [];
    const rows = ids.flatMap((id) => resultsBySession.get(id) ?? []);
    if (rows.length === 0) continue; // round not run yet
    accumulated.push(...rows);
    rounds.push({
      round: event.round,
      shortName: event.shortName,
      state: buildChampionshipState(accumulated, totalRounds - event.round)
    });
  }

  const names = new Map(db.select().from(riders).all().map((r) => [r.id, r.fullName]));
  return { rounds, names };
}

/** The round after which the eventual champion was mathematically uncatchable. */
export function clinchRound(rounds: RoundState[], championId: string): RoundState | null {
  return rounds.find((r) => hasClinched(r.state, championId)) ?? null;
}
