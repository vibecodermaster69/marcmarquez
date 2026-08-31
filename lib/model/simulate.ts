import { MAX_WEEKEND_POINTS, pointsForPosition } from "../points";
import type { WeekendHaul } from "./hauls";
import { mulberry32, pickIndex } from "./rng";

/**
 * Share of weekends whose results are reassigned among riders.
 *
 * Zero: the simulation trusts who a rider is.
 *
 * Drift was introduced to cure over-confidence, and it did — but only because
 * the sampling pool was full of stale history (Marc on a Honda in 2023, a
 * year-old Gresini bike in 2024, Martin absent for most of 2025). Once the pool
 * is restricted to the current season, drift stops helping and starts hurting:
 * the backtest Brier is 0.0411 at drift 0 and worsens monotonically from there.
 * The right fix was the pool, not the shuffling.
 */
export const DEFAULT_FORM_DRIFT = 0;

/**
 * One real weekend, as it actually happened, for the riders being simulated.
 * Sampling these WHOLE — rather than drawing each rider independently — is what
 * carries the correlation between riders. The wet race that took out three of
 * them stays a wet race that took out three of them, with no covariance matrix,
 * no conditions model and nothing fitted.
 */
export interface WeekendSample {
  eventId: string;
  circuitId: string;
  /** riderId -> that weekend's haul, split by session. */
  hauls: Map<string, { points: number; sprintPoints: number; gpPoints: number }>;
}

export interface SimulationInput {
  /** Riders to simulate: the tracked rider first, then the rivals that matter. */
  riderIds: string[];
  trackedRiderId: string;
  /** Points already banked, per rider. */
  currentPoints: Map<string, number>;
  /** Grand Prix wins already banked, for the tie countback. */
  currentWins: Map<string, number>;
  /** The circuits still to visit, in round order. */
  remainingCircuits: { round: number; circuitId: string; shortName: string }[];
  pool: WeekendSample[];
  /** Prior-season weekends at the round's own circuit are repeated this many times. */
  circuitWeight?: number;
  /**
   * Probability that a drawn weekend's results are reassigned among the
   * simulated riders.
   *
   * Without this the simulation assumes form is permanent: a rider who has been
   * dominant keeps drawing their own dominant weekends for the rest of the
   * season, with no regression to the mean, no slump and no injury. The backtest
   * shows exactly that failure — the model said 95% and it happened 80% of the
   * time. Reassigning a share of weekends keeps the correlation structure
   * (someone won, someone crashed) while admitting that who plays which role can
   * change. The value is tuned on the backtest, not chosen by intuition.
   */
  formDrift?: number;
}

export interface SimulationResult {
  runs: number;
  /** Fraction of simulated seasons the tracked rider wins the title. */
  probability: number;
  /**
   * How often the title is mathematically settled at each remaining round.
   * Index matches `remainingCircuits`; `never` counts seasons the tracked rider
   * does not win at all.
   */
  clinchByRound: number[];
  never: number;
  /** Mean final points, for sanity reporting. */
  meanFinalPoints: Map<string, number>;
}

/**
 * Builds the sampling pool.
 *
 * A rider who did not start scored nothing, and that zero is part of the
 * championship — so an absence is recorded as a zero rather than the whole
 * weekend being discarded. Discarding was actively misleading: it removed the
 * rounds where a rival was hurt, which are exactly the rounds where the other
 * riders banked their biggest hauls. In 2026 it silently dropped Marc's Brno
 * win and his perfect Sachsenring weekend while also dropping his rivals' zeros.
 *
 * Pass `requireAll` to get the old behaviour, for comparison in the backtest.
 */
export function buildPool(
  hauls: WeekendHaul[],
  riderIds: string[],
  options: { requireAll?: boolean } = {}
): WeekendSample[] {
  const byEvent = new Map<string, WeekendSample>();
  for (const haul of hauls) {
    if (!riderIds.includes(haul.riderId)) continue;
    const sample = byEvent.get(haul.eventId) ?? {
      eventId: haul.eventId,
      circuitId: haul.circuitId,
      hauls: new Map()
    };
    sample.hauls.set(haul.riderId, {
      points: haul.points,
      sprintPoints: haul.sprintPoints,
      gpPoints: haul.gpPoints
    });
    byEvent.set(haul.eventId, sample);
  }
  const samples = [...byEvent.values()];
  if (options.requireAll) return samples.filter((s) => riderIds.every((id) => s.hauls.has(id)));

  // An absent rider scored zero that weekend.
  for (const sample of samples) {
    for (const id of riderIds) {
      if (!sample.hauls.has(id)) sample.hauls.set(id, { points: 0, sprintPoints: 0, gpPoints: 0 });
    }
  }
  return samples;
}

/** The draw pool for one round: the whole pool, with this circuit's history repeated. */
function poolForCircuit(pool: WeekendSample[], circuitId: string, weight: number): WeekendSample[] {
  const here = pool.filter((s) => s.circuitId === circuitId);
  if (here.length === 0) return pool;
  const weighted = [...pool];
  for (let i = 1; i < weight; i++) weighted.push(...here);
  return weighted;
}

/**
 * How the tracked rider's next weekend is forced, when running a conditional
 * simulation. `null` means "simulate it like any other round".
 */
export interface Condition {
  /** Grand Prix finishing position, or null for a DNF / no points. */
  gpPosition: number | null;
}

/**
 * Simulates the remaining season `runs` times.
 *
 * Each round draws one real historical weekend and applies every rider's actual
 * result from it. Nothing is fitted and no distribution is assumed.
 */
export function simulate(input: SimulationInput, runs: number, seed: number, condition?: Condition): SimulationResult {
  const random = mulberry32(seed);
  const weight = input.circuitWeight ?? 2;
  const drift = input.formDrift ?? DEFAULT_FORM_DRIFT;
  const rounds = input.remainingCircuits.length;
  const pools = input.remainingCircuits.map((c) => poolForCircuit(input.pool, c.circuitId, weight));

  const clinchByRound = new Array(rounds).fill(0);
  const totals = new Map<string, number>(input.riderIds.map((id) => [id, 0]));
  let titles = 0;
  let never = 0;

  const points = new Map<string, number>();
  const wins = new Map<string, number>();

  for (let run = 0; run < runs; run++) {
    for (const id of input.riderIds) {
      points.set(id, input.currentPoints.get(id) ?? 0);
      wins.set(id, input.currentWins.get(id) ?? 0);
    }

    let clinchRound = -1;

    for (let round = 0; round < rounds; round++) {
      const draw = pools[round][pickIndex(random, pools[round].length)];

      // Who plays which role in this weekend. Usually themselves; occasionally
      // shuffled, so a rider's past form is not treated as destiny.
      let roles = input.riderIds;
      if (drift > 0 && random() < drift) {
        const shuffled = [...input.riderIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = pickIndex(random, i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        roles = shuffled;
      }

      for (let r = 0; r < input.riderIds.length; r++) {
        const id = input.riderIds[r];
        const haul = draw.hauls.get(roles[r])!;
        let gained = haul.points;

        // Hold the tracked rider's Grand Prix result fixed at the next round
        // when running a conditional simulation. The sprint and every rival
        // still come from the drawn weekend, so correlation survives.
        if (round === 0 && condition && id === input.trackedRiderId) {
          gained = haul.sprintPoints + pointsForPosition("RAC", condition.gpPosition);
        }

        points.set(id, points.get(id)! + gained);
        if (haul.gpPoints === 25) wins.set(id, wins.get(id)! + 1);
      }

      if (clinchRound === -1) {
        const left = (rounds - round - 1) * MAX_WEEKEND_POINTS;
        const mine = points.get(input.trackedRiderId)!;
        const safe = input.riderIds.every(
          (id) => id === input.trackedRiderId || mine > points.get(id)! + left
        );
        if (safe) clinchRound = round;
      }
    }

    const mine = points.get(input.trackedRiderId)!;
    let champion = true;
    for (const id of input.riderIds) {
      if (id === input.trackedRiderId) continue;
      const theirs = points.get(id)!;
      if (theirs > mine) champion = false;
      // A dead heat falls to the countback on race wins.
      else if (theirs === mine && wins.get(id)! >= wins.get(input.trackedRiderId)!) champion = false;
    }

    if (champion) {
      titles += 1;
      if (clinchRound >= 0) clinchByRound[clinchRound] += 1;
      else clinchByRound[rounds - 1] += 1; // decided only at the final round
    } else {
      never += 1;
    }

    for (const id of input.riderIds) totals.set(id, totals.get(id)! + points.get(id)!);
  }

  return {
    runs,
    probability: titles / runs,
    clinchByRound: clinchByRound.map((c) => c / runs),
    never: never / runs,
    meanFinalPoints: new Map([...totals].map(([id, total]) => [id, Math.round((total / runs) * 10) / 10]))
  };
}
