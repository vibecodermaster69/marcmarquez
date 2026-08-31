import { describe, expect, it } from "vitest";
import type { WeekendHaul } from "./hauls";
import { mulberry32 } from "./rng";
import { buildPool, simulate, type SimulationInput } from "./simulate";

const haul = (riderId: string, eventId: string, circuitId: string, sprint: number, gp: number): WeekendHaul => ({
  riderId,
  eventId,
  circuitId,
  round: 1,
  year: 2025,
  points: sprint + gp,
  sprintPoints: sprint,
  gpPoints: gp,
  dnf: gp === 0
});

/** Two riders, three historical weekends, all complete. */
const history: WeekendHaul[] = [
  haul("marc", "e1", "c1", 12, 25), haul("martin", "e1", "c1", 0, 0),
  haul("marc", "e2", "c2", 0, 0), haul("martin", "e2", "c2", 12, 25),
  haul("marc", "e3", "c1", 9, 20), haul("martin", "e3", "c1", 7, 16)
];

function input(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    riderIds: ["marc", "martin"],
    trackedRiderId: "marc",
    currentPoints: new Map([["marc", 100], ["martin", 100]]),
    currentWins: new Map([["marc", 0], ["martin", 0]]),
    remainingCircuits: [
      { round: 1, circuitId: "c1", shortName: "AAA" },
      { round: 2, circuitId: "c2", shortName: "BBB" }
    ],
    pool: buildPool(history, ["marc", "martin"]),
    ...overrides
  };
}

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("differs between seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("stays in [0,1)", () => {
    const r = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("buildPool", () => {
  it("keeps whole weekends, with every rider's result together", () => {
    const pool = buildPool(history, ["marc", "martin"]);
    expect(pool).toHaveLength(3);
    const e1 = pool.find((p) => p.eventId === "e1")!;
    // The correlation is the point: Marc's 37 and Martin's 0 came from the SAME day.
    expect(e1.hauls.get("marc")!.points).toBe(37);
    expect(e1.hauls.get("martin")!.points).toBe(0);
  });

  it("keeps a weekend a rider missed, scoring the absence as zero", () => {
    const incomplete = [...history, haul("marc", "e4", "c1", 12, 25)];
    const pool = buildPool(incomplete, ["marc", "martin"]);
    const e4 = pool.find((p) => p.eventId === "e4")!;
    expect(e4).toBeDefined();
    expect(e4.hauls.get("marc")!.points).toBe(37);
    expect(e4.hauls.get("martin")!.points).toBe(0);
  });

  it("ignores riders who are not being simulated", () => {
    const withExtra = [...history, haul("bez", "e1", "c1", 5, 5)];
    const pool = buildPool(withExtra, ["marc", "martin"]);
    expect(pool.find((p) => p.eventId === "e1")!.hauls.has("bez")).toBe(false);
  });
});

describe("simulate", () => {
  it("is reproducible for a seed", () => {
    const a = simulate(input(), 500, 93);
    const b = simulate(input(), 500, 93);
    expect(a.probability).toBe(b.probability);
    expect(a.clinchByRound).toEqual(b.clinchByRound);
  });

  it("always wins when already mathematically uncatchable", () => {
    const result = simulate(
      input({ currentPoints: new Map([["marc", 500], ["martin", 100]]) }),
      300,
      1
    );
    expect(result.probability).toBe(1);
    expect(result.never).toBe(0);
  });

  it("never wins when mathematically eliminated", () => {
    const result = simulate(
      input({ currentPoints: new Map([["marc", 100], ["martin", 500]]) }),
      300,
      1
    );
    expect(result.probability).toBe(0);
    expect(result.never).toBe(1);
  });

  it("splits every simulated season into won or not won", () => {
    const result = simulate(input(), 500, 5);
    expect(result.probability + result.never).toBeCloseTo(1, 10);
  });

  it("attributes every title to a clinch round", () => {
    const result = simulate(input(), 500, 5);
    const clinched = result.clinchByRound.reduce((a, b) => a + b, 0);
    expect(clinched).toBeCloseTo(result.probability, 10);
  });

  it("loses a dead heat on the countback", () => {
    // Nothing left to race; level on points, and the rival has more wins.
    const result = simulate(
      input({
        remainingCircuits: [],
        currentPoints: new Map([["marc", 200], ["martin", 200]]),
        currentWins: new Map([["marc", 3], ["martin", 5]])
      }),
      50,
      1
    );
    expect(result.probability).toBe(0);
  });

  it("holds the tracked rider's Grand Prix result fixed when conditioned", () => {
    const winning = simulate(input(), 2000, 93, { gpPosition: 1 });
    const dnf = simulate(input(), 2000, 93, { gpPosition: null });
    expect(winning.probability).toBeGreaterThan(dnf.probability);
  });

  it("conditions only the next round, not the rest of the season", () => {
    const conditioned = simulate(input(), 1000, 93, { gpPosition: 1 });
    // A forced win at one round of two cannot guarantee the title.
    expect(conditioned.probability).toBeLessThan(1);
  });
});

describe("the sensitivity curve", () => {
  it("is monotonic — a worse finish can never improve the odds", () => {
    // Common random numbers: every condition shares a seed, so the curve
    // measures the effect of the result rather than the noise between runs.
    const positions: (number | null)[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, null];
    const probabilities = positions.map((gpPosition) => simulate(input(), 3000, 93, { gpPosition }).probability);

    for (let i = 1; i < probabilities.length; i++) {
      expect(
        probabilities[i],
        `${positions[i] ?? "DNF"} (${probabilities[i]}) must not beat ${positions[i - 1]} (${probabilities[i - 1]})`
      ).toBeLessThanOrEqual(probabilities[i - 1]);
    }
  });
});

describe("an absent rider", () => {
  const partial: WeekendHaul[] = [
    haul("marc", "e1", "c1", 12, 25), haul("martin", "e1", "c1", 0, 0),
    // Round 2: Martin did not start at all — no row for him.
    haul("marc", "e2", "c2", 9, 20)
  ];

  it("scores zero rather than erasing the weekend", () => {
    const pool = buildPool(partial, ["marc", "martin"]);
    expect(pool).toHaveLength(2);
    const e2 = pool.find((p) => p.eventId === "e2")!;
    expect(e2.hauls.get("marc")!.points).toBe(29);
    expect(e2.hauls.get("martin")!.points).toBe(0);
  });

  it("no longer discards the rounds where a rival was hurt", () => {
    // The old rule dropped e2 — which is exactly the weekend Marc profited from.
    const strict = buildPool(partial, ["marc", "martin"], { requireAll: true });
    expect(strict).toHaveLength(1);
    expect(buildPool(partial, ["marc", "martin"]).length).toBeGreaterThan(strict.length);
  });

  it("reconciles to the championship: pooled hauls sum to points scored", () => {
    const pool = buildPool(partial, ["marc", "martin"]);
    const total = (id: string) => pool.reduce((sum, p) => sum + p.hauls.get(id)!.points, 0);
    expect(total("marc")).toBe(37 + 29);
    expect(total("martin")).toBe(0);
  });
});
