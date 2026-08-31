import { MAX_WEEKEND_POINTS, minimumWeekendFor } from "../points";
import { standingOf } from "./championship";
import { pointsNeededToBeat } from "./clinch";
import type { ChampionshipState, ChampionshipStatus, RivalAssumption } from "./types";

/** Rivals take every remaining point — the worst case, and assumption-free. */
export const RIVALS_MAX: RivalAssumption = () => MAX_WEEKEND_POINTS;

/** Rivals score nothing — the best case, and assumption-free. */
export const RIVALS_ZERO: RivalAssumption = () => 0;

export interface Anchor {
  /** Index into the remaining rounds, 0 being the next race. */
  roundIndex: number;
  /** Points the tracked rider is assumed to take at the anchor round. */
  points: number;
  label: string;
}

/**
 * How the season-long requirement is turned into a number for the NEXT race.
 *
 * - `anchor`: assume the tracked rider scores as assumed at every later round
 *   and the anchor delivers its points; whatever is left falls on the next race.
 *   Exact, but when the assumption does not reach the target the entire season's
 *   shortfall lands on one weekend and the answer is always "impossible".
 * - `pace`:   spread the requirement evenly across the rounds that remain. This
 *   is the championship-pace reading — "what must Marc average from here" — and
 *   it is the only one that stays meaningful when rivals are assumed to ride well.
 */
export type Distribution = "anchor" | "pace";

export interface Requirement {
  /** Points the tracked rider must take at the next round. */
  requiredNow: number;
  /** Total points still needed across all remaining rounds. */
  requiredTotal: number;
  status: ChampionshipStatus;
  minimum: { sprint: number | null; gp: number | null; points: number } | null;
  anchor: Anchor;
}

/** The default anchor: champion by taking a podium at the final round. */
export function defaultAnchor(roundsRemaining: number, gpPosition = 3): Anchor {
  return {
    roundIndex: Math.max(0, roundsRemaining - 1),
    points: gpPosition === 3 ? 16 : 0,
    label: `P${gpPosition} at the final round`
  };
}

/**
 * Backward induction from the anchor.
 *
 * Walks the remaining rounds under a rival assumption, works out what the
 * tracked rider must still score in total, subtracts what the anchor round and
 * the rounds between here and there are assumed to contribute, and returns what
 * is left to find at the next race.
 *
 * The rival assumption is injected: Layer 1 supplies only the two provable
 * bounds, and M5's p75 distribution plugs in unchanged.
 */
export function computeRequirement(
  state: ChampionshipState,
  trackedRiderId: string,
  options: {
    rivalAssumption: RivalAssumption;
    /** What the tracked rider is assumed to take at intermediate rounds. */
    trackedAssumption?: RivalAssumption;
    anchor?: Anchor;
    distribute?: Distribution;
  }
): Requirement {
  const tracked = standingOf(state, trackedRiderId);
  const anchor = options.anchor ?? defaultAnchor(state.roundsRemaining);
  const trackedAssumption = options.trackedAssumption ?? (() => 0);

  // Where every rival ends up under the assumption.
  let worstRivalFinal = 0;
  for (const rival of state.standings) {
    if (rival.riderId === trackedRiderId) continue;
    let final = rival.points;
    for (let round = 0; round < state.roundsRemaining; round++) {
      final += Math.min(MAX_WEEKEND_POINTS, options.rivalAssumption(rival.riderId, round));
    }
    worstRivalFinal = Math.max(worstRivalFinal, final);
  }

  const requiredTotal = Math.ceil(pointsNeededToBeat(tracked.points, worstRivalFinal));

  let requiredNow: number;
  if ((options.distribute ?? "anchor") === "pace") {
    // Spread evenly over the rounds that remain — the championship-pace reading.
    requiredNow = state.roundsRemaining === 0 ? requiredTotal : Math.ceil(requiredTotal / state.roundsRemaining);
  } else {
    // What the rounds other than the next one are assumed to contribute.
    let assumedElsewhere = 0;
    for (let round = 1; round < state.roundsRemaining; round++) {
      assumedElsewhere += round === anchor.roundIndex ? anchor.points : Math.min(MAX_WEEKEND_POINTS, trackedAssumption(trackedRiderId, round));
    }
    requiredNow = Math.ceil(requiredTotal - assumedElsewhere);
  }
  const minimum = minimumWeekendFor(requiredNow);

  return {
    requiredNow,
    requiredTotal,
    status: classifyStatus(requiredNow),
    minimum,
    anchor
  };
}

/** The one scalar, three states. */
export function classifyStatus(requiredNow: number): ChampionshipStatus {
  if (requiredNow > MAX_WEEKEND_POINTS) return "OUT_OF_HIS_HANDS";
  if (requiredNow <= 0) return "ALREADY_DECIDED";
  return "LIVE_FIGHT";
}

/**
 * The earliest remaining round at which the tracked rider could mathematically
 * be crowned, assuming they take a perfect weekend every round and rivals score
 * as assumed. Returns null when no remaining round can deliver it.
 *
 * This is the anchor migration: as points are banked, this walks backward.
 */
export function earliestClinchRound(
  state: ChampionshipState,
  trackedRiderId: string,
  rivalAssumption: RivalAssumption
): number | null {
  const tracked = standingOf(state, trackedRiderId);
  const rivals = state.standings.filter((s) => s.riderId !== trackedRiderId);

  for (let round = 0; round < state.roundsRemaining; round++) {
    const roundsPlayed = round + 1;
    const roundsLeftAfter = state.roundsRemaining - roundsPlayed;
    const trackedPoints = tracked.points + roundsPlayed * MAX_WEEKEND_POINTS;

    const clinched = rivals.every((rival) => {
      let rivalPoints = rival.points;
      for (let r = 0; r < roundsPlayed; r++) {
        rivalPoints += Math.min(MAX_WEEKEND_POINTS, rivalAssumption(rival.riderId, r));
      }
      return trackedPoints > rivalPoints + roundsLeftAfter * MAX_WEEKEND_POINTS;
    });

    if (clinched) return round;
  }
  return null;
}
