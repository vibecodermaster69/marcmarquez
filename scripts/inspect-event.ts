import { eq } from "drizzle-orm";
import { createDb } from "../lib/db";
import { events, riders, sessionResults, sessions, syncLog } from "../lib/db/schema";

/**
 * Inspects one event's scoring sessions and what they contributed.
 * Usage: npm run inspect -- CAT 2026
 */
const shortName = (process.argv[2] ?? "CAT").toUpperCase();
const year = process.argv[3] ?? "2026";

const db = createDb();
const event = db.select().from(events).all().find((e) => e.shortName === shortName && e.dateStart.startsWith(year));
if (!event) throw new Error(`No event ${shortName} in ${year}`);

const names = new Map(db.select().from(riders).all().map((r) => [r.id, r.fullName]));

console.log(`\nEVENT: ${event.name}  (round ${event.round}, ${event.dateStart} to ${event.dateEnd})\n`);

const ses = db
  .select()
  .from(sessions)
  .where(eq(sessions.eventId, event.id))
  .all()
  .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

for (const s of ses) {
  const rows = db.select().from(sessionResults).where(eq(sessionResults.sessionId, s.id)).all();
  const total = rows.reduce((n, r) => n + r.points, 0);
  console.log(
    `  ${s.type.padEnd(4)} ${s.dateUtc}  ${(s.definitive ? "COUNTS" : "SUPERSEDED").padEnd(11)} results=${String(rows.length).padStart(2)}  points awarded=${total}`
  );
  const podium = rows.filter((r) => r.position !== null && r.position! <= 3).sort((a, b) => a.position! - b.position!);
  for (const p of podium) console.log(`         P${p.position}  ${(names.get(p.riderId) ?? "?").padEnd(24)} ${p.points} pts`);
}

console.log("\n  sync_log:");
for (const l of db.select().from(syncLog).all().filter((l) => l.target.startsWith(shortName))) {
  console.log(`    ${l.target.padEnd(9)} ${l.status.padEnd(9)} rows=${l.rowsWritten}  ${l.error ?? ""}`);
}

// Prove no superseded session leaked points into the championship.
const sessionIds = new Set(ses.map((s) => s.id));
const definitiveIds = new Set(ses.filter((s) => s.definitive).map((s) => s.id));
const haul = new Map<string, number>();
for (const r of db.select().from(sessionResults).all()) {
  if (!sessionIds.has(r.sessionId)) continue;
  if (!definitiveIds.has(r.sessionId)) throw new Error("FAIL: a superseded session contributed results");
  haul.set(r.riderId, (haul.get(r.riderId) ?? 0) + r.points);
}

console.log("\n  Weekend hauls (sprint + the race that counts):");
for (const [id, pts] of [...haul.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
  console.log(`    ${(names.get(id) ?? "?").padEnd(24)} ${pts}`);
}
console.log("\n  OK — no superseded session contributed championship points.\n");
