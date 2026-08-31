import type { Db } from "../db";
import { MAX_WEEKEND_POINTS } from "../points";
import { weekendHauls, type WeekendHaul } from "./hauls";

/**
 * How many times a rider's past result at THIS circuit is repeated in the
 * sampling pool, relative to a result from the current season elsewhere.
 *
 * Circuit history is a small sample (two runnings), so it is weighted up rather
 * than modelled. This is the model's only tunable constant and M7's backtest is
 * what settles its value — not intuition.
 */
export const CIRCUIT_WEIGHT = 2;

export interface Distribution {
  /** The resampling pool: every observation, circuit history repeated. */
  samples: number[];
  n: number;
  p50: number;
  p75: number;
  mean: number;
  /** Population standard deviation of the pool — how erratic this rider is here. */
  sd: number;
  dnfRate: number;
  /** True when there was no history at all and the distribution is a fallback. */
  empty: boolean;
}

/** Nearest-rank percentile over a sorted sample. */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function describe(samples: number[], dnfRate: number): Distribution {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.length === 0 ? 0 : samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance =
    samples.length === 0 ? 0 : samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / samples.length;
  return {
    samples,
    n: samples.length,
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    mean: Math.round(mean * 100) / 100,
    sd: Math.round(Math.sqrt(variance) * 100) / 100,
    dnfRate: Math.round(dnfRate * 1000) / 1000,
    empty: samples.length === 0
  };
}

export interface DistributionOptions {
  year: number;
  /** Weight applied to prior-season results at the same circuit. */
  circuitWeight?: number;
}

/**
 * The empirical distribution of a rider's weekend haul at a given circuit.
 *
 * Built from two sources, both points-only:
 *   - every weekend this season (the rider's current level), and
 *   - this circuit in prior seasons, repeated `circuitWeight` times.
 *
 * Non-parametric: nothing is fitted, so there is no model to be wrong about.
 */
export function riderDistribution(
  hauls: WeekendHaul[],
  riderId: string,
  circuitId: string | null,
  options: DistributionOptions
): Distribution {
  const weight = options.circuitWeight ?? CIRCUIT_WEIGHT;
  const mine = hauls.filter((h) => h.riderId === riderId);

  const thisSeason = mine.filter((h) => h.year === options.year);
  const priorAtCircuit = mine.filter((h) => h.year < options.year && circuitId !== null && h.circuitId === circuitId);

  const samples: number[] = [];
  for (const h of thisSeason) samples.push(h.points);
  for (const h of priorAtCircuit) for (let i = 0; i < weight; i++) samples.push(h.points);

  // Fall back to the rider's whole history before giving up entirely.
  if (samples.length === 0) for (const h of mine) samples.push(h.points);

  const dnfPool = thisSeason.length > 0 ? thisSeason : mine;
  const dnfRate = dnfPool.length === 0 ? 0 : dnfPool.filter((h) => h.dnf).length / dnfPool.length;

  const distribution = describe(samples, dnfRate);
  if (distribution.samples.some((s) => s > MAX_WEEKEND_POINTS)) {
    throw new Error(`Impossible weekend haul for rider ${riderId}`);
  }
  return distribution;
}

/** Loads the haul history once; callers reuse it across riders and rounds. */
export function loadHauls(db: Db): WeekendHaul[] {
  return weekendHauls(db);
}
