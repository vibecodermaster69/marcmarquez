import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_DB_PATH, createDb } from "../db";
import { availableHistory, backtest, backtestSeason, brierScore, calibrate, type Prediction } from "./backtest";

const prediction = (probability: number, outcome: 0 | 1): Prediction => ({
  year: 2025,
  round: 1,
  shortName: "AAA",
  riderId: "r",
  riderName: "R",
  roundsRemaining: 5,
  probability,
  leaderBaseline: 0,
  proportionalBaseline: 0,
  outcome
});

describe("brierScore", () => {
  it("is zero for a perfect forecast", () => {
    expect(brierScore([prediction(1, 1), prediction(0, 0)], (p) => p.probability)).toBe(0);
  });

  it("is one for a confidently wrong forecast", () => {
    expect(brierScore([prediction(1, 0), prediction(0, 1)], (p) => p.probability)).toBe(1);
  });

  it("is 0.25 for a coin flip", () => {
    expect(brierScore([prediction(0.5, 1), prediction(0.5, 0)], (p) => p.probability)).toBe(0.25);
  });

  it("punishes confidence more than hedging", () => {
    const confident = brierScore([prediction(0.9, 0)], (p) => p.probability);
    const hedged = brierScore([prediction(0.6, 0)], (p) => p.probability);
    expect(confident).toBeGreaterThan(hedged);
  });
});

describe("calibrate", () => {
  it("reports what was said against what happened", () => {
    // Ten predictions at 90%, nine of which came true.
    const predictions = [
      ...Array.from({ length: 9 }, () => prediction(0.9, 1 as const)),
      prediction(0.9, 0)
    ];
    const rows = calibrate(predictions);
    const top = rows.find((r) => r.bucket === "80-100%")!;
    expect(top.predictions).toBe(10);
    expect(top.meanPredicted).toBeCloseTo(0.9, 3);
    expect(top.observedFrequency).toBeCloseTo(0.9, 3);
  });

  it("exposes an over-confident model", () => {
    // Says 90% every time; happens 20% of the time.
    const predictions = [
      ...Array.from({ length: 2 }, () => prediction(0.9, 1 as const)),
      ...Array.from({ length: 8 }, () => prediction(0.9, 0 as const))
    ];
    const top = calibrate(predictions).find((r) => r.bucket === "80-100%")!;
    expect(top.observedFrequency).toBeLessThan(top.meanPredicted - 0.5);
  });

  it("skips empty buckets rather than inventing rows", () => {
    expect(calibrate([prediction(0.05, 0)])).toHaveLength(1);
  });
});

const seeded = fs.existsSync(DEFAULT_DB_PATH) ? describe : describe.skip;

seeded("backtesting real seasons", () => {
  const db = createDb();

  it("cannot see a race that had not happened yet", () => {
    const history = [
      { year: 2024, round: 20, id: "past-season" },
      { year: 2025, round: 5, id: "already-run" },
      { year: 2025, round: 6, id: "the-round-itself" },
      { year: 2025, round: 7, id: "the-future" },
      { year: 2026, round: 1, id: "next-season" }
    ];
    const available = availableHistory(history, 2025, 6).map((h) => h.id);
    expect(available).toEqual(["past-season", "already-run", "the-round-itself"]);
    expect(available).not.toContain("the-future");
    expect(available).not.toContain("next-season");
  });

  it("claims certainty only when the title is mathematically settled", () => {
    // The model runs hot on a dominant rider — empirical resampling assumes
    // form persists, with no regression to the mean and no injury risk — so it
    // will say 99% with a season to run. What it must never do is say 100%
    // while the arithmetic still allows a rival to win.
    const predictions = backtestSeason(db, 2025).filter((p) => p.roundsRemaining >= 12);
    expect(predictions.length).toBeGreaterThan(0);
    for (const p of predictions) expect(p.probability).toBeLessThan(1);
  });

  it("becomes certain once the title is mathematically settled", () => {
    const predictions = backtestSeason(db, 2025);
    const champion = predictions.filter((p) => p.outcome === 1);
    const late = champion.filter((p) => p.roundsRemaining <= 3);
    expect(late.length).toBeGreaterThan(0);
    for (const p of late) expect(p.probability).toBe(1);
  });

  it("assigns exactly one champion per season", () => {
    const predictions = backtestSeason(db, 2024);
    const byRound = new Map<number, number>();
    for (const p of predictions) byRound.set(p.round, (byRound.get(p.round) ?? 0) + p.outcome);
    for (const [, winners] of byRound) expect(winners).toBe(1);
  });

  it("produces probabilities that are always valid", () => {
    const result = backtest(db, [2024, 2025]);
    expect(result.predictions.length).toBeGreaterThan(20);
    for (const p of result.predictions) {
      expect(p.probability).toBeGreaterThanOrEqual(0);
      expect(p.probability).toBeLessThanOrEqual(1);
    }
  });

  it("beats the proportional-to-points baseline", () => {
    const result = backtest(db, [2024, 2025]);
    expect(result.brier).toBeLessThan(result.proportionalBrier);
  });

  it("scores better than a coin flip", () => {
    const result = backtest(db, [2024, 2025]);
    expect(result.brier).toBeLessThan(0.25);
  });

  it("is reproducible", () => {
    expect(backtest(db, [2024]).brier).toBe(backtest(db, [2024]).brier);
  });
});

seeded("calibration of the shipped model", () => {
  const db = createDb();
  const years = [2024, 2025];

  it("says what it means, wherever there is enough evidence to tell", () => {
    // Only buckets with a real sample are asserted on: a bucket holding six
    // predictions swings by 10pp on a single outcome, so a tight bound there
    // would be testing noise rather than the model.
    const result = backtest(db, years);
    const substantial = result.calibration.filter((c) => c.predictions >= 15);
    expect(substantial.length).toBeGreaterThan(0);
    for (const bucket of substantial) {
      expect(
        Math.abs(bucket.observedFrequency - bucket.meanPredicted),
        `bucket ${bucket.bucket} (n=${bucket.predictions}): said ${bucket.meanPredicted}, happened ${bucket.observedFrequency}`
      ).toBeLessThan(0.06);
    }
  });

  it("is not systematically over- or under-confident", () => {
    expect(Math.abs(backtest(db, years).bias)).toBeLessThan(0.02);
  });

  it("beats both baselines", () => {
    const result = backtest(db, years);
    expect(result.brier).toBeLessThan(result.leaderBrier);
    expect(result.brier).toBeLessThan(result.proportionalBrier);
  });

  it("is hurt, not helped, by sampling older seasons", () => {
    // Marc rode a Honda in 2023 and a year-old bike in 2024; Martin missed most
    // of 2025. Those weekends describe different riders on different machinery.
    const currentSeasonOnly = backtest(db, years, 0, 1).brier;
    const fourSeasons = backtest(db, years, 0, 4).brier;
    expect(currentSeasonOnly).toBeLessThan(fourSeasons);
  });

  it("is hurt, not helped, by shuffling rider identity", () => {
    // Drift only ever compensated for a stale pool. With a clean pool it hurts.
    expect(backtest(db, years, 0).brier).toBeLessThan(backtest(db, years, 0.5).brier);
  });
});
