import { createDb } from "../lib/db";
import { backtest } from "../lib/model/backtest";

/**
 * M7 — settle the model's two constants on evidence.
 *
 * Sweeps the history window and the form-drift rate together. Selection is on
 * CALIBRATION, not Brier: Brier keeps improving as the model stops
 * distinguishing riders at all, which is a worse model that merely hedges well.
 */
const db = createDb();
const years = [2024, 2025];
const windows = [1, 2, 4];
const drifts = [0, 0.15, 0.3, 0.5, 0.7];

console.log(`\n  TUNING — backtest over ${years.join(", ")}\n`);
console.log(`    SEASONS  DRIFT     n   BRIER    WORST CAL ERR   BIAS`);

let best = { window: 1, drift: 0, brier: Infinity, maxError: Infinity, n: 0 };
for (const window of windows) {
  for (const drift of drifts) {
    const r = backtest(db, years, drift, window);
    if (r.predictions.length < 40) continue;
    const better = r.maxCalibrationError < best.maxError;
    if (better) best = { window, drift, brier: r.brier, maxError: r.maxCalibrationError, n: r.predictions.length };
    console.log(
      `    ${String(window).padStart(7)}  ${drift.toFixed(2)}  ${String(r.predictions.length).padStart(4)}  ${r.brier.toFixed(4)}   ${(r.maxCalibrationError * 100).toFixed(1).padStart(11)}pp   ${(r.bias >= 0 ? "+" : "") + (r.bias * 100).toFixed(1)}pp${better ? " <-" : ""}`
    );
  }
}

const winner = backtest(db, years, best.drift, best.window);
console.log(`\n  BEST: ${best.window} season(s) of history, drift ${best.drift}`);
console.log(`    Phoenix model                    ${winner.brier.toFixed(4)}`);
console.log(`    baseline: current leader wins    ${winner.leaderBrier.toFixed(4)}  ${winner.brier < winner.leaderBrier ? "BEATEN" : "NOT BEATEN"}`);
console.log(`    baseline: proportional to points ${winner.proportionalBrier.toFixed(4)}  ${winner.brier < winner.proportionalBrier ? "BEATEN" : "NOT BEATEN"}`);
console.log(`\n  RELIABILITY AT THE BEST SETTING\n    BUCKET        n    SAID   HAPPENED   ERROR`);
for (const c of winner.calibration) {
  const e = c.observedFrequency - c.meanPredicted;
  console.log(`    ${c.bucket.padEnd(10)} ${String(c.predictions).padStart(4)}  ${(c.meanPredicted * 100).toFixed(1).padStart(5)}%  ${(c.observedFrequency * 100).toFixed(1).padStart(8)}%  ${(e >= 0 ? "+" : "") + (e * 100).toFixed(1)}pp`);
}
console.log();
