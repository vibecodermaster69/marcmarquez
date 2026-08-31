import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { championshipSnapshots, events, riders, seasons } from "../db/schema";
import { RIVALS_ZERO, computeRequirement } from "../engine";
import { replaySeason } from "../engine/replay";
import { TRACKED_RIDER_NAME } from "../config";

/**
 * Writes the engine's view of the championship after an ingest.
 *
 * This is what turns the numbers into a history: one row per ingested session,
 * so the gap, the requirement and (from M6) the probability can be charted over
 * the season, and so the backtest has somewhere to write.
 *
 * `requiredNow` here is the provable best-case bound (rivals scoring nothing).
 * M5 replaces it with the realistic p75 requirement; the column does not change.
 */
export function writeSnapshot(db: Db, year: number, sessionId: string | null): boolean {
  const season = db.select().from(seasons).where(eq(seasons.year, year)).get();
  if (!season) return false;

  const { rounds, names } = replaySeason(db, year);
  if (rounds.length === 0) return false;

  const latest = rounds[rounds.length - 1];
  const state = latest.state;
  const trackedId = [...names.entries()].find(([, n]) => n === TRACKED_RIDER_NAME)?.[0];
  if (!trackedId) return false;

  const tracked = state.standings.find((s) => s.riderId === trackedId);
  if (!tracked) return false;
  const leader = state.standings[0];

  const calendar = db
    .select()
    .from(events)
    .where(eq(events.seasonId, season.id))
    .all()
    .sort((a, b) => a.round - b.round);
  const currentEvent = calendar.find((e) => e.round === latest.round);
  if (!currentEvent) return false;
  const anchorEvent = calendar[calendar.length - 1];

  const requirement = computeRequirement(state, trackedId, { rivalAssumption: RIVALS_ZERO });

  db.insert(championshipSnapshots)
    .values({
      id: `${season.id}-${currentEvent.id}-${sessionId ?? "round"}`,
      seasonId: season.id,
      eventId: currentEvent.id,
      sessionId,
      takenAt: new Date().toISOString(),
      trackedRiderId: trackedId,
      trackedPoints: tracked.points,
      leaderPoints: leader.points,
      gapToLeader: tracked.points - leader.points,
      roundsRemaining: state.roundsRemaining,
      pointsAvailable: state.pointsAvailable,
      requiredNow: requirement.requiredNow,
      minimumPosition: requirement.minimum?.gp ?? null,
      anchorEventId: anchorEvent?.id ?? null,
      anchorCondition: requirement.anchor.label,
      state: requirement.status,
      probability: null,
      confidenceLow: null,
      confidenceHigh: null,
      standingsJson: JSON.stringify(
        state.standings.slice(0, 10).map((s) => ({
          position: s.position,
          riderId: s.riderId,
          name: names.get(s.riderId) ?? "?",
          points: s.points
        }))
      )
    })
    .onConflictDoUpdate({
      target: championshipSnapshots.id,
      set: {
        takenAt: new Date().toISOString(),
        trackedPoints: tracked.points,
        leaderPoints: leader.points,
        gapToLeader: tracked.points - leader.points,
        requiredNow: requirement.requiredNow,
        minimumPosition: requirement.minimum?.gp ?? null,
        state: requirement.status
      }
    })
    .run();

  return true;
}
