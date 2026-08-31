import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db";
import { events, riders, sessionResults, sessions, standings, syncLog } from "../db/schema";
import { MotoGpClient, toRounds } from "../motogp/client";
import { seedSeason, validateClassification } from "./seed";
import {
  ARAGON_ID,
  CAT_ID,
  CAT_RAC_ABANDONED,
  CAT_RAC_RESTART,
  ARAGON_RACE_CLASSIFICATION,
  ARAGON_RAC,
  ARAGON_SPR,
  EVENTS,
  MARC,
  MISANO_ID,
  fakeFetch
} from "./fixtures";

function seededDb(options = {}) {
  const db = createDb(":memory:");
  const { impl, calls } = fakeFetch(options);
  const client = new MotoGpClient(impl as never);
  return { db, client, calls };
}

const marcPoints = (db: Db) =>
  db
    .select()
    .from(sessionResults)
    .where(eq(sessionResults.riderId, MARC.id))
    .all()
    .reduce((sum, r) => sum + r.points, 0);

describe("round derivation", () => {
  it("numbers rounds by date and excludes tests", () => {
    const rounds = toRounds(EVENTS as never);
    expect(rounds.map((r) => r.short_name)).toEqual(["CAT", "ARA", "RSM"]);
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });
});

describe("validateClassification", () => {
  it("accepts a correct classification", () => {
    expect(validateClassification("RAC", ARAGON_RACE_CLASSIFICATION as never)).toEqual([]);
  });

  it("rejects points that do not match the position", () => {
    const bad = ARAGON_RACE_CLASSIFICATION.map((r) => (r.position === 1 ? { ...r, points: 30 } : r));
    const issues = validateClassification("RAC", bad as never);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain("should score 25");
  });

  it("rejects duplicate positions", () => {
    const bad = [...ARAGON_RACE_CLASSIFICATION, { ...ARAGON_RACE_CLASSIFICATION[0], id: "dupe" }];
    const issues = validateClassification("RAC", bad as never);
    expect(issues.some((i) => i.reason.includes("duplicate position"))).toBe(true);
  });

  it("rejects an empty classification", () => {
    expect(validateClassification("RAC", [])).toHaveLength(1);
  });
});

describe("a red-flagged and restarted race", () => {
  it("counts only the restart, and keeps the abandoned run on record", async () => {
    const { db, client } = seededDb();
    await seedSeason(db, client, 2026);

    const cat = db.select().from(sessions).where(eq(sessions.eventId, CAT_ID)).all();
    const abandoned = cat.find((s) => s.id === CAT_RAC_ABANDONED)!;
    const restart = cat.find((s) => s.id === CAT_RAC_RESTART)!;

    // Both are on record...
    expect(abandoned).toBeDefined();
    expect(restart).toBeDefined();
    // ...but only the restart counts.
    expect(abandoned.definitive).toBe(false);
    expect(restart.definitive).toBe(true);

    // The abandoned run contributes no results at all.
    expect(db.select().from(sessionResults).where(eq(sessionResults.sessionId, CAT_RAC_ABANDONED)).all()).toHaveLength(0);
    expect(db.select().from(sessionResults).where(eq(sessionResults.sessionId, CAT_RAC_RESTART)).all()).toHaveLength(3);
  });

  it("does not mistake an abandoned race for corrupt data", async () => {
    const { db, client } = seededDb();
    const report = await seedSeason(db, client, 2026);
    // P1 with zero points is legitimate for a red-flagged race, not a validation failure.
    expect(report.rejected.map((r) => r.sessionId)).not.toContain(CAT_RAC_ABANDONED);
  });

  it("awards Marc the restart's points only", async () => {
    const { db, client } = seededDb();
    await seedSeason(db, client, 2026);
    const catResults = db
      .select()
      .from(sessionResults)
      .where(eq(sessionResults.riderId, MARC.id))
      .all()
      .filter((r) => r.sessionId === CAT_RAC_RESTART || r.sessionId === CAT_RAC_ABANDONED);
    expect(catResults).toHaveLength(1);
    expect(catResults[0].points).toBe(16);
  });
});

describe("seedSeason", () => {
  let db: Db;
  let client: MotoGpClient;

  beforeEach(() => {
    ({ db, client } = seededDb());
  });

  it("stores the calendar without test events", async () => {
    await seedSeason(db, client, 2026);
    const rows = db.select().from(events).all();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.shortName).sort()).toEqual(["ARA", "CAT", "RSM"]);
  });

  it("stores only the two point-scoring sessions", async () => {
    await seedSeason(db, client, 2026);
    const rows = db.select().from(sessions).where(eq(sessions.eventId, ARAGON_ID)).all();
    expect(rows.map((r) => r.type).sort()).toEqual(["RAC", "SPR"]);
  });

  it("records Marc's perfect Aragon weekend as 37 points", async () => {
    await seedSeason(db, client, 2026);
    const aragonSessions = db.select().from(sessions).where(eq(sessions.eventId, ARAGON_ID)).all();
    const aragonPoints = db
      .select()
      .from(sessionResults)
      .where(eq(sessionResults.riderId, MARC.id))
      .all()
      .filter((r) => aragonSessions.some((s) => s.id === r.sessionId))
      .reduce((sum, r) => sum + r.points, 0);
    expect(aragonPoints).toBe(37);
  });

  it("flags a non-classified finish as a DNF", async () => {
    await seedSeason(db, client, 2026);
    const dnfs = db.select().from(sessionResults).where(eq(sessionResults.dnf, true)).all();
    expect(dnfs).toHaveLength(2);
    expect(dnfs.every((d) => d.points === 0)).toBe(true);
  });

  it("stores an unfinished session but no results for it", async () => {
    await seedSeason(db, client, 2026);
    const misano = db.select().from(sessions).where(eq(sessions.eventId, MISANO_ID)).all();
    expect(misano).toHaveLength(1);
    expect(misano[0].status).toBe("UPCOMING");
    const results = db.select().from(sessionResults).where(eq(sessionResults.sessionId, misano[0].id)).all();
    expect(results).toHaveLength(0);
  });

  it("stores the published standings", async () => {
    await seedSeason(db, client, 2026);
    const rows = db.select().from(standings).all().sort((a, b) => a.position - b.position);
    expect(rows.map((r) => r.points)).toEqual([256, 237, 232]);
  });

  it("is idempotent — a second run must not double-count points", async () => {
    const first = await seedSeason(db, client, 2026);
    const afterFirst = {
      results: db.select().from(sessionResults).all().length,
      riders: db.select().from(riders).all().length,
      events: db.select().from(events).all().length,
      marc: marcPoints(db)
    };

    const second = await seedSeason(db, client, 2026);

    expect(db.select().from(sessionResults).all()).toHaveLength(afterFirst.results);
    expect(db.select().from(riders).all()).toHaveLength(afterFirst.riders);
    expect(db.select().from(events).all()).toHaveLength(afterFirst.events);
    expect(marcPoints(db)).toBe(afterFirst.marc);
    // Aragon 37 + Catalonia sprint 12 + Catalonia restart 16
    expect(marcPoints(db)).toBe(65);
    expect(second.results).toBe(first.results);
  });

  it("rejects a corrupt classification and leaves the database clean", async () => {
    const { db: db2, client: client2 } = seededDb({ corruptRacePoints: true });
    const report = await seedSeason(db2, client2, 2026);

    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0].sessionId).toBe(ARAGON_RAC);

    // The sprint still landed; only the bad race session was refused.
    const raceRows = db2.select().from(sessionResults).where(eq(sessionResults.sessionId, ARAGON_RAC)).all();
    expect(raceRows).toHaveLength(0);
    const sprintRows = db2.select().from(sessionResults).where(eq(sessionResults.sessionId, ARAGON_SPR)).all();
    expect(sprintRows).toHaveLength(5);

    const rejections = db2.select().from(syncLog).where(eq(syncLog.status, "REJECTED")).all();
    expect(rejections).toHaveLength(1);
    expect(rejections[0].error).toContain("points mismatch");
  });

  it("logs every successful session ingest", async () => {
    await seedSeason(db, client, 2026);
    const ok = db.select().from(syncLog).where(eq(syncLog.status, "OK")).all();
    // Aragon SPR + RAC, Catalonia SPR + restart, plus the superseded-session note
    expect(ok).toHaveLength(5);
    expect(ok.filter((r) => r.rowsWritten === 5)).toHaveLength(2);
  });
});
