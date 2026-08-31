import { compareCountback } from "./championship";
import { standingOf } from "./championship";
import type { ChampionshipState, RiderStanding } from "./types";

/**
 * A rider is mathematically eliminated when even a perfect run cannot reach
 * the leader. Provable, and never a prediction.
 */
export function isEliminated(state: ChampionshipState, riderId: string): boolean {
  const rider = standingOf(state, riderId);
  const leader = state.standings[0];
  if (rider.riderId === leader.riderId) return false;
  return rider.points + state.pointsAvailable < leader.points;
}

/** Everyone still mathematically able to win the title. */
export function contenders(state: ChampionshipState): RiderStanding[] {
  return state.standings.filter((s) => !isEliminated(state, s.riderId));
}

/**
 * Has this rider mathematically secured the championship?
 *
 * Clinched when their total exceeds every rival's maximum possible total.
 *
 * On an exact tie the rider would win on countback today, but a rival taking
 * every remaining point would also be adding wins, which can overturn that
 * countback. The engine therefore refuses to call an exact tie a clinch — the
 * conservative direction, and the only one that can never be wrong.
 */
export function hasClinched(state: ChampionshipState, riderId: string): boolean {
  const rider = standingOf(state, riderId);
  const rivals = state.standings.filter((s) => s.riderId !== riderId);
  if (rivals.length === 0) return true;
  return rivals.every((rival) => rider.points > rival.points + state.pointsAvailable);
}

/** The rider who would be champion if the season ended now, countback included. */
export function currentChampion(state: ChampionshipState): RiderStanding {
  return [...state.standings].sort((a, b) => (b.points - a.points) || compareCountback(a, b))[0];
}

/**
 * The points a rider must still take to finish strictly ahead of a given rival,
 * assuming that rival ends the season on `rivalFinalPoints`.
 */
export function pointsNeededToBeat(riderPoints: number, rivalFinalPoints: number): number {
  return Math.max(0, rivalFinalPoints + 1 - riderPoints);
}
