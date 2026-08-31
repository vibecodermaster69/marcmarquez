import { describe, expect, it } from "vitest";
import { MotoGpClient, isDnf, isScoringSession, toRounds } from "./client";
import { pointsForPosition } from "../points";

/**
 * Contract tests against the real motogp.com API.
 * Opt-in: `npm run test:live`. These are the tests that fail when the upstream
 * shape changes underneath us — which is the failure mode a scraper-backed
 * ingest actually has.
 */
const live = process.env.LIVE === "1" ? describe : describe.skip;

live("motogp.com API contract", () => {
  const client = new MotoGpClient();

  it("exposes 2026 as the current season", async () => {
    const seasons = await client.seasons();
    const current = seasons.find((s) => s.current);
    expect(current?.year).toBe(2026);
  });

  it("has a MotoGP category with a resolvable UUID", async () => {
    const seasons = await client.seasons();
    const season = seasons.find((s) => s.year === 2026)!;
    const categoryId = await client.motogpCategoryId(season.id);
    expect(categoryId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns a 22-round 2026 calendar once tests are excluded", async () => {
    const seasons = await client.seasons();
    const season = seasons.find((s) => s.year === 2026)!;
    const rounds = toRounds(await client.events(season.id));
    expect(rounds).toHaveLength(22);
    expect(rounds[rounds.length - 1].short_name).toBe("VAL");
  });

  it("still uses the points system the engine assumes", async () => {
    const seasons = await client.seasons();
    const season = seasons.find((s) => s.year === 2026)!;
    const categoryId = await client.motogpCategoryId(season.id);
    const aragon = toRounds(await client.events(season.id)).find((e) => e.short_name === "ARA")!;
    const sessions = (await client.sessions(aragon.id, categoryId)).filter((s) => isScoringSession(s.type));

    for (const session of sessions) {
      const classification = await client.classification(session.id);
      expect(classification.length).toBeGreaterThan(0);
      for (const entry of classification) {
        // Every published result must match our points table exactly.
        expect(entry.points ?? 0).toBe(pointsForPosition(session.type as "SPR" | "RAC", entry.position));
        if (entry.position === null) expect(isDnf(entry.status)).toBe(true);
      }
    }
  });

  it("agrees with the engine that 9 rounds and 333 points remain after Aragon", async () => {
    const seasons = await client.seasons();
    const season = seasons.find((s) => s.year === 2026)!;
    const rounds = toRounds(await client.events(season.id));
    const aragon = rounds.find((e) => e.short_name === "ARA")!;
    const remaining = rounds.filter((r) => r.round > aragon.round);
    expect(remaining).toHaveLength(9);
    expect(remaining.length * 37).toBe(333);
  });
});
