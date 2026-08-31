import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { CONTENDER_DEPTH, SEASON, TRACKED_RIDER_NAME } from "../config";
import { circuits, events, riders, sessionResults, sessions } from "../db/schema";
import {
  RIVALS_MAX,
  RIVALS_ZERO,
  computeRequirement,
  contenders,
  hasClinched,
  isEliminated,
  earliestClinchRound,
  topRivals,
  type ChampionshipStatus
} from "../engine";
import { replaySeason } from "../engine/replay";
import { gpPositionFor, weekendTarget, waysToScore } from "../points";
import { buildAssumptions } from "../model/assumptions";
import { forecast, type Forecast } from "../model/forecast";

// Single source of truth in lib/config.ts; re-exported for convenience.
export { CONTENDER_DEPTH, SEASON, TRACKED_RIDER_NAME } from "../config";

const FLAGS: Record<string, string> = {
  THA: "🇹🇭", BRA: "🇧🇷", USA: "🇺🇸", SPA: "🇪🇸", FRA: "🇫🇷", CAT: "🇪🇸", ITA: "🇮🇹", HUN: "🇭🇺",
  CZE: "🇨🇿", NED: "🇳🇱", GER: "🇩🇪", GBR: "🇬🇧", ARA: "🇪🇸", RSM: "🇮🇹", AUT: "🇦🇹", JPN: "🇯🇵",
  INA: "🇮🇩", AUS: "🇦🇺", MAL: "🇲🇾", QAT: "🇶🇦", POR: "🇵🇹", VAL: "🇪🇸"
};

export interface Bound {
  label: string;
  requiredTotal: number;
  requiredNow: number;
  status: ChampionshipStatus;
  minimumLabel: string;
  minimumHeadline: string;
  /** Realistic ways to reach the per-round requirement. */
  ways: string[];
}

export interface Dashboard {
  season: number;
  generatedAt: string;
  lastRound: { round: number; shortName: string; name: string; flag: string };
  nextRound: {
    round: number;
    shortName: string;
    name: string;
    /** The circuit's full name, e.g. "Misano World Circuit Marco Simoncelli". */
    circuitName: string;
    flag: string;
    dateStart: string;
  } | null;
  tracked: {
    name: string;
    points: number;
    position: number;
    gapToLeader: number;
    /** Mathematically champion — no rival can now catch him. */
    clinched: boolean;
    /** Mathematically out — he cannot now catch the leader. */
    eliminated: boolean;
  };
  leaderName: string;
  /**
   * The rival who actually constrains Marc: the highest-scoring rider other
   * than him. That is the leader while Marc is chasing, and the closest chaser
   * once Marc leads — the margin must hold in both directions.
   */
  principalRival: { name: string; surname: string; points: number; margin: number; chasing: boolean };
  roundsRemaining: number;
  totalRounds: number;
  pointsAvailable: number;
  contenderCount: number;
  riderCount: number;
  rivals: string[];
  avgPerWeekend: number;
  bestCase: Bound;
  realistic: Bound;
  worstCase: Bound;
  rivalOutlook: { name: string; normalTotal: number; strongTotal: number; perRound: number }[];
  simulation: {
    runs: number;
    probability: number;
    confidenceLow: number;
    confidenceHigh: number;
    never: number;
    clinchByRound: { round: number; shortName: string; flag: string; probability: number }[];
    sensitivity: { label: string; probability: number; isMinimum: boolean }[];
    minimumLabel: string;
    minimumPosition: number | null;
    projected: { name: string; points: number; isTracked: boolean }[];
  };
  /** How this weekend's two sessions stand, and what Sunday now demands. */
  weekend: {
    shortName: string;
    target: number;
    sprintRun: boolean;
    sprintResult: string | null;
    sprintPoints: number;
    sprintTarget: string | null;
    sprintTargetPoints: number;
    gpRun: boolean;
    gpResult: string | null;
    remainingForGp: number;
    gpTarget: string | null;
  } | null;
  earliestCoronation: { round: number; shortName: string; flag: string } | null;
  standings: { position: number; name: string; team: string; points: number; gap: number; isTracked: boolean }[];
  gapTimeline: { round: number; shortName: string; gap: number; points: number }[];
  recentResults: { round: number; shortName: string; flag: string; sprint: string; gp: string; points: number }[];
  calendar: { round: number; shortName: string; flag: string; state: "complete" | "next" | "upcoming" }[];
}

function describeMinimum(min: { sprint: number | null; gp: number | null; points: number } | null) {
  if (min === null) return { minimumLabel: "beyond a perfect weekend", minimumHeadline: "—" };
  if (min.sprint === null && min.gp === null) return { minimumLabel: "nothing at all", minimumHeadline: "ANY" };
  // Always name both sessions: a weekend is a sprint and a Grand Prix, and a
  // headline that shows only the Sunday result hides half the points.
  const gp = min.gp === null ? "no points" : `P${min.gp}`;
  const sprint = min.sprint === null ? "no points" : `P${min.sprint}`;
  return {
    minimumLabel: `GP ${gp} + sprint ${sprint} = ${min.points} pts`,
    minimumHeadline: `${gp} / ${sprint}`
  };
}

/**
 * The rival who actually constrains the tracked rider.
 *
 * Never "the leader": once the tracked rider leads, the constraint flips to the
 * closest chaser. Taking the highest-scoring rider other than the tracked one
 * handles both directions with the same rule, and it is also the rider the
 * requirement engine maximises against.
 */
export function principalRivalOf(
  standings: { riderId: string; points: number }[],
  trackedRiderId: string,
  roundsRemaining: number,
  nameOf: (id: string) => string
): Dashboard["principalRival"] | null {
  const tracked = standings.find((s) => s.riderId === trackedRiderId);
  const rival = standings.find((s) => s.riderId !== trackedRiderId);
  if (!tracked || !rival) return null;

  const full = nameOf(rival.riderId);
  const parts = full.split(" ");
  return {
    name: full,
    surname: (parts.length > 1 ? parts.slice(1).join(" ") : full).toUpperCase(),
    points: rival.points,
    // Positive: the tracked rider must gain this per weekend. Negative: he can
    // concede this much per weekend and still finish ahead.
    margin:
      roundsRemaining === 0
        ? 0
        : Math.round(((rival.points + 1 - tracked.points) / roundsRemaining) * 100) / 100,
    chasing: rival.points >= tracked.points
  };
}

export function getDashboard(): Dashboard {
  const db = createDb();
  const { rounds, names } = replaySeason(db, SEASON);
  const latest = rounds[rounds.length - 1];
  const state = latest.state;

  const trackedId = [...names.entries()].find(([, n]) => n === TRACKED_RIDER_NAME)?.[0];
  if (!trackedId) throw new Error(`${TRACKED_RIDER_NAME} not found in the database`);
  const tracked = state.standings.find((s) => s.riderId === trackedId)!;
  const leader = state.standings[0];

  const calendar = db
    .select()
    .from(events)
    .all()
    .filter((e) => e.dateStart.startsWith(String(SEASON)))
    .sort((a, b) => a.round - b.round);

  const nextEvent = calendar.find((e) => e.round === latest.round + 1) ?? null;
  const circuitNames = new Map(db.select().from(circuits).all().map((c) => [c.id, c.name]));

  // Everyone within realistic reach, not a fixed cast: a rider who climbs into
  // contention enters the simulation on his own.
  const rivalIds = topRivals(state, trackedId, CONTENDER_DEPTH).map((r) => r.riderId);
  const assumptions = buildAssumptions(db, SEASON, [trackedId, ...rivalIds], latest.round);

  const bound = (label: string, assumption: typeof RIVALS_MAX, tracked?: typeof RIVALS_MAX): Bound => {
    // The pace reading: what Marc must average from here. The anchor reading
    // dumps the whole season's shortfall on the next race and reads
    // "impossible" every week once rivals are assumed to ride well.
    const req = computeRequirement(state, trackedId, {
      rivalAssumption: assumption,
      trackedAssumption: tracked,
      distribute: "pace"
    });
    return {
      label,
      requiredTotal: req.requiredTotal,
      requiredNow: req.requiredNow,
      status: req.status,
      ...describeMinimum(req.minimum),
      ways: waysToScore(req.requiredNow).map((w) => {
        const parts: string[] = [];
        if (w.gp !== null) parts.push(`GP P${w.gp}`);
        if (w.sprint !== null) parts.push(`sprint P${w.sprint}`);
        return `${parts.join(" + ")} = ${w.points}`;
      })
    };
  };

  const earliestIndex = earliestClinchRound(state, trackedId, RIVALS_ZERO);
  const remainingEvents = calendar.filter((e) => e.round > latest.round);

  // Marc's last four weekends, sprint and Grand Prix.
  const allSessions = db.select().from(sessions).all().filter((s) => s.definitive);
  const sessionsById = new Map(allSessions.map((s) => [s.id, s]));
  const eventById = new Map(calendar.map((e) => [e.id, e]));
  const myResults = db.select().from(sessionResults).where(eq(sessionResults.riderId, trackedId)).all();

  const byRound = new Map<number, { sprint: string; gp: string; points: number }>();
  for (const r of myResults) {
    const session = sessionsById.get(r.sessionId);
    if (!session) continue;
    const event = eventById.get(session.eventId);
    if (!event) continue;
    const entry = byRound.get(event.round) ?? { sprint: "—", gp: "—", points: 0 };
    const label = r.position === null ? "DNF" : `P${r.position}`;
    if (session.type === "SPR") entry.sprint = label;
    else entry.gp = label;
    entry.points += r.points;
    byRound.set(event.round, entry);
  }

  /**
   * A rider's CURRENT team, from their most recent result this season.
   *
   * Not simply the last row in the table: a Map keeps the last value written,
   * and the results span several seasons, so seeding 2023 was enough to put
   * Marc back on a Repsol Honda. Teams change; only this season's counts.
   */
  const sessionOrder = new Map(
    allSessions
      .filter((s) => eventById.has(s.eventId))
      .map((s) => [s.id, `${eventById.get(s.eventId)!.round.toString().padStart(3, "0")}-${s.dateUtc}`])
  );
  const latestTeamRow = new Map<string, { key: string; team: string }>();
  for (const r of db.select().from(sessionResults).all()) {
    const key = sessionOrder.get(r.sessionId);
    if (!key || !r.teamName) continue;
    const existing = latestTeamRow.get(r.riderId);
    if (!existing || key > existing.key) latestTeamRow.set(r.riderId, { key, team: r.teamName });
  }
  const teamOf = new Map([...latestTeamRow].map(([riderId, v]) => [riderId, v.team]));

  // This weekend's two sessions: the sprint changes what Sunday must deliver.
  const paceTarget = computeRequirement(state, trackedId, {
    rivalAssumption: assumptions.rival,
    trackedAssumption: assumptions.tracked,
    distribute: "pace"
  }).requiredNow;

  let weekend: Dashboard["weekend"] = null;
  if (nextEvent) {
    const weekendSessions = allSessions.filter((s) => s.eventId === nextEvent.id);
    const sprint = weekendSessions.find((s) => s.type === "SPR") ?? null;
    const gp = weekendSessions.find((s) => s.type === "RAC") ?? null;
    const myRow = (sessionId: string | undefined) =>
      sessionId ? myResults.find((r) => r.sessionId === sessionId) ?? null : null;

    const sprintRow = myRow(sprint?.id);
    const gpRow = myRow(gp?.id);
    const sprintPoints = sprintRow?.points ?? 0;
    // Once the sprint has run, Sunday carries whatever the weekend still owes.
    const remainingForGp = Math.max(0, paceTarget - sprintPoints);
    // One target per session, split so both days ask for a similar level of result.
    const split = weekendTarget(paceTarget);

    weekend = {
      shortName: nextEvent.shortName,
      target: paceTarget,
      sprintRun: sprintRow !== null,
      sprintResult: sprintRow ? (sprintRow.position === null ? "DNF" : `P${sprintRow.position}`) : null,
      sprintPoints,
      sprintTarget: split?.sprint == null ? null : `P${split.sprint}`,
      sprintTargetPoints: split?.sprint == null ? 0 : 0,
      gpRun: gpRow !== null,
      gpResult: gpRow ? (gpRow.position === null ? "DNF" : `P${gpRow.position}`) : null,
      remainingForGp,
      // Before the sprint runs, the Grand Prix target is its half of the split.
      // Once Saturday is banked, Sunday carries whatever the weekend still owes.
      gpTarget: (() => {
        if (!sprintRow) return split?.gp == null ? null : `P${split.gp}`;
        const position = gpPositionFor(remainingForGp);
        return position === null ? (remainingForGp > 0 ? null : "ANY") : `P${position}`;
      })()
    };
  }

  const currentPoints = new Map(state.standings.map((s) => [s.riderId, s.points]));
  const currentWins = new Map(state.standings.map((s) => [s.riderId, s.positionCounts[0] ?? 0]));
  const sim: Forecast = forecast(db, SEASON, trackedId, rivalIds, latest.round, currentPoints, currentWins);

  return {
    season: SEASON,
    weekend,
    simulation: {
      runs: sim.runs,
      probability: sim.probability,
      confidenceLow: sim.confidenceLow,
      confidenceHigh: sim.confidenceHigh,
      never: sim.never,
      clinchByRound: sim.clinchByRound.map((c) => ({ ...c, flag: FLAGS[c.shortName] ?? "🏁" })),
      sensitivity: sim.sensitivity.map((p) => ({
        label: p.label,
        probability: p.probability,
        isMinimum: p.gpPosition !== null && p.gpPosition === sim.minimumPosition
      })),
      minimumLabel: sim.minimumLabel,
      minimumPosition: sim.minimumPosition,
      projected: sim.meanFinalPoints
        .map((r) => ({ name: names.get(r.riderId) ?? "?", points: r.points, isTracked: r.riderId === trackedId }))
        .sort((a, b) => b.points - a.points)
    },
    generatedAt: new Date().toISOString(),
    lastRound: { round: latest.round, shortName: latest.shortName, name: eventById.get(calendar.find((e) => e.round === latest.round)!.id)!.name, flag: FLAGS[latest.shortName] ?? "🏁" },
    nextRound: nextEvent
      ? {
          round: nextEvent.round,
          shortName: nextEvent.shortName,
          name: nextEvent.name,
          circuitName: circuitNames.get(nextEvent.circuitId) ?? nextEvent.name,
          flag: FLAGS[nextEvent.shortName] ?? "🏁",
          dateStart: nextEvent.dateStart
        }
      : null,
    tracked: {
      name: TRACKED_RIDER_NAME,
      points: tracked.points,
      position: tracked.position,
      gapToLeader: tracked.points - leader.points,
      clinched: hasClinched(state, trackedId),
      eliminated: isEliminated(state, trackedId)
    },
    leaderName: names.get(leader.riderId) ?? "the leader",
    principalRival: principalRivalOf(state.standings, trackedId, state.roundsRemaining, (id) => names.get(id) ?? "?")!,
    roundsRemaining: state.roundsRemaining,
    totalRounds: calendar.length,
    pointsAvailable: state.pointsAvailable,
    contenderCount: contenders(state).length,
    riderCount: state.standings.length,
    rivals: topRivals(state, trackedId).map((r) => names.get(r.riderId) ?? "?"),
    // Retained for compatibility; the meaningful figure is principalRival.margin.
    avgPerWeekend: state.roundsRemaining === 0 ? 0 : Math.round(((leader.points + 1 - tracked.points) / state.roundsRemaining) * 100) / 100,
    bestCase: bound("rivals score nothing", RIVALS_ZERO),
    realistic: bound("rivals ride well", assumptions.rival, assumptions.tracked),
    worstCase: bound("rivals take every point", RIVALS_MAX),
    rivalOutlook: rivalIds.map((id) => {
      const row = assumptions.assumed.get(id)!;
      const strongTotal = row.rival.reduce((a, b) => a + b, 0);
      return {
        name: names.get(id) ?? "?",
        normalTotal: Math.round(row.tracked.reduce((a, b) => a + b, 0)),
        strongTotal: Math.round(strongTotal),
        perRound: Math.round((strongTotal / Math.max(1, row.rival.length)) * 10) / 10
      };
    }),
    earliestCoronation:
      earliestIndex === null || !remainingEvents[earliestIndex]
        ? null
        : {
            round: remainingEvents[earliestIndex].round,
            shortName: remainingEvents[earliestIndex].shortName,
            flag: FLAGS[remainingEvents[earliestIndex].shortName] ?? "🏁"
          },
    standings: state.standings.slice(0, 5).map((s) => ({
      position: s.position,
      name: names.get(s.riderId) ?? "?",
      team: teamOf.get(s.riderId) ?? "",
      points: s.points,
      gap: s.points - leader.points,
      isTracked: s.riderId === trackedId
    })),
    gapTimeline: rounds.map((r) => {
      const me = r.state.standings.find((s) => s.riderId === trackedId)!;
      const top = r.state.standings[0];
      return { round: r.round, shortName: r.shortName, gap: me.points - top.points, points: me.points };
    }),
    recentResults: [...byRound.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, 4)
      .map(([round, r]) => {
        const event = calendar.find((e) => e.round === round)!;
        return { round, shortName: event.shortName, flag: FLAGS[event.shortName] ?? "🏁", sprint: r.sprint, gp: r.gp, points: r.points };
      }),
    calendar: calendar.map((e) => ({
      round: e.round,
      shortName: e.shortName,
      flag: FLAGS[e.shortName] ?? "🏁",
      state: e.round < latest.round + 1 ? "complete" : e.round === latest.round + 1 ? "next" : "upcoming"
    }))
  };
}
