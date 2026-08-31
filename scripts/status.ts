import { createDb } from "../lib/db";
import { RIVALS_MAX, RIVALS_ZERO, computeRequirement, contenders, earliestClinchRound, isEliminated, topRivals } from "../lib/engine";
import { replaySeason } from "../lib/engine/replay";

/** Layer 1's answer for the current championship. Arithmetic only — no model. */
const db = createDb();
const { rounds, names } = replaySeason(db, 2026);
const latest = rounds[rounds.length - 1];
const state = latest.state;
const marc = state.standings.find((s) => names.get(s.riderId) === "Marc Marquez")!;

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\n  THE PHOENIX EQUATION — Layer 1 (deterministic)\n`);
console.log(`  After round ${latest.round} (${latest.shortName}) · ${state.roundsRemaining} rounds remaining · ${state.pointsAvailable} points available\n`);

console.log("  STANDINGS");
for (const s of state.standings.slice(0, 5)) {
  const gap = s.points - state.standings[0].points;
  const mark = s.riderId === marc.riderId ? " <" : "";
  console.log(`   ${String(s.position).padStart(2)}  ${pad(names.get(s.riderId) ?? "?", 24)} ${String(s.points).padStart(3)}  ${gap === 0 ? "LEADER" : String(gap).padStart(6)}${mark}`);
}

console.log(`\n  Mathematically alive: ${contenders(state).length} of ${state.standings.length} riders`);
console.log(`  Marc eliminated: ${isEliminated(state, marc.riderId)}`);
console.log(`  Rivals in the top three: ${topRivals(state, marc.riderId).map((r) => names.get(r.riderId)).join(", ")}`);

console.log(`\n  THE BRACKET — the two bounds Layer 1 can prove without any model\n`);
for (const [label, assumption] of [["rivals take EVERY point", RIVALS_MAX], ["rivals score NOTHING", RIVALS_ZERO]] as const) {
  const req = computeRequirement(state, marc.riderId, { rivalAssumption: assumption });
  const min = req.minimum;
  console.log(`   ${pad(label, 26)} total needed ${String(req.requiredTotal).padStart(3)}   at Misano ${String(req.requiredNow).padStart(4)}   ${req.status}`);
  if (min) {
    const desc = min.gp === null && min.sprint === null ? "nothing at all" : `${min.sprint ? `sprint P${min.sprint} + ` : ""}${min.gp ? `GP P${min.gp}` : "no GP points"} (${min.points} pts)`;
    console.log(`   ${pad("", 26)} minimum: ${desc}`);
  } else {
    console.log(`   ${pad("", 26)} minimum: unreachable — more than a perfect weekend`);
  }
}

const earliest = earliestClinchRound(state, marc.riderId, RIVALS_ZERO);
const calendar = ["RSM", "AUT", "JPN", "INA", "AUS", "MAL", "QAT", "POR", "VAL"];
console.log(`\n  EARLIEST POSSIBLE CORONATION (rivals scoring nothing, Marc perfect)`);
console.log(`   ${earliest === null ? "not reachable this season" : `round ${latest.round + earliest + 1} — ${calendar[earliest]}, after ${earliest + 1} perfect weekend(s)`}`);
console.log();
