import { MAX_WEEKEND_POINTS } from "../points";
import type { ChampionshipState, ResultRow, RiderStanding } from "./types";

/**
 * Which sessions feed the tie countback.
 *
 * FIM regulations break a points tie on "the number of best results in the
 * races". Whether a sprint counts as a race for that purpose is a rules
 * interpretation, not a fact, so it is a parameter rather than a hidden
 * assumption. Default: Grand Prix results only.
 */
export type CountbackScope = "RAC" | "ALL";

/**
 * Compares two riders on countback: most wins, then most seconds, and so on.
 * Returns a negative number when `a` ranks ahead of `b`.
 */
export function compareCountback(a: RiderStanding, b: RiderStanding): number {
  const depth = Math.max(a.positionCounts.length, b.positionCounts.length);
  for (let i = 0; i < depth; i++) {
    const diff = (b.positionCounts[i] ?? 0) - (a.positionCounts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Builds the championship table from raw session results. Pure — no I/O. */
export function buildStandings(rows: ResultRow[], scope: CountbackScope = "RAC"): RiderStanding[] {
  const byRider = new Map<string, { points: number; positionCounts: number[] }>();

  for (const row of rows) {
    const entry = byRider.get(row.riderId) ?? { points: 0, positionCounts: [] };
    entry.points += row.points;

    const countsForCountback = scope === "ALL" || row.sessionType === "RAC";
    if (countsForCountback && row.position !== null && row.position >= 1) {
      const index = row.position - 1;
      while (entry.positionCounts.length <= index) entry.positionCounts.push(0);
      entry.positionCounts[index] += 1;
    }

    byRider.set(row.riderId, entry);
  }

  return [...byRider.entries()]
    .map(([riderId, e]) => ({ riderId, points: e.points, positionCounts: e.positionCounts, position: 0 }))
    .sort((a, b) => (b.points - a.points) || compareCountback(a, b))
    .map((r, i) => ({ ...r, position: i + 1 }));
}

export function buildChampionshipState(
  rows: ResultRow[],
  roundsRemaining: number,
  scope: CountbackScope = "RAC"
): ChampionshipState {
  if (roundsRemaining < 0) throw new RangeError("roundsRemaining must be >= 0");
  return {
    standings: buildStandings(rows, scope),
    roundsRemaining,
    pointsAvailable: roundsRemaining * MAX_WEEKEND_POINTS
  };
}

export function standingOf(state: ChampionshipState, riderId: string): RiderStanding {
  const found = state.standings.find((s) => s.riderId === riderId);
  if (!found) throw new Error(`Rider ${riderId} is not in the standings`);
  return found;
}

/**
 * The rivals that matter: positional, never named.
 *
 * `depth` counts riders from the top of the table, the tracked rider included,
 * so the set follows the championship rather than a fixed cast. A rider who
 * climbs into range enters the model uninvited, and one who drops out leaves it.
 */
export function topRivals(state: ChampionshipState, trackedRiderId: string, depth = 3): RiderStanding[] {
  const inRange = state.standings.slice(0, depth).filter((s) => s.riderId !== trackedRiderId);
  // If the tracked rider sits outside the depth, keep the set the same size.
  if (state.standings.slice(0, depth).some((s) => s.riderId === trackedRiderId)) return inRange;
  return inRange.slice(0, Math.max(0, depth - 1));
}
