import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { events, seasons } from "../db/schema";
import { replaySeason } from "../engine/replay";
import { loadHauls } from "./distributions";
import { CONTENDER_DEPTH } from "../config";
import { POOL_SEASONS } from "./forecast";
import { buildPool, simulate } from "./simulate";

export interface Prediction {
  year: number;
  round: number;
  shortName: string;
  riderId: string;
  riderName: string;
  roundsRemaining: number;
  /** The model's probability that this rider takes the title. */
  probability: number;
  /** Baseline: whoever leads is champion. */
  leaderBaseline: number;
  /** Baseline: probability proportional to points already scored. */
  proportionalBaseline: number;
  /** What actually happened: 1 if this rider won the title, else 0. */
  outcome: 0 | 1;
}

export interface Calibration {
  bucket: string;
  predictions: number;
  meanPredicted: number;
  observedFrequency: number;
}

export interface BacktestResult {
  predictions: Prediction[];
  brier: number;
  leaderBrier: number;
  proportionalBrier: number;
  calibration: Calibration[];
  /** Mean predicted probability minus observed rate: positive means over-confident. */
  bias: number;
  /** Largest gap between what a bucket said and what happened. */
  maxCalibrationError: number;
}

/**
 * The history that existed at a given point in a season.
 *
 * The backtest is worthless without this: if the pool contained races the model
 * is being asked to predict, it would be sampling the answer.
 */
export function availableHistory<T extends { year: number; round: number }>(
  hauls: T[],
  year: number,
  afterRound: number
): T[] {
  return hauls.filter((h) => h.year < year || (h.year === year && h.round <= afterRound));
}

export const MIN_POOL = 5;
export const BACKTEST_RUNS = 2_000;
/** Riders carried per prediction — matches the shipped simulation. */
export const DEPTH = CONTENDER_DEPTH;

/**
 * Replays a completed season round by round and records what the model would
 * have said at the time.
 *
 * The pool is cut off at each round: only weekends that had already happened are
 * available. Without that, the model would be sampling from races it is being
 * asked to predict, and every score would be meaningless.
 */
export function backtestSeason(db: Db, year: number, formDrift?: number, poolSeasons = POOL_SEASONS): Prediction[] {
  const season = db.select().from(seasons).where(eq(seasons.year, year)).get();
  if (!season) throw new Error(`Season ${year} not seeded`);

  const { rounds, names } = replaySeason(db, year);
  if (rounds.length === 0) return [];

  const finalState = rounds[rounds.length - 1].state;
  const champion = finalState.standings[0].riderId;

  const calendar = db
    .select()
    .from(events)
    .where(eq(events.seasonId, season.id))
    .all()
    .sort((a, b) => a.round - b.round);

  const allHauls = loadHauls(db);
  const predictions: Prediction[] = [];

  for (const snapshot of rounds) {
    const state = snapshot.state;
    if (state.roundsRemaining < 1) continue;

    const contenders = state.standings.slice(0, DEPTH);
    const riderIds = contenders.map((c) => c.riderId);

    // Only history that had already happened when this round finished.
    const available = availableHistory(allHauls, year, snapshot.round).filter((h) => h.year > year - poolSeasons);
    const pool = buildPool(available, riderIds);
    if (pool.length < MIN_POOL) continue;

    const remainingCircuits = calendar
      .filter((e) => e.round > snapshot.round)
      .map((e) => ({ round: e.round, circuitId: e.circuitId, shortName: e.shortName }));

    const currentPoints = new Map(state.standings.map((s) => [s.riderId, s.points]));
    const currentWins = new Map(state.standings.map((s) => [s.riderId, s.positionCounts[0] ?? 0]));
    const totalPoints = contenders.reduce((sum, c) => sum + c.points, 0);

    for (const rider of contenders) {
      const result = simulate(
        {
          riderIds,
          trackedRiderId: rider.riderId,
          currentPoints,
          currentWins,
          remainingCircuits,
          pool,
          formDrift
        },
        BACKTEST_RUNS,
        // Seeded per prediction so the backtest is reproducible.
        year * 1000 + snapshot.round * 10 + riderIds.indexOf(rider.riderId)
      );

      predictions.push({
        year,
        round: snapshot.round,
        shortName: snapshot.shortName,
        riderId: rider.riderId,
        riderName: names.get(rider.riderId) ?? "?",
        roundsRemaining: state.roundsRemaining,
        probability: result.probability,
        leaderBaseline: rider.position === 1 ? 1 : 0,
        proportionalBaseline: totalPoints === 0 ? 0 : rider.points / totalPoints,
        outcome: rider.riderId === champion ? 1 : 0
      });
    }
  }

  return predictions;
}

/** Mean squared error of a probabilistic forecast. Lower is better; 0 is perfect. */
export function brierScore(predictions: Prediction[], pick: (p: Prediction) => number): number {
  if (predictions.length === 0) return NaN;
  const total = predictions.reduce((sum, p) => sum + (pick(p) - p.outcome) ** 2, 0);
  return Math.round((total / predictions.length) * 10000) / 10000;
}

/**
 * The reliability curve: of all the times the model said ~70%, did it happen
 * about 70% of the time? That, not picking winners, is what makes a probability
 * accurate.
 */
export function calibrate(predictions: Prediction[], buckets = 5): Calibration[] {
  const rows: Calibration[] = [];
  for (let b = 0; b < buckets; b++) {
    const low = b / buckets;
    const high = (b + 1) / buckets;
    const inBucket = predictions.filter(
      (p) => p.probability >= low && (b === buckets - 1 ? p.probability <= high : p.probability < high)
    );
    if (inBucket.length === 0) continue;
    rows.push({
      bucket: `${Math.round(low * 100)}-${Math.round(high * 100)}%`,
      predictions: inBucket.length,
      meanPredicted: Math.round((inBucket.reduce((s, p) => s + p.probability, 0) / inBucket.length) * 1000) / 1000,
      observedFrequency: Math.round((inBucket.reduce((s, p) => s + p.outcome, 0) / inBucket.length) * 1000) / 1000
    });
  }
  return rows;
}

export function backtest(db: Db, years: number[], formDrift?: number, poolSeasons?: number): BacktestResult {
  const predictions = years.flatMap((year) => backtestSeason(db, year, formDrift, poolSeasons));
  const meanPredicted = predictions.reduce((s, p) => s + p.probability, 0) / Math.max(1, predictions.length);
  const observed = predictions.reduce((s, p) => s + p.outcome, 0) / Math.max(1, predictions.length);

  const calibration = calibrate(predictions);
  return {
    predictions,
    brier: brierScore(predictions, (p) => p.probability),
    leaderBrier: brierScore(predictions, (p) => p.leaderBaseline),
    proportionalBrier: brierScore(predictions, (p) => p.proportionalBaseline),
    calibration,
    bias: Math.round((meanPredicted - observed) * 1000) / 1000,
    maxCalibrationError: calibration.reduce(
      (worst, c) => Math.max(worst, Math.abs(c.observedFrequency - c.meanPredicted)),
      0
    )
  };
}
