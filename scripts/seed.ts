import { createDb } from "../lib/db";
import { seedSeason } from "../lib/ingest/seed";
import { MotoGpClient } from "../lib/motogp/client";

/**
 * Seeds 2024, 2025 and 2026.
 * 2024/25 are required by Layer 2's distributions and by the backtest, so they
 * are loaded now rather than fetched twice.
 */
async function main() {
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  const targets = years.length > 0 ? years : [2024, 2025, 2026];

  const db = createDb();
  const client = new MotoGpClient();

  for (const year of targets) {
    process.stdout.write(`\nSeeding ${year} ... `);
    const report = await seedSeason(db, client, year);
    process.stdout.write(
      `${report.events} events, ${report.sessions} scoring sessions, ${report.results} results, ${report.standings} standings rows`
    );
    if (report.rejected.length > 0) {
      process.stdout.write(`\n  REJECTED ${report.rejected.length} session(s):`);
      for (const r of report.rejected) process.stdout.write(`\n   - ${r.sessionId}: ${r.reason}`);
    }
  }
  process.stdout.write("\n\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
