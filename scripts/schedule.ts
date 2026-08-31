import { eq } from "drizzle-orm";
import { createDb } from "../lib/db";
import { events, seasons, sessions } from "../lib/db/schema";
import { SEASON } from "../lib/config";
import { estimatedEnd, fetchAfter, inZone } from "../lib/ingest/schedule";

/**
 * Prints the refresh schedule for every remaining scoring session.
 * Verifies that the 2-hour post-race gap lands sensibly in every time zone the
 * calendar visits — the check a fixed 8pm IST cron cannot pass on its own.
 */
const IST = "Asia/Kolkata";
const db = createDb();
const season = db.select().from(seasons).where(eq(seasons.year, SEASON)).get()!;
const calendar = db.select().from(events).where(eq(events.seasonId, season.id)).all().sort((a, b) => a.round - b.round);
const all = db.select().from(sessions).all().filter((s) => s.definitive);
const now = new Date();

console.log(`\n  REFRESH SCHEDULE — 2 hours after each race ends\n`);
console.log(`  RND  EVENT  SES   RACE ENDS (IST)              FETCH AT (IST)               FETCH AT (UTC)`);

for (const event of calendar) {
  const mine = all
    .filter((s) => s.eventId === event.id)
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  for (const s of mine) {
    const session = { id: s.id, type: s.type, dateUtc: s.dateUtc, status: s.status };
    const fetchTime = fetchAfter(session, event);
    if (fetchTime < now) continue; // already ingested
    console.log(
      `  ${String(event.round).padStart(3)}  ${event.shortName.padEnd(5)}  ${s.type.padEnd(4)}  ${inZone(estimatedEnd(session, event), IST).padEnd(28)}${inZone(fetchTime, IST).padEnd(29)}${inZone(fetchTime, "UTC")}`
    );
  }
}
console.log();
