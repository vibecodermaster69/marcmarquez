import { createDb } from "../lib/db";
import { syncNow } from "../lib/ingest/sync";
import { MotoGpClient } from "../lib/motogp/client";
import { SEASON } from "../lib/config";

/**
 * One unattended sync pass. Safe to run on any schedule, as often as you like.
 * Usage: npm run sync [year]
 */
async function main() {
  const year = Number(process.argv[2]) || SEASON;
  const report = await syncNow(createDb(), new MotoGpClient(), { year });

  console.log(`\n  SYNC ${report.ranAt}`);
  console.log(`  events in window: ${report.eventsInWindow}`);
  console.log(`  ingested:         ${report.ingested.length ? report.ingested.join(", ") : "nothing"}`);
  console.log(`  already stored:   ${report.alreadyHad}`);
  console.log(`  snapshot written: ${report.snapshotWritten}`);
  for (const w of report.waiting) console.log(`  waiting:          ${w}`);
  for (const r of report.rejected) console.log(`  REJECTED:         ${r.sessionId} — ${r.reason}`);
  if (report.error) {
    console.error(`  ERROR:            ${report.error}`);
    process.exit(1);
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
