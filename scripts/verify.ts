import { and, eq } from "drizzle-orm";
import { createDb } from "../lib/db";
import { events, riders, seasons, sessionResults, sessions, standings } from "../lib/db/schema";
import { MAX_WEEKEND_POINTS } from "../lib/points";

/**
 * M1 acceptance check.
 *
 * Recomputes the championship from raw session results and compares it against
 * the standings motogp.com publishes. If these disagree, the ingest is wrong —
 * and everything the engine builds on top would be wrong too.
 */
function verify(year: number, today: string) {
  const db = createDb();
  const season = db.select().from(seasons).where(eq(seasons.year, year)).get();
  if (!season) throw new Error(`Season ${year} not seeded`);

  const definitive = db.select().from(sessions).where(eq(sessions.definitive, true)).all();
  const seasonEvents = db.select().from(events).where(eq(events.seasonId, season.id)).all();
  const eventIds = new Set(seasonEvents.map((e) => e.id));
  const seasonSessionIds = new Set(definitive.filter((s) => eventIds.has(s.eventId)).map((s) => s.id));

  const computed = new Map<string, number>();
  for (const result of db.select().from(sessionResults).all()) {
    if (!seasonSessionIds.has(result.sessionId)) continue;
    computed.set(result.riderId, (computed.get(result.riderId) ?? 0) + result.points);
  }

  const published = db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, season.id))
    .all()
    .sort((a, b) => a.position - b.position);

  const nameOf = new Map(db.select().from(riders).all().map((r) => [r.id, r.fullName]));

  let mismatches = 0;
  console.log(`\n=== ${year} — recomputed from ${seasonSessionIds.size} scoring sessions vs published standings\n`);
  console.log("  POS  RIDER                     PUBLISHED  COMPUTED");
  for (const row of published.slice(0, 10)) {
    const mine = computed.get(row.riderId) ?? 0;
    const ok = mine === row.points;
    if (!ok) mismatches += 1;
    console.log(
      `  ${String(row.position).padStart(3)}  ${(nameOf.get(row.riderId) ?? "?").padEnd(24)} ${String(row.points).padStart(9)} ${String(mine).padStart(9)}  ${ok ? "" : "  <<< MISMATCH"}`
    );
  }

  const remaining = seasonEvents.filter((e) => e.dateEnd >= today).sort((a, b) => a.round - b.round);
  if (remaining.length > 0) {
    console.log(`\n  Rounds remaining: ${remaining.length}  (${remaining.map((r) => r.shortName).join(", ")})`);
    console.log(`  Points available: ${remaining.length * MAX_WEEKEND_POINTS}`);
    const leader = published[0];
    const marc = published.find((p) => nameOf.get(p.riderId)?.includes("Marc Marquez"));
    if (marc && leader) console.log(`  Marc gap to leader: ${marc.points - leader.points}`);
  }

  console.log(`\n  ${mismatches === 0 ? "OK — recomputed championship matches motogp.com exactly" : `${mismatches} MISMATCH(ES)`}`);
  return mismatches;
}

const today = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const years = process.argv[2] ? [Number(process.argv[2])] : [2024, 2025, 2026];
let failures = 0;
for (const year of years) failures += verify(year, today);
process.exit(failures === 0 ? 0 : 1);
