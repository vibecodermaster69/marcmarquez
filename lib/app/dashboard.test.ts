import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_DB_PATH } from "../db";
import { MAX_WEEKEND_POINTS } from "../points";
import { getDashboard, principalRivalOf } from "./dashboard";

const seeded = fs.existsSync(DEFAULT_DB_PATH) ? describe : describe.skip;

seeded("dashboard view model", () => {
  const data = getDashboard();

  it("reports the live 2026 championship", () => {
    expect(data.season).toBe(2026);
    expect(data.tracked.name).toBe("Marc Marquez");
    expect(data.tracked.points).toBe(237);
    expect(data.tracked.position).toBe(2);
    expect(data.tracked.gapToLeader).toBe(-19);
  });

  it("keeps rounds and points internally consistent", () => {
    expect(data.pointsAvailable).toBe(data.roundsRemaining * MAX_WEEKEND_POINTS);
    expect(data.calendar.filter((c) => c.state !== "complete")).toHaveLength(data.roundsRemaining);
    expect(data.lastRound.round + data.roundsRemaining).toBe(data.totalRounds);
  });

  it("points at the next round", () => {
    expect(data.nextRound?.shortName).toBe("RSM");
    expect(data.nextRound?.round).toBe(data.lastRound.round + 1);
  });

  it("brackets the requirement between the two provable bounds", () => {
    expect(data.bestCase.requiredNow).toBeLessThan(data.worstCase.requiredNow);
    expect(data.bestCase.status).toBe("LIVE_FIGHT");
    expect(data.worstCase.status).toBe("OUT_OF_HIS_HANDS");
    expect(data.worstCase.minimumHeadline).toBe("—");
  });

  it("derives the standings gap from the leader", () => {
    expect(data.standings[0].gap).toBe(0);
    expect(data.standings.find((s) => s.isTracked)!.gap).toBe(data.tracked.gapToLeader);
    for (const row of data.standings.slice(1)) expect(row.gap).toBeLessThan(0);
  });

  it("ends the gap timeline on the current gap", () => {
    const last = data.gapTimeline[data.gapTimeline.length - 1];
    expect(last.gap).toBe(data.tracked.gapToLeader);
    expect(last.points).toBe(data.tracked.points);
    expect(data.gapTimeline).toHaveLength(data.lastRound.round);
  });

  it("shows real recent results, most recent first", () => {
    expect(data.recentResults[0].shortName).toBe("ARA");
    expect(data.recentResults[0].points).toBe(37);
    const rounds = data.recentResults.map((r) => r.round);
    expect([...rounds].sort((a, b) => b - a)).toEqual(rounds);
    for (const r of data.recentResults) expect(r.points).toBeLessThanOrEqual(MAX_WEEKEND_POINTS);
  });

  it("shows each rider's current team, not one from an old season", () => {
    // Seeding 2023 once put Marc back on a Repsol Honda: the team map kept
    // whichever row happened to be written last, across every season.
    const marc = data.standings.find((s) => s.isTracked)!;
    expect(marc.team).toBe("Ducati Lenovo Team");
    for (const row of data.standings) {
      expect(row.team, `${row.name} has no team`).not.toBe("");
      expect(row.team).not.toMatch(/Repsol|Gresini/);
    }
  });

  it("reports the settled states, which drive the colour of the number", () => {
    // Marc is 19 behind with 333 available: neither champion nor eliminated,
    // so the probability shows red rather than green or grey.
    expect(data.tracked.clinched).toBe(false);
    expect(data.tracked.eliminated).toBe(false);
  });

  it("never exposes a probability without its confidence band", () => {
    const sim = data.simulation;
    expect(sim.probability).toBeGreaterThan(0);
    expect(sim.probability).toBeLessThan(1);
    expect(sim.confidenceLow).toBeLessThanOrEqual(sim.probability);
    expect(sim.confidenceHigh).toBeGreaterThanOrEqual(sim.probability);
    expect(sim.confidenceHigh).toBeGreaterThan(sim.confidenceLow);
  });

  it("accounts for every simulated season", () => {
    expect(data.simulation.probability + data.simulation.never).toBeCloseTo(1, 10);
  });

  it("keeps the simulation's minimum monotonic and marked exactly once", () => {
    const curve = data.simulation.sensitivity;
    expect(curve).toHaveLength(16);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].probability).toBeLessThanOrEqual(curve[i - 1].probability);
    }
    expect(curve.filter((p) => p.isMinimum)).toHaveLength(1);
  });

  it("projects final points that no rider could exceed", () => {
    for (const p of data.simulation.projected) {
      expect(p.points).toBeLessThanOrEqual(data.pointsAvailable + 600);
      expect(p.points).toBeGreaterThan(0);
    }
    // Projections arrive ranked.
    const points = data.simulation.projected.map((p) => p.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it("splits the coming weekend into its two sessions", () => {
    expect(data.weekend).not.toBeNull();
    expect(data.weekend!.shortName).toBe("RSM");
    // Misano has not run, so neither session is banked yet.
    expect(data.weekend!.sprintRun).toBe(false);
    expect(data.weekend!.gpRun).toBe(false);
    expect(data.weekend!.sprintPoints).toBe(0);
    // With nothing banked, Sunday still owes the whole weekend target.
    expect(data.weekend!.remainingForGp).toBe(data.weekend!.target);
    expect(data.weekend!.target).toBe(data.realistic.requiredNow);
  });
});

describe("principalRivalOf — who actually constrains the tracked rider", () => {
  const names: Record<string, string> = {
    marc: "Marc Marquez",
    martin: "Jorge Martin",
    bez: "Marco Bezzecchi",
    diggia: "Fabio Di Giannantonio"
  };
  const nameOf = (id: string) => names[id] ?? "?";

  it("picks the leader while the tracked rider is chasing", () => {
    const standings = [
      { riderId: "martin", points: 256 },
      { riderId: "marc", points: 237 },
      { riderId: "bez", points: 232 }
    ];
    const rival = principalRivalOf(standings, "marc", 9, nameOf)!;
    expect(rival.name).toBe("Jorge Martin");
    expect(rival.chasing).toBe(true);
    expect(rival.margin).toBe(2.22); // (256 + 1 - 237) / 9
  });

  it("flips to the closest chaser once the tracked rider leads", () => {
    const standings = [
      { riderId: "marc", points: 300 },
      { riderId: "bez", points: 280 },
      { riderId: "martin", points: 275 }
    ];
    const rival = principalRivalOf(standings, "marc", 5, nameOf)!;
    // Never the tracked rider himself, and never a rider further down.
    expect(rival.name).toBe("Marco Bezzecchi");
    expect(rival.chasing).toBe(false);
    // Marc can concede 3.8 points a weekend and still finish ahead.
    expect(rival.margin).toBeLessThan(0);
    expect(rival.margin).toBe(-3.8); // (280 + 1 - 300) / 5
  });

  it("tracks whoever climbs into the threat position, not a fixed name", () => {
    const standings = [
      { riderId: "diggia", points: 310 },
      { riderId: "marc", points: 300 },
      { riderId: "martin", points: 250 }
    ];
    const rival = principalRivalOf(standings, "marc", 4, nameOf)!;
    expect(rival.name).toBe("Fabio Di Giannantonio");
    // A multi-part surname must survive intact.
    expect(rival.surname).toBe("DI GIANNANTONIO");
  });

  it("treats a dead heat as still chasing", () => {
    const standings = [
      { riderId: "marc", points: 250 },
      { riderId: "martin", points: 250 }
    ];
    const rival = principalRivalOf(standings, "marc", 2, nameOf)!;
    expect(rival.chasing).toBe(true);
    expect(rival.margin).toBe(0.5); // still needs one point to finish ahead
  });

  it("reports no margin once the season is over", () => {
    const standings = [
      { riderId: "martin", points: 256 },
      { riderId: "marc", points: 237 }
    ];
    expect(principalRivalOf(standings, "marc", 0, nameOf)!.margin).toBe(0);
  });
});
