import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SEASON, TRACKED_RIDER_NAME } from "../config";
import { DEFAULT_DB_PATH, createDb } from "../db";
import { RIVALS_MAX, RIVALS_ZERO, buildChampionshipState, computeRequirement, topRivals } from "../engine";
import { replaySeason } from "../engine/replay";
import { MAX_WEEKEND_POINTS } from "../points";
import { Z75, buildAssumptions } from "./assumptions";

const seeded = fs.existsSync(DEFAULT_DB_PATH) ? describe : describe.skip;

seeded("Layer 2 assumptions on the real championship", () => {
  const db = createDb();
  const { rounds, names } = replaySeason(db, SEASON);
  const latest = rounds[rounds.length - 1];
  const state = latest.state;
  const trackedId = [...names.entries()].find(([, n]) => n === TRACKED_RIDER_NAME)![0];
  const rivalIds = topRivals(state, trackedId).map((r) => r.riderId);
  const ids = [trackedId, ...rivalIds];
  const assumptions = buildAssumptions(db, SEASON, ids, latest.round);

  it("covers every remaining round", () => {
    expect(assumptions.circuits).toHaveLength(state.roundsRemaining);
    expect(assumptions.circuits.map((c) => c.shortName)).toEqual([
      "RSM", "AUT", "JPN", "INA", "AUS", "MAL", "QAT", "POR", "VAL"
    ]);
  });

  it("never assumes more than a perfect weekend", () => {
    for (const id of ids) {
      for (const v of assumptions.assumed.get(id)!.rival) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(MAX_WEEKEND_POINTS);
      }
    }
  });

  it("assumes a rival rides better than normal, but not at a per-round p75", () => {
    for (const id of rivalIds) {
      const distributions = assumptions.table.get(id)!;
      const assumed = assumptions.assumed.get(id)!;
      for (let i = 0; i < distributions.length; i++) {
        // Strictly above the mean...
        expect(assumed.rival[i]).toBeGreaterThan(assumed.tracked[i]);
        // ...but below the per-round 75th percentile, which compounded over a
        // whole season would be a near-perfect year, not "riding well".
        if (distributions[i].p75 > distributions[i].mean) {
          expect(assumed.rival[i]).toBeLessThan(distributions[i].p75);
        }
      }
    }
  });

  it("lifts the SEASON TOTAL to its strong case", () => {
    for (const id of rivalIds) {
      const distributions = assumptions.table.get(id)!;
      const assumed = assumptions.assumed.get(id)!;
      const n = distributions.length;
      const expectedTotal = distributions.reduce((sum, d) => sum + d.mean + (Z75 * d.sd) / Math.sqrt(n), 0);
      const actualTotal = assumed.rival.reduce((a, b) => a + b, 0);
      expect(actualTotal).toBeCloseTo(expectedTotal, 5);
      // The lift over a normal season is modest, not a doubling.
      const normalTotal = assumed.tracked.reduce((a, b) => a + b, 0);
      expect(actualTotal - normalTotal).toBeLessThan(0.3 * normalTotal);
    }
  });

  it("produces a realistic requirement inside the two provable bounds", () => {
    const best = computeRequirement(state, trackedId, { rivalAssumption: RIVALS_ZERO, distribute: "pace" });
    const worst = computeRequirement(state, trackedId, { rivalAssumption: RIVALS_MAX, distribute: "pace" });
    const realistic = computeRequirement(state, trackedId, {
      rivalAssumption: assumptions.rival,
      trackedAssumption: assumptions.tracked,
      distribute: "pace"
    });

    expect(realistic.requiredTotal).toBeGreaterThan(best.requiredTotal);
    expect(realistic.requiredTotal).toBeLessThan(worst.requiredTotal);
    expect(realistic.requiredNow).toBeGreaterThan(best.requiredNow);
    expect(realistic.requiredNow).toBeLessThan(worst.requiredNow);
  });

  it("gives a reachable pace requirement rather than an impossible one", () => {
    const realistic = computeRequirement(state, trackedId, {
      rivalAssumption: assumptions.rival,
      trackedAssumption: assumptions.tracked,
      distribute: "pace"
    });
    expect(realistic.requiredNow).toBeLessThanOrEqual(MAX_WEEKEND_POINTS);
    expect(realistic.status).toBe("LIVE_FIGHT");
    expect(realistic.minimum).not.toBeNull();
  });

  it("reports whole points, never fractions", () => {
    const realistic = computeRequirement(state, trackedId, {
      rivalAssumption: assumptions.rival,
      trackedAssumption: assumptions.tracked,
      distribute: "pace"
    });
    expect(Number.isInteger(realistic.requiredNow)).toBe(true);
    expect(Number.isInteger(realistic.requiredTotal)).toBe(true);
  });

  it("is deterministic across runs", () => {
    const again = buildAssumptions(db, SEASON, ids, latest.round);
    for (const id of ids) {
      expect(again.assumed.get(id)).toEqual(assumptions.assumed.get(id));
    }
  });
});

describe("pace versus anchor", () => {
  it("pace spreads the requirement, anchor concentrates it on the next race", () => {
    const rows = [
      { riderId: "marc", sessionType: "RAC" as const, position: null, points: 237 },
      { riderId: "martin", sessionType: "RAC" as const, position: null, points: 256 }
    ];
    const state = buildChampionshipState(rows, 9);

    const pace = computeRequirement(state, "marc", { rivalAssumption: RIVALS_ZERO, distribute: "pace" });
    const anchor = computeRequirement(state, "marc", { rivalAssumption: RIVALS_ZERO, distribute: "anchor" });

    expect(pace.requiredTotal).toBe(anchor.requiredTotal);
    expect(pace.requiredNow).toBe(Math.ceil(20 / 9));
    expect(anchor.requiredNow).toBe(20 - 16); // the anchor podium covers 16
  });
});
