import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { events, seasons } from "../db/schema";
import type { RivalAssumption } from "../engine";
import { MAX_WEEKEND_POINTS } from "../points";
import { loadHauls, riderDistribution, type Distribution } from "./distributions";

/**
 * The z-score of the 75th percentile of a normal distribution.
 * Used to lift a rival's SEASON TOTAL to its strong case — see below.
 */
export const Z75 = 0.674489;

export interface AssumptionSet {
  /** Rivals ride at their strong level, measured across the season. */
  rival: RivalAssumption;
  /** The tracked rider rides normally. */
  tracked: RivalAssumption;
  /** Per-rider, per-round distributions, for display and inspection. */
  table: Map<string, Distribution[]>;
  /** What each rider is assumed to score per remaining round. */
  assumed: Map<string, { rival: number[]; tracked: number[] }>;
  circuits: { round: number; shortName: string; circuitId: string }[];
}

const clamp = (x: number) => Math.max(0, Math.min(MAX_WEEKEND_POINTS, x));

/**
 * Builds the Layer 2 assumptions for the rounds still to run.
 *
 * The asymmetry is deliberate: rivals are assumed to ride WELL and the tracked
 * rider to ride NORMALLY. That makes the displayed minimum demanding and safe —
 * a target Marc beats builds trust, one he falls short of is worthless.
 *
 * The percentile is applied to the SEASON TOTAL, not to each round. Assuming a
 * rival hits their per-round 75th percentile nine times running is not "riding
 * well", it is a near-perfect season — an event of roughly 0.25^9. Summing n
 * independent rounds shrinks the spread of the total by sqrt(n), so the strong
 * case per round is `mean + z75 * sd / sqrt(n)`: the total lands at its 75th
 * percentile while each round stays realistic. Circuit-specific strength is
 * preserved because each round keeps its own mean.
 */
export function buildAssumptions(
  db: Db,
  year: number,
  riderIds: string[],
  afterRound: number
): AssumptionSet {
  const season = db.select().from(seasons).where(eq(seasons.year, year)).get();
  if (!season) throw new Error(`Season ${year} not seeded`);

  const circuits = db
    .select()
    .from(events)
    .where(eq(events.seasonId, season.id))
    .all()
    .filter((e) => e.round > afterRound)
    .sort((a, b) => a.round - b.round)
    .map((e) => ({ round: e.round, shortName: e.shortName, circuitId: e.circuitId }));

  const hauls = loadHauls(db);
  const table = new Map<string, Distribution[]>();
  const assumed = new Map<string, { rival: number[]; tracked: number[] }>();
  const rounds = Math.max(1, circuits.length);

  for (const riderId of riderIds) {
    const perRound = circuits.map((c) => riderDistribution(hauls, riderId, c.circuitId, { year }));
    table.set(riderId, perRound);
    assumed.set(riderId, {
      rival: perRound.map((d) => clamp(d.mean + (Z75 * d.sd) / Math.sqrt(rounds))),
      tracked: perRound.map((d) => clamp(d.mean))
    });
  }

  const pick = (riderId: string, roundIndex: number, lane: "rival" | "tracked"): number => {
    const rows = assumed.get(riderId);
    if (!rows || rows[lane].length === 0) return 0;
    return rows[lane][Math.min(roundIndex, rows[lane].length - 1)];
  };

  return {
    rival: (riderId, roundIndex) => pick(riderId, roundIndex, "rival"),
    tracked: (riderId, roundIndex) => pick(riderId, roundIndex, "tracked"),
    table,
    assumed,
    circuits
  };
}
