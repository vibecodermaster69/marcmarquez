import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { events, seasons, weekendTargetPlans } from "../db/schema";
import { computeRequirement, topRivals } from "../engine";
import { replaySeason } from "../engine/replay";
import { TRACKED_RIDER_NAME } from "../config";
import { buildAssumptions } from "../model/assumptions";
import { weekendTarget } from "../points";

/** Store a target once, before a weekend's first official result is ingested. */
export function ensureWeekendPlan(db: Db, year: number, eventId: string) {
  const existing = db.select().from(weekendTargetPlans).where(eq(weekendTargetPlans.eventId, eventId)).get();
  if (existing) return existing;

  const season = db.select().from(seasons).where(eq(seasons.year, year)).get();
  if (!season) return null;
  const { rounds, names } = replaySeason(db, year);
  const state = rounds[rounds.length - 1]?.state;
  const trackedId = [...names.entries()].find(([, name]) => name === TRACKED_RIDER_NAME)?.[0];
  if (!state || !trackedId) return null;

  const rivals = topRivals(state, trackedId).map((r) => r.riderId);
  const assumptions = buildAssumptions(db, year, [trackedId, ...rivals], rounds[rounds.length - 1].round);
  const targetPoints = computeRequirement(state, trackedId, {
    rivalAssumption: assumptions.rival,
    trackedAssumption: assumptions.tracked,
    distribute: "pace"
  }).requiredNow;
  const split = weekendTarget(targetPoints);
  const value = {
    eventId,
    seasonId: season.id,
    targetPoints,
    sprintTarget: split?.sprint ?? null,
    gpTarget: split?.gp ?? null,
    createdAt: new Date().toISOString()
  };
  db.insert(weekendTargetPlans).values(value).onConflictDoNothing().run();
  return db.select().from(weekendTargetPlans).where(eq(weekendTargetPlans.eventId, eventId)).get() ?? value;
}
