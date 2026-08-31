import { createDb } from "../lib/db";
import { CONTENDER_DEPTH, SEASON, TRACKED_RIDER_NAME } from "../lib/config";
import { topRivals } from "../lib/engine";
import { replaySeason } from "../lib/engine/replay";
import { forecast } from "../lib/model/forecast";

const db = createDb();
const { rounds, names } = replaySeason(db, SEASON);
const latest = rounds[rounds.length - 1];
const state = latest.state;
const trackedId = [...names.entries()].find(([, n]) => n === TRACKED_RIDER_NAME)![0];
const rivals = topRivals(state, trackedId, CONTENDER_DEPTH);

const currentPoints = new Map(state.standings.map((s) => [s.riderId, s.points]));
const currentWins = new Map(state.standings.map((s) => [s.riderId, s.positionCounts[0] ?? 0]));

const started = Date.now();
const f = forecast(db, SEASON, trackedId, rivals.map((r) => r.riderId), latest.round, currentPoints, currentWins);
const elapsed = Date.now() - started;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const bar = (x: number, width = 34) => "█".repeat(Math.round(x * width)).padEnd(width, "·");

console.log(`\n  LAYER 3 — MONTE CARLO  (${f.runs.toLocaleString()} seasons x ${f.sensitivity.length + 1} runs, ${elapsed}ms)\n`);
console.log(`  TITLE PROBABILITY   ${pct(f.probability)}   band ${pct(f.confidenceLow)} – ${pct(f.confidenceHigh)}\n`);

console.log(`  CONTENDERS SIMULATED: ${[trackedId, ...rivals.map((r) => r.riderId)].length}`);
console.log(`\n  MEAN FINAL POINTS`);
for (const r of f.meanFinalPoints) console.log(`    ${(names.get(r.riderId) ?? "?").padEnd(24)} ${r.points}`);

console.log(`\n  WHERE THE TITLE IS DECIDED`);
for (const c of f.clinchByRound) {
  if (c.probability < 0.001) continue;
  console.log(`    R${String(c.round).padStart(2)} ${c.shortName.padEnd(4)} ${bar(c.probability / Math.max(0.0001, 1 - f.never))} ${pct(c.probability)}`);
}
console.log(`    ${"not won".padEnd(8)} ${bar(f.never)} ${pct(f.never)}`);

console.log(`\n  IF MARC FINISHES ... AT ${f.clinchByRound[0].shortName}`);
for (const s of f.sensitivity) {
  console.log(`    ${s.label.padEnd(4)} ${bar(s.probability)} ${pct(s.probability)}`);
}
console.log(`\n  MINIMUM AT ${f.clinchByRound[0].shortName}: ${f.minimumLabel}\n`);
