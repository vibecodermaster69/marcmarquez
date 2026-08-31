import { describe, expect, it } from "vitest";
import {
  GP_POINTS,
  MAX_WEEKEND_POINTS,
  SPRINT_POINTS,
  minimumWeekendFor,
  pointsAvailable,
  pointsForPosition,
  weekendPoints
} from "./points";

describe("points tables", () => {
  it("matches the official MotoGP Grand Prix table", () => {
    expect([...GP_POINTS]).toEqual([25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("matches the official sprint table", () => {
    expect([...SPRINT_POINTS]).toEqual([12, 9, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("caps a perfect weekend at 37", () => {
    expect(MAX_WEEKEND_POINTS).toBe(37);
  });
});

describe("pointsForPosition", () => {
  it("scores the podium correctly", () => {
    expect(pointsForPosition("RAC", 1)).toBe(25);
    expect(pointsForPosition("RAC", 2)).toBe(20);
    expect(pointsForPosition("RAC", 3)).toBe(16);
    expect(pointsForPosition("SPR", 1)).toBe(12);
    expect(pointsForPosition("SPR", 2)).toBe(9);
    expect(pointsForPosition("SPR", 3)).toBe(7);
  });

  it("scores zero outside the points", () => {
    expect(pointsForPosition("RAC", 16)).toBe(0);
    expect(pointsForPosition("SPR", 10)).toBe(0);
    expect(pointsForPosition("RAC", 22)).toBe(0);
  });

  it("scores zero for a DNF (null position)", () => {
    expect(pointsForPosition("RAC", null)).toBe(0);
    expect(pointsForPosition("SPR", null)).toBe(0);
  });

  it("rejects nonsense positions rather than guessing", () => {
    expect(pointsForPosition("RAC", 0)).toBe(0);
    expect(pointsForPosition("RAC", -3)).toBe(0);
    expect(pointsForPosition("RAC", 1.5)).toBe(0);
  });
});

describe("pointsAvailable", () => {
  it("gives 333 for the 9 rounds remaining after Aragon 2026", () => {
    expect(pointsAvailable(9)).toBe(333);
  });

  it("gives zero when the season is over", () => {
    expect(pointsAvailable(0)).toBe(0);
  });

  it("throws rather than returning a negative", () => {
    expect(() => pointsAvailable(-1)).toThrow(RangeError);
  });
});

describe("weekendPoints", () => {
  it("reproduces Marc's perfect Aragon weekend", () => {
    expect(weekendPoints(1, 1)).toBe(37);
  });

  it("reproduces Martin's Aragon weekend (P5 sprint, P5 race)", () => {
    expect(weekendPoints(5, 5)).toBe(16);
  });

  it("reproduces Bezzecchi's Aragon weekend (P3 sprint, P3 race)", () => {
    expect(weekendPoints(3, 3)).toBe(23);
  });

  it("scores a double DNF as zero", () => {
    expect(weekendPoints(null, null)).toBe(0);
  });
});

describe("minimumWeekendFor", () => {
  it("needs nothing when nothing is required", () => {
    expect(minimumWeekendFor(0)).toEqual({ sprint: null, gp: null, points: 0 });
    expect(minimumWeekendFor(-5)).toEqual({ sprint: null, gp: null, points: 0 });
  });

  it("returns null when more than a perfect weekend is required", () => {
    expect(minimumWeekendFor(38)).toBeNull();
    expect(minimumWeekendFor(100)).toBeNull();
  });

  it("demands a perfect weekend for exactly 37", () => {
    expect(minimumWeekendFor(37)).toEqual({ sprint: 1, gp: 1, points: 37 });
  });

  it("prefers one constraint over two coupled ones", () => {
    // 25 points is a GP win alone, or sprint P2 + GP P3. The single
    // requirement is the one the product displays.
    expect(minimumWeekendFor(25)).toEqual({ sprint: null, gp: 1, points: 25 });
  });

  it("leaves the sprint unconstrained where it can", () => {
    // 1 point is reachable via sprint P9 or GP P15; the headline stays a GP position.
    expect(minimumWeekendFor(1)!.sprint).toBeNull();
  });

  it("constrains both sessions only when the points demand it", () => {
    const min = minimumWeekendFor(26)!;
    expect(min.sprint).not.toBeNull();
    expect(min.gp).toBe(1);
    expect(min.points).toBeGreaterThanOrEqual(26);
  });

  it("finds the cheapest weekend for a single point", () => {
    expect(minimumWeekendFor(1)).toEqual({ sprint: null, gp: 15, points: 1 });
  });

  it("never returns a weekend worth less than required", () => {
    for (let required = 1; required <= 37; required++) {
      const min = minimumWeekendFor(required);
      expect(min).not.toBeNull();
      expect(min!.points).toBeGreaterThanOrEqual(required);
    }
  });

  it("is minimal — no cheaper valid weekend exists", () => {
    for (let required = 1; required <= 37; required++) {
      const min = minimumWeekendFor(required)!;
      for (let s = 0; s <= 9; s++) {
        for (let g = 0; g <= 15; g++) {
          const pts = weekendPoints(s || null, g || null);
          if (pts >= required) expect(min.points).toBeLessThanOrEqual(pts);
        }
      }
    }
  });
});
