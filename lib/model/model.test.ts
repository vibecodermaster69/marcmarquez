import { describe, expect, it } from "vitest";
import { MAX_WEEKEND_POINTS } from "../points";
import { CIRCUIT_WEIGHT, describe as summarise, percentile, riderDistribution } from "./distributions";
import type { WeekendHaul } from "./hauls";

const haul = (riderId: string, year: number, round: number, circuitId: string, points: number, dnf = false): WeekendHaul => ({
  riderId,
  eventId: `${year}-${round}`,
  circuitId,
  round,
  year,
  points,
  sprintPoints: 0,
  gpPoints: points,
  dnf
});

describe("percentile", () => {
  it("uses nearest rank", () => {
    const sorted = [0, 5, 10, 20, 25, 30, 37];
    expect(percentile(sorted, 0.5)).toBe(20);
    expect(percentile(sorted, 0.75)).toBe(30);
    expect(percentile(sorted, 1)).toBe(37);
  });

  it("returns zero for an empty sample rather than NaN", () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("describe", () => {
  it("computes mean and spread", () => {
    const d = summarise([10, 20, 30], 0);
    expect(d.mean).toBe(20);
    expect(d.sd).toBeCloseTo(8.16, 1);
    expect(d.n).toBe(3);
  });

  it("reports an empty distribution honestly", () => {
    const d = summarise([], 0);
    expect(d.empty).toBe(true);
    expect(d.mean).toBe(0);
    expect(d.sd).toBe(0);
  });
});

describe("riderDistribution", () => {
  const hauls: WeekendHaul[] = [
    // Current season, various circuits.
    haul("marc", 2026, 1, "c1", 10),
    haul("marc", 2026, 2, "c2", 20),
    haul("marc", 2026, 3, "c3", 30),
    // Prior seasons at the circuit we are asking about.
    haul("marc", 2025, 5, "target", 37),
    haul("marc", 2024, 5, "target", 37)
  ];

  it("uses the current season plus weighted circuit history", () => {
    const d = riderDistribution(hauls, "marc", "target", { year: 2026 });
    // 3 season results + 2 circuit results repeated CIRCUIT_WEIGHT times.
    expect(d.n).toBe(3 + 2 * CIRCUIT_WEIGHT);
  });

  it("weights circuit history up, pulling the mean toward it", () => {
    const weighted = riderDistribution(hauls, "marc", "target", { year: 2026 });
    const unweighted = riderDistribution(hauls, "marc", "target", { year: 2026, circuitWeight: 1 });
    expect(weighted.mean).toBeGreaterThan(unweighted.mean);
  });

  it("ignores prior results from other circuits", () => {
    const d = riderDistribution(hauls, "marc", "elsewhere", { year: 2026 });
    expect(d.n).toBe(3);
    expect(d.mean).toBe(20);
  });

  it("counts a DNF as a zero score and in the DNF rate", () => {
    const withDnf = [...hauls, haul("marc", 2026, 4, "c4", 0, true)];
    const d = riderDistribution(withDnf, "marc", "elsewhere", { year: 2026 });
    expect(d.samples).toContain(0);
    expect(d.dnfRate).toBeCloseTo(0.25, 2);
  });

  it("falls back to all history when the rider has no results this season", () => {
    const rookieless = riderDistribution(hauls, "marc", "target", { year: 2027 });
    expect(rookieless.empty).toBe(false);
    expect(rookieless.n).toBeGreaterThan(0);
  });

  it("returns an honest empty distribution for an unknown rider", () => {
    const d = riderDistribution(hauls, "nobody", "target", { year: 2026 });
    expect(d.empty).toBe(true);
    expect(d.p75).toBe(0);
  });

  it("never produces an impossible haul", () => {
    const d = riderDistribution(hauls, "marc", "target", { year: 2026 });
    for (const s of d.samples) expect(s).toBeLessThanOrEqual(MAX_WEEKEND_POINTS);
  });

  it("is deterministic — the same inputs give the same distribution", () => {
    const a = riderDistribution(hauls, "marc", "target", { year: 2026 });
    const b = riderDistribution(hauls, "marc", "target", { year: 2026 });
    expect(a).toEqual(b);
  });
});
