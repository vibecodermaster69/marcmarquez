import { describe, expect, it } from "vitest";
import { MAX_WEEKEND_POINTS } from "../points";
import {
  RIVALS_MAX,
  RIVALS_ZERO,
  buildChampionshipState,
  buildStandings,
  classifyStatus,
  compareCountback,
  computeRequirement,
  contenders,
  currentChampion,
  earliestClinchRound,
  hasClinched,
  isEliminated,
  pointsNeededToBeat,
  topRivals,
  type ResultRow
} from "./index";

const win = (riderId: string, sessionType: "SPR" | "RAC" = "RAC"): ResultRow => ({
  riderId,
  sessionType,
  position: 1,
  points: sessionType === "RAC" ? 25 : 12
});

const finish = (riderId: string, position: number, points: number, sessionType: "SPR" | "RAC" = "RAC"): ResultRow => ({
  riderId,
  sessionType,
  position,
  points
});

/** A two-rider state built directly from point totals, for arithmetic tests. */
function stateOf(points: Record<string, number>, roundsRemaining: number) {
  const rows: ResultRow[] = [];
  for (const [riderId, total] of Object.entries(points)) {
    rows.push({ riderId, sessionType: "RAC", position: null, points: total });
  }
  return buildChampionshipState(rows, roundsRemaining);
}

describe("buildStandings", () => {
  it("orders by points", () => {
    const table = buildStandings([finish("a", 2, 20), finish("b", 1, 25), finish("c", 3, 16)]);
    expect(table.map((r) => r.riderId)).toEqual(["b", "a", "c"]);
    expect(table.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it("sums points across sprint and Grand Prix", () => {
    const table = buildStandings([win("a", "SPR"), win("a", "RAC")]);
    expect(table[0].points).toBe(37);
  });

  it("breaks a points tie on wins", () => {
    // Both on 50, but 'a' has two wins to 'b' having none.
    const rows = [win("a"), win("a"), finish("b", 2, 20), finish("b", 2, 20), finish("b", 6, 10)];
    const table = buildStandings(rows);
    expect(table[0].points).toBe(table[1].points);
    expect(table[0].riderId).toBe("a");
  });

  it("breaks a tie on seconds when wins are level", () => {
    const rows = [
      win("a"), finish("a", 5, 11), finish("a", 5, 11), finish("a", 15, 1),
      win("b"), finish("b", 2, 20), finish("b", 13, 3)
    ];
    const table = buildStandings(rows);
    expect(table[0].points).toBe(table[1].points);
    expect(table[0].riderId).toBe("b"); // same wins, but b has a second place
  });

  it("counts only Grand Prix results for countback by default", () => {
    const rows = [win("a", "SPR"), finish("a", 3, 16), finish("b", 3, 16), finish("b", 9, 6), finish("b", 15, 1), { riderId: "b", sessionType: "SPR" as const, position: 8, points: 2 }];
    const table = buildStandings(rows, "RAC");
    // 'a' has 28, 'b' has 25 — no tie here, but the sprint win must not appear in a's countback.
    expect(table.find((r) => r.riderId === "a")!.positionCounts[0] ?? 0).toBe(0);
  });

  it("counts sprint results for countback when scope is ALL", () => {
    const table = buildStandings([win("a", "SPR")], "ALL");
    expect(table[0].positionCounts[0]).toBe(1);
  });
});

describe("compareCountback", () => {
  it("ranks more wins ahead", () => {
    const a = { riderId: "a", points: 0, positionCounts: [3], position: 0 };
    const b = { riderId: "b", points: 0, positionCounts: [2, 5], position: 0 };
    expect(compareCountback(a, b)).toBeLessThan(0);
  });

  it("returns zero for identical records", () => {
    const a = { riderId: "a", points: 0, positionCounts: [1, 1], position: 0 };
    const b = { riderId: "b", points: 0, positionCounts: [1, 1], position: 0 };
    expect(compareCountback(a, b)).toBe(0);
  });
});

describe("isEliminated", () => {
  it("keeps a rider alive while the gap is reachable", () => {
    // Marc 237, Martin 256, 9 rounds = 333 available.
    const state = stateOf({ martin: 256, marc: 237 }, 9);
    expect(isEliminated(state, "marc")).toBe(false);
  });

  it("eliminates a rider whose gap exceeds what is left", () => {
    const state = stateOf({ leader: 400, other: 60 }, 1); // 37 available, gap 340
    expect(isEliminated(state, "other")).toBe(true);
  });

  it("never eliminates the leader", () => {
    const state = stateOf({ leader: 400, other: 60 }, 0);
    expect(isEliminated(state, "leader")).toBe(false);
  });

  it("treats an exactly-reachable gap as alive", () => {
    const state = stateOf({ leader: 100, other: 63 }, 1); // gap 37, exactly one perfect weekend
    expect(isEliminated(state, "other")).toBe(false);
  });

  it("lists the remaining contenders", () => {
    const state = stateOf({ a: 300, b: 290, c: 10 }, 1);
    expect(contenders(state).map((s) => s.riderId)).toEqual(["a", "b"]);
  });
});

describe("hasClinched", () => {
  it("is false while a rival can still catch up", () => {
    const state = stateOf({ marc: 300, martin: 270 }, 1); // 37 available, gap only 30
    expect(hasClinched(state, "marc")).toBe(false);
  });

  it("is true once no rival can reach the total", () => {
    const state = stateOf({ marc: 320, martin: 270 }, 1); // gap 50 > 37
    expect(hasClinched(state, "marc")).toBe(true);
  });

  it("refuses to call an exact tie a clinch", () => {
    // A rival taking all 37 would draw level — and would be adding wins,
    // which can overturn today's countback. Conservative by design.
    const state = stateOf({ marc: 307, martin: 270 }, 1);
    expect(hasClinched(state, "marc")).toBe(false);
  });

  it("is true when the season is over and the rider leads", () => {
    const state = stateOf({ marc: 300, martin: 299 }, 0);
    expect(hasClinched(state, "marc")).toBe(true);
  });
});

describe("currentChampion", () => {
  it("uses countback when points are level", () => {
    const rows = [win("a"), win("a"), finish("b", 2, 20), finish("b", 2, 20), finish("b", 6, 10)];
    const state = buildChampionshipState(rows, 0);
    expect(currentChampion(state).riderId).toBe("a");
  });
});

describe("topRivals", () => {
  it("returns whoever occupies the top three, excluding the tracked rider", () => {
    const state = stateOf({ martin: 256, marc: 237, bez: 232, diggia: 208 }, 9);
    expect(topRivals(state, "marc").map((s) => s.riderId)).toEqual(["martin", "bez"]);
  });

  it("includes an uninvited rider who climbs into the top three", () => {
    const state = stateOf({ martin: 256, marc: 237, diggia: 250, bez: 100 }, 9);
    expect(topRivals(state, "marc").map((s) => s.riderId)).toEqual(["martin", "diggia"]);
  });
});

describe("pointsNeededToBeat", () => {
  it("needs one more than the rival's final total", () => {
    expect(pointsNeededToBeat(237, 256)).toBe(20);
  });

  it("needs nothing when already ahead", () => {
    expect(pointsNeededToBeat(300, 256)).toBe(0);
  });
});

describe("classifyStatus", () => {
  it("is out of his hands beyond a perfect weekend", () => {
    expect(classifyStatus(38)).toBe("OUT_OF_HIS_HANDS");
  });

  it("is a live fight from 1 to 37", () => {
    expect(classifyStatus(1)).toBe("LIVE_FIGHT");
    expect(classifyStatus(MAX_WEEKEND_POINTS)).toBe("LIVE_FIGHT");
  });

  it("is already decided at zero or below", () => {
    expect(classifyStatus(0)).toBe("ALREADY_DECIDED");
    expect(classifyStatus(-14)).toBe("ALREADY_DECIDED");
  });
});

describe("computeRequirement — the two provable bounds", () => {
  const state = stateOf({ martin: 256, marc: 237, bez: 232 }, 9);

  it("is impossible when rivals take everything", () => {
    // Martin winning all 9 weekends finishes on 589; Marc's ceiling is 570.
    const req = computeRequirement(state, "marc", { rivalAssumption: RIVALS_MAX });
    expect(req.requiredTotal).toBe(256 + 333 + 1 - 237);
    expect(req.status).toBe("OUT_OF_HIS_HANDS");
    expect(req.minimum).toBeNull();
  });

  it("needs only to clear the current leader when rivals score nothing", () => {
    const req = computeRequirement(state, "marc", { rivalAssumption: RIVALS_ZERO });
    expect(req.requiredTotal).toBe(20); // 256 + 1 - 237
  });

  it("subtracts the anchor's contribution from what is needed now", () => {
    // Rivals at zero: 20 points needed in total, 16 of them assumed at the
    // anchor (a podium at the final round), leaving 4 to find at Misano.
    const req = computeRequirement(state, "marc", { rivalAssumption: RIVALS_ZERO });
    expect(req.requiredNow).toBe(4);
    expect(req.status).toBe("LIVE_FIGHT");
    expect(req.minimum).not.toBeNull();
    expect(req.minimum!.points).toBeGreaterThanOrEqual(4);
  });

  it("reports already-decided when the anchor alone covers the requirement", () => {
    const nearlyDone = stateOf({ marc: 300, martin: 290 }, 2);
    const req = computeRequirement(nearlyDone, "marc", { rivalAssumption: RIVALS_ZERO });
    // Marc needs 0 more to beat a rival who scores nothing.
    expect(req.requiredTotal).toBe(0);
    expect(req.status).toBe("ALREADY_DECIDED");
  });

  it("never lets an assumption exceed a perfect weekend", () => {
    const req = computeRequirement(state, "marc", { rivalAssumption: () => 999 });
    expect(req.requiredTotal).toBe(256 + 9 * MAX_WEEKEND_POINTS + 1 - 237);
  });
});

describe("earliestClinchRound", () => {
  it("returns null when no remaining round can deliver the title", () => {
    const state = stateOf({ martin: 256, marc: 237 }, 9);
    expect(earliestClinchRound(state, "marc", RIVALS_MAX)).toBeNull();
  });

  it("finds the first round at which a clinch becomes possible", () => {
    // Marc 237, Martin 256, rivals score nothing, 9 rounds left.
    // After n perfect weekends Marc has 237 + 37n; he clinches when that
    // exceeds 256 + 37 * (9 - n).
    const state = stateOf({ martin: 256, marc: 237 }, 9);
    const round = earliestClinchRound(state, "marc", RIVALS_ZERO);
    expect(round).not.toBeNull();
    const n = round! + 1;
    expect(237 + 37 * n).toBeGreaterThan(256 + 37 * (9 - n));
    expect(237 + 37 * (n - 1)).not.toBeGreaterThan(256 + 37 * (9 - (n - 1)));
  });

  it("clinches at the next round when the lead is already decisive", () => {
    const state = stateOf({ marc: 400, martin: 200 }, 2);
    expect(earliestClinchRound(state, "marc", RIVALS_ZERO)).toBe(0);
  });
});

describe("contender depth — the cast can change", () => {
  it("lets a rider who climbs into range enter uninvited", () => {
    const before = stateOf({ martin: 256, marc: 237, bez: 232, ogura: 203, diggia: 208 }, 9);
    expect(topRivals(before, "marc", 3).map((s) => s.riderId)).toEqual(["martin", "bez"]);
    // Widen the field and the next threats appear on their own.
    expect(topRivals(before, "marc", 5).map((s) => s.riderId)).toEqual(["martin", "bez", "diggia", "ogura"]);
  });

  it("replaces a rival who drops out of contention", () => {
    // Bezzecchi crashes out of the fight; Ogura is now the third man.
    const after = stateOf({ martin: 300, marc: 280, ogura: 260, diggia: 250, bez: 232 }, 5);
    expect(topRivals(after, "marc", 3).map((s) => s.riderId)).toEqual(["martin", "ogura"]);
    expect(topRivals(after, "marc", 3).map((s) => s.riderId)).not.toContain("bez");
  });

  it("keeps the field size stable when the tracked rider is outside it", () => {
    const adrift = stateOf({ a: 300, b: 290, c: 280, marc: 50 }, 5);
    expect(topRivals(adrift, "marc", 3)).toHaveLength(2);
  });
});

describe("the settled states that turn the number green or grey", () => {
  it("goes green only when no rival can catch him", () => {
    const stillLive = stateOf({ marc: 300, martin: 270 }, 1); // 37 available, gap 30
    expect(hasClinched(stillLive, "marc")).toBe(false);

    const settled = stateOf({ marc: 320, martin: 270 }, 1); // gap 50 > 37
    expect(hasClinched(settled, "marc")).toBe(true);
    expect(isEliminated(settled, "martin")).toBe(true);
  });

  it("is never both champion and eliminated", () => {
    for (const [marc, martin, rounds] of [[300, 270, 1], [237, 256, 9], [500, 100, 3], [100, 500, 3]] as const) {
      const state = stateOf({ marc, martin }, rounds);
      expect(hasClinched(state, "marc") && isEliminated(state, "marc")).toBe(false);
    }
  });

  it("stays red while the title is still in play", () => {
    const today = stateOf({ martin: 256, marc: 237, bez: 232 }, 9);
    expect(hasClinched(today, "marc")).toBe(false);
    expect(isEliminated(today, "marc")).toBe(false);
  });
});
