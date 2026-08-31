import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { events, seasons } from "../db/schema";
import { GP_POINTS } from "../points";
import { loadHauls } from "./distributions";
import { mulberry32, pickIndex } from "./rng";
import { buildPool, simulate, type SimulationResult, type WeekendSample } from "./simulate";

/**
 * How many seasons of history the simulation may sample from.
 *
 * 1 = the current season only. Prior seasons describe different machinery and
 * different circumstances: Marc rode a Honda in 2023 and a year-old Gresini bike
 * in 2024, and Martin missed most of 2025 injured. Sampling those weekends to
 * predict 2026 form imports the wrong rider.
 */
export const POOL_SEASONS = 1;

export const RUNS = 10_000;
export const BOOTSTRAP_REPLICATES = 20;
export const BOOTSTRAP_RUNS = 1_000;
export const SEED = 93;

export interface SensitivityPoint {
  /** Grand Prix position at the next round; null is a DNF or no points. */
  gpPosition: number | null;
  label: string;
  probability: number;
}

export interface Forecast {
  runs: number;
  probability: number;
  confidenceLow: number;
  confidenceHigh: number;
  /** Chance the title is settled at each remaining round. */
  clinchByRound: { round: number; shortName: string; probability: number }[];
  never: number;
  /** Title probability conditioned on each possible next-race result. */
  sensitivity: SensitivityPoint[];
  /** The worst next-race finish that keeps the title probability from collapsing. */
  minimumPosition: number | null;
  minimumLabel: string;
  meanFinalPoints: { riderId: string; points: number }[];
}

/**
 * The cliff edge in the sensitivity curve.
 *
 * "The minimum" is the worst result whose title probability still holds at least
 * `retention` of the best achievable one. Below that the curve falls away and the
 * result stops being survivable. Expressed relative to the best case rather than
 * as a fixed percentage, because a rider 100 points behind and a rider leading
 * need the same question answered on their own scale.
 */
export const RETENTION = 0.8;

export function forecast(
  db: Db,
  year: number,
  trackedRiderId: string,
  rivalIds: string[],
  afterRound: number,
  currentPoints: Map<string, number>,
  currentWins: Map<string, number>,
  runs = RUNS,
  options: { poolSeasons?: number; formDrift?: number } = {}
): Forecast {
  const season = db.select().from(seasons).where(eq(seasons.year, year)).get();
  if (!season) throw new Error(`Season ${year} not seeded`);

  const remainingCircuits = db
    .select()
    .from(events)
    .where(eq(events.seasonId, season.id))
    .all()
    .filter((e) => e.round > afterRound)
    .sort((a, b) => a.round - b.round)
    .map((e) => ({ round: e.round, circuitId: e.circuitId, shortName: e.shortName }));

  const riderIds = [trackedRiderId, ...rivalIds];
  const poolSeasons = options.poolSeasons ?? POOL_SEASONS;
  const eligible = loadHauls(db).filter((h) => h.year > year - poolSeasons);
  const pool = buildPool(eligible, riderIds);
  if (pool.length === 0) throw new Error("No weekend in history has a result for every simulated rider");

  const input = { riderIds, trackedRiderId, currentPoints, currentWins, remainingCircuits, pool, formDrift: options.formDrift };
  const base = simulate(input, runs, SEED);

  // Conditional runs: hold the next Grand Prix result fixed and re-simulate.
  //
  // Every condition uses the SAME seed — common random numbers. Each conditional
  // season then differs from its sibling only in the forced result, so the curve
  // measures the effect of the finish rather than the noise between runs. With
  // independent seeds the sampling error swamps the signal and the curve comes
  // out non-monotonic: a P7 appearing to beat a P6, which cannot be true.
  const positions: (number | null)[] = [...GP_POINTS.map((_, i) => i + 1), null];
  const sensitivity: SensitivityPoint[] = positions.map((gpPosition) => ({
    gpPosition,
    label: gpPosition === null ? "DNF" : `P${gpPosition}`,
    probability: simulate(input, runs, SEED, { gpPosition }).probability
  }));

  // Bootstrap the pool to get a band around the probability itself: resample the
  // weekends with replacement, re-run, and see how far the answer moves. A real
  // random draw, seeded so the band is reproducible — an arithmetic pattern can
  // collapse a small pool onto one repeated weekend and report 0% to 86%.
  const bootstrapRandom = mulberry32(SEED + 7919);
  const replicates: number[] = [];
  for (let b = 0; b < BOOTSTRAP_REPLICATES; b++) {
    const resampled: WeekendSample[] = [];
    for (let i = 0; i < pool.length; i++) {
      resampled.push(pool[pickIndex(bootstrapRandom, pool.length)]);
    }
    replicates.push(simulate({ ...input, pool: resampled }, BOOTSTRAP_RUNS, SEED + 1000 + b).probability);
  }
  replicates.sort((a, b) => a - b);

  const best = Math.max(...sensitivity.map((s) => s.probability));
  const survivable = sensitivity.filter((s) => s.gpPosition !== null && s.probability >= best * RETENTION);
  const minimumPosition = survivable.length === 0 ? null : Math.max(...survivable.map((s) => s.gpPosition!));

  return {
    runs,
    probability: base.probability,
    confidenceLow: replicates[Math.floor(replicates.length * 0.1)],
    confidenceHigh: replicates[Math.ceil(replicates.length * 0.9) - 1],
    clinchByRound: remainingCircuits.map((c, i) => ({
      round: c.round,
      shortName: c.shortName,
      probability: base.clinchByRound[i]
    })),
    never: base.never,
    sensitivity,
    minimumPosition,
    minimumLabel: minimumPosition === null ? "no finish keeps it alive" : `P${minimumPosition}`,
    meanFinalPoints: [...base.meanFinalPoints].map(([riderId, points]) => ({ riderId, points }))
  };
}
