import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, type Db } from "../db";
import { championshipSnapshots, sessionResults, syncLog } from "../db/schema";
import { MotoGpClient } from "../motogp/client";
import { ARAGON_RAC, ARAGON_SPR, MARC, fakeFetch } from "./fixtures";
import { syncNow } from "./sync";

/** Aragon 2026 ran 28-30 Aug; the Grand Prix started 30 Aug 14:00 UTC. */
const DURING_RACE = new Date("2026-08-30T14:30:00Z");
const BEFORE_SETTLE = new Date("2026-08-30T16:00:00Z");
const AFTER_SETTLE = new Date("2026-08-30T20:00:00Z");

function fresh(options = {}) {
  const db = createDb(":memory:");
  const { impl } = fakeFetch(options);
  return { db, client: new MotoGpClient(impl as never) };
}

const marcPoints = (db: Db) =>
  db.select().from(sessionResults).where(eq(sessionResults.riderId, MARC.id)).all().reduce((n, r) => n + r.points, 0);

describe("syncNow", () => {
  it("ingests a finished session once the two-hour window has passed", async () => {
    const { db, client } = fresh();
    const report = await syncNow(db, client, { now: AFTER_SETTLE });

    expect(report.error).toBeUndefined();
    expect(report.ingested).toContain("2026 ARA RAC");
    expect(report.ingested).toContain("2026 ARA SPR");
    expect(marcPoints(db)).toBe(37);
  });

  it("refuses to read a classification while the race is still running", async () => {
    const { db, client } = fresh();
    const report = await syncNow(db, client, { now: DURING_RACE });

    expect(report.ingested).not.toContain("2026 ARA RAC");
    expect(db.select().from(sessionResults).where(eq(sessionResults.sessionId, ARAGON_RAC)).all()).toHaveLength(0);
    expect(report.waiting.some((w) => w.includes("ARA RAC"))).toBe(true);
  });

  it("waits out the settle window even after the race has finished", async () => {
    const { db, client } = fresh();
    const report = await syncNow(db, client, { now: BEFORE_SETTLE });

    // The sprint ran the day before and is long settled; the race is not.
    expect(report.ingested).toContain("2026 ARA SPR");
    expect(report.ingested).not.toContain("2026 ARA RAC");
    expect(db.select().from(sessionResults).where(eq(sessionResults.sessionId, ARAGON_SPR)).all()).toHaveLength(5);
    expect(db.select().from(sessionResults).where(eq(sessionResults.sessionId, ARAGON_RAC)).all()).toHaveLength(0);
  });

  it("picks up a session it missed on an earlier pass", async () => {
    const { db, client } = fresh();
    await syncNow(db, client, { now: BEFORE_SETTLE });
    expect(marcPoints(db)).toBe(12);

    const later = await syncNow(db, client, { now: AFTER_SETTLE });
    expect(later.ingested).toEqual(["2026 ARA RAC"]);
    expect(marcPoints(db)).toBe(37);
  });

  it("is idempotent — a second pass ingests nothing and changes nothing", async () => {
    const { db, client } = fresh();
    await syncNow(db, client, { now: AFTER_SETTLE });
    const rowsBefore = db.select().from(sessionResults).all().length;

    const second = await syncNow(db, client, { now: AFTER_SETTLE });

    expect(second.ingested).toHaveLength(0);
    expect(second.alreadyHad).toBeGreaterThan(0);
    expect(db.select().from(sessionResults).all()).toHaveLength(rowsBefore);
    expect(marcPoints(db)).toBe(37);
  });

  it("writes a championship snapshot when something new lands", async () => {
    const { db, client } = fresh();
    await syncNow(db, client, { now: AFTER_SETTLE });

    const snapshots = db.select().from(championshipSnapshots).all();
    expect(snapshots).toHaveLength(1);
    const snap = snapshots[0];
    expect(snap.trackedRiderId).toBe(MARC.id);
    expect(snap.trackedPoints).toBe(37);
    expect(snap.pointsAvailable).toBe(snap.roundsRemaining * 37);
    expect(snap.state).toBeTruthy();
    // No model has run, so no probability may be recorded.
    expect(snap.probability).toBeNull();
  });

  it("writes no snapshot when nothing changed", async () => {
    const { db, client } = fresh();
    await syncNow(db, client, { now: AFTER_SETTLE });
    const before = db.select().from(championshipSnapshots).all().length;
    const again = await syncNow(db, client, { now: AFTER_SETTLE });

    expect(again.snapshotWritten).toBe(false);
    expect(db.select().from(championshipSnapshots).all()).toHaveLength(before);
  });

  it("rejects a corrupt classification and leaves the database clean", async () => {
    const { db, client } = fresh({ corruptRacePoints: true });
    const report = await syncNow(db, client, { now: AFTER_SETTLE });

    expect(report.rejected).toHaveLength(1);
    expect(report.ingested).not.toContain("2026 ARA RAC");
    expect(db.select().from(sessionResults).where(eq(sessionResults.sessionId, ARAGON_RAC)).all()).toHaveLength(0);
    // The good sprint from the same weekend still landed.
    expect(marcPoints(db)).toBe(12);
    expect(db.select().from(syncLog).where(eq(syncLog.status, "REJECTED")).all()).toHaveLength(1);
  });

  it("records a failure without throwing or corrupting anything", async () => {
    const db = createDb(":memory:");
    const failing = new MotoGpClient((async () => ({ ok: false, status: 503, json: async () => ({}) })) as never);

    const report = await syncNow(db, failing, { now: AFTER_SETTLE });

    expect(report.error).toBeTruthy();
    expect(report.ingested).toHaveLength(0);
    expect(db.select().from(sessionResults).all()).toHaveLength(0);
    const failures = db.select().from(syncLog).where(eq(syncLog.status, "FAILED")).all();
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toContain("503");
  });

  it("only looks at events near now, so a pass stays cheap", async () => {
    const { db, client } = fresh();
    const report = await syncNow(db, client, { now: AFTER_SETTLE });
    // Catalonia (May) and Misano (September) are outside the window.
    expect(report.eventsInWindow).toBe(1);
  });
});
