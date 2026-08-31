import { createDb } from "../lib/db";
import { backtest } from "../lib/model/backtest";

/**
 * M7 — does the probability mean anything?
 *
 * Replays 2024 and 2025 round by round, asks the model what it would have said
 * at the time (using only the history available then), and scores it against
 * what actually happened.
 */
const years = process.argv.slice(2).map(Number).filter(Boolean);
const targets = years.length > 0 ? years : [2024, 2025];

const started = Date.now();
const result = backtest(createDb(), targets);
const elapsed = Date.now() - started;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`\n  BACKTEST — ${targets.join(", ")}  (${result.predictions.length} predictions, ${elapsed}ms)\n`);

console.log(`  BRIER SCORE  (lower is better; 0 is perfect, 0.25 is a coin flip)\n`);
const rows: [string, number][] = [
  ["Phoenix model", result.brier],
  ["baseline: current leader wins", result.leaderBrier],
  ["baseline: proportional to points", result.proportionalBrier]
];
for (const [label, score] of rows) {
  const beats = label.startsWith("Phoenix") ? "" : result.brier < score ? "   <- beaten" : "   <- NOT BEATEN";
  console.log(`    ${label.padEnd(34)} ${score.toFixed(4)}${beats}`);
}

console.log(`\n  RELIABILITY  (when it said X%, how often did it happen?)\n`);
console.log(`    BUCKET        n    SAID   HAPPENED   ERROR`);
for (const c of result.calibration) {
  const error = c.observedFrequency - c.meanPredicted;
  console.log(
    `    ${c.bucket.padEnd(10)} ${String(c.predictions).padStart(4)}  ${pct(c.meanPredicted).padStart(6)}  ${pct(c.observedFrequency).padStart(9)}  ${(error >= 0 ? "+" : "") + (error * 100).toFixed(1)}pp`
  );
}

console.log(`\n  OVERALL BIAS  ${result.bias >= 0 ? "+" : ""}${(result.bias * 100).toFixed(1)}pp  ${result.bias > 0.02 ? "(over-confident)" : result.bias < -0.02 ? "(under-confident)" : "(well centred)"}`);

console.log(`\n  A FEW PREDICTIONS IN THE RUN-IN\n`);
for (const p of result.predictions.filter((p) => p.roundsRemaining <= 3).slice(0, 12)) {
  console.log(
    `    ${p.year} R${String(p.round).padStart(2)} ${p.shortName.padEnd(4)} ${p.riderName.padEnd(22)} said ${pct(p.probability).padStart(6)}   actually ${p.outcome ? "CHAMPION" : "-"}`
  );
}
console.log();
