import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SEASON, TRACKED_RIDER_NAME } from "../config";
import { DEFAULT_DB_PATH, createDb } from "../db";
import { topRivals } from "../engine";
import { replaySeason } from "../engine/replay";
import { RETENTION, forecast } from "./forecast";

const seeded = fs.existsSync(DEFAULT_DB_PATH) ? describe : describe.skip;

seeded("forecast on the real championship", () => {
  const db = createDb();
  const { rounds, names } = replaySeason(db, SEASON);
  const latest = rounds[rounds.length - 1];
  const state = latest.state;
  const trackedId = [...names.entries()].find(([, n]) => n === TRACKED_RIDER_NAME)![0];
  const rivalIds = topRivals(state, trackedId).map((r) => r.riderId);
  const currentPoints = new Map(state.standings.map((s) => [s.riderId, s.points]));
  const currentWins = new Map(state.standings.map((s) => [s.riderId, s.positionCounts[0] ?? 0]));

  const f = forecast(db, SEASON, trackedId, rivalIds, latest.round, currentPoints, currentWins, 4000);

  it("returns a probability with a band around it", () => {
    expect(f.probability).toBeGreaterThan(0);
    expect(f.probability).toBeLessThan(1);
    expect(f.confidenceLow).toBeLessThanOrEqual(f.probability);
    expect(f.confidenceHigh).toBeGreaterThanOrEqual(f.probability);
  });

  it("accounts for every simulated season", () => {
    expect(f.probability + f.never).toBeCloseTo(1, 10);
  });

  it("covers every remaining round in the clinch distribution", () => {
    expect(f.clinchByRound).toHaveLength(state.roundsRemaining);
    expect(f.clinchByRound.map((c) => c.shortName)).toEqual([
      "RSM", "AUT", "JPN", "INA", "AUS", "MAL", "QAT", "POR", "VAL"
    ]);
    const total = f.clinchByRound.reduce((a, c) => a + c.probability, 0);
    expect(total).toBeCloseTo(f.probability, 10);
  });

  it("cannot clinch the title before it is mathematically possible", () => {
    // 19 points behind with 9 rounds left: the earliest possible clinch is
    // several rounds away, so the opening rounds must be exactly zero.
    expect(f.clinchByRound[0].probability).toBe(0);
    expect(f.clinchByRound[1].probability).toBe(0);
  });

  it("produces a sensitivity point for every finish and a DNF", () => {
    expect(f.sensitivity).toHaveLength(16);
    expect(f.sensitivity[0].label).toBe("P1");
    expect(f.sensitivity[15].label).toBe("DNF");
  });

  it("keeps the sensitivity curve monotonic", () => {
    for (let i = 1; i < f.sensitivity.length; i++) {
      expect(f.sensitivity[i].probability).toBeLessThanOrEqual(f.sensitivity[i - 1].probability);
    }
  });

  it("makes a win better than a DNF by a real margin", () => {
    const win = f.sensitivity[0].probability;
    const dnf = f.sensitivity[15].probability;
    expect(win).toBeGreaterThan(dnf);
    expect(win - dnf).toBeGreaterThan(0.05);
  });

  it("puts the minimum where the curve falls away", () => {
    expect(f.minimumPosition).not.toBeNull();
    const best = f.sensitivity[0].probability;
    const atMinimum = f.sensitivity.find((s) => s.gpPosition === f.minimumPosition)!;
    // The minimum still holds its share of the best case...
    expect(atMinimum.probability).toBeGreaterThanOrEqual(best * RETENTION);
    // ...and one place worse does not.
    const worse = f.sensitivity.find((s) => s.gpPosition === f.minimumPosition! + 1);
    if (worse) expect(worse.probability).toBeLessThan(best * RETENTION);
  });

  it("is reproducible — the same database gives the same probability", () => {
    const again = forecast(db, SEASON, trackedId, rivalIds, latest.round, currentPoints, currentWins, 4000);
    expect(again.probability).toBe(f.probability);
    expect(again.minimumPosition).toBe(f.minimumPosition);
  });

  it("projects mean final points that respect the points still available", () => {
    for (const r of f.meanFinalPoints) {
      const now = currentPoints.get(r.riderId)!;
      expect(r.points).toBeGreaterThanOrEqual(now);
      expect(r.points).toBeLessThanOrEqual(now + state.pointsAvailable);
    }
  });
});

seeded("the sampling pool reconciles to the championship", () => {
  it("accounts for every point the simulated riders have scored", async () => {
    const { loadHauls } = await import("./distributions");
    const { buildPool } = await import("./simulate");
    const db = createDb();
    const { rounds, names } = replaySeason(db, SEASON);
    const state = rounds[rounds.length - 1].state;
    const trackedId = [...names.entries()].find(([, n]) => n === TRACKED_RIDER_NAME)![0];
    const riderIds = [trackedId, ...topRivals(state, trackedId).map((r) => r.riderId)];

    const pool = buildPool(loadHauls(db).filter((h) => h.year === SEASON), riderIds);

    // If the pool drops weekends, riders lose points that they actually scored —
    // and the ones dropped are the weekends a rival missed, which is precisely
    // where the others banked their biggest hauls.
    for (const riderId of riderIds) {
      const pooled = pool.reduce((sum, p) => sum + (p.hauls.get(riderId)?.points ?? 0), 0);
      const actual = state.standings.find((s) => s.riderId === riderId)!.points;
      expect(pooled, `${names.get(riderId)}: pool has ${pooled}, championship says ${actual}`).toBe(actual);
    }
  });
});
