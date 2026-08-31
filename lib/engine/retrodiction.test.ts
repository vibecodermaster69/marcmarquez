import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_DB_PATH, createDb } from "../db";
import { clinchRound, replaySeason } from "./replay";
import { isEliminated } from "./clinch";

/**
 * Retrodiction: the engine replays 2024 and 2025 from the seeded database and
 * must land on the championships as they actually happened. An engine that
 * cannot reproduce history does not get to predict Misano.
 *
 * Skips when the database has not been seeded (`npm run seed`).
 */
const seeded = fs.existsSync(DEFAULT_DB_PATH) ? describe : describe.skip;

seeded("retrodicting past championships", () => {
  it("2024: Martin is champion, and it went to the final round", () => {
    const db = createDb();
    const { rounds, names } = replaySeason(db, 2024);
    const final = rounds[rounds.length - 1].state;
    const champion = final.standings[0];

    expect(names.get(champion.riderId)).toBe("Jorge Martin");
    expect(champion.points).toBe(508);
    expect(names.get(final.standings[1].riderId)).toBe("Francesco Bagnaia");
    expect(final.standings[1].points).toBe(498);

    const clinch = clinchRound(rounds, champion.riderId)!;
    expect(clinch.round).toBe(rounds.length);
    expect(clinch.state.roundsRemaining).toBe(0);
  });

  it("2024: Bagnaia was still mathematically alive going into the finale", () => {
    const db = createDb();
    const { rounds, names } = replaySeason(db, 2024);
    const penultimate = rounds[rounds.length - 2].state;
    const bagnaia = penultimate.standings.find((s) => names.get(s.riderId) === "Francesco Bagnaia")!;
    expect(isEliminated(penultimate, bagnaia.riderId)).toBe(false);
  });

  it("2025: Marc clinched at Motegi with five rounds to spare", () => {
    const db = createDb();
    const { rounds, names } = replaySeason(db, 2025);
    const final = rounds[rounds.length - 1].state;
    const champion = final.standings[0];

    expect(names.get(champion.riderId)).toBe("Marc Marquez");
    expect(champion.points).toBe(545);

    const clinch = clinchRound(rounds, champion.riderId)!;
    expect(clinch.round).toBe(17);
    expect(clinch.shortName).toBe("JPN");
    expect(clinch.state.roundsRemaining).toBe(5);
  });

  it("2025: nobody was clinched the round before Motegi", () => {
    const db = createDb();
    const { rounds } = replaySeason(db, 2025);
    const beforeMotegi = rounds.find((r) => r.round === 16)!;
    for (const rider of beforeMotegi.state.standings) {
      const rivals = beforeMotegi.state.standings.filter((s) => s.riderId !== rider.riderId);
      const clinched = rivals.every((o) => rider.points > o.points + beforeMotegi.state.pointsAvailable);
      expect(clinched).toBe(false);
    }
  });

  it("2026: the season is live — Marc is neither eliminated nor clinched", () => {
    const db = createDb();
    const { rounds, names } = replaySeason(db, 2026);
    const latest = rounds[rounds.length - 1];
    const marc = latest.state.standings.find((s) => names.get(s.riderId) === "Marc Marquez")!;

    expect(latest.shortName).toBe("ARA");
    expect(marc.points).toBe(237);
    expect(latest.state.roundsRemaining).toBe(9);
    expect(latest.state.pointsAvailable).toBe(333);
    expect(isEliminated(latest.state, marc.riderId)).toBe(false);

    // Everyone in the top three is still mathematically in it.
    for (const rider of latest.state.standings.slice(0, 3)) {
      expect(isEliminated(latest.state, rider.riderId)).toBe(false);
    }
  });
});
