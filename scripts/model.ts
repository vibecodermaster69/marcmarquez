import { createDb } from "../lib/db";
import { SEASON, TRACKED_RIDER_NAME } from "../lib/config";
import { computeRequirement, RIVALS_MAX, RIVALS_ZERO, topRivals } from "../lib/engine";
import { replaySeason } from "../lib/engine/replay";
import { buildAssumptions } from "../lib/model/assumptions";

/** Layer 2 in the open: the distributions, and the realistic minimum they produce. */
const db = createDb();
const { rounds, names } = replaySeason(db, SEASON);
const latest = rounds[rounds.length - 1];
const state = latest.state;
const trackedId = [...names.entries()].find(([, n]) => n === TRACKED_RIDER_NAME)![0];
const rivals = topRivals(state, trackedId);
const ids = [trackedId, ...rivals.map((r) => r.riderId)];

const assumptions = buildAssumptions(db, SEASON, ids, latest.round);

console.log(`\n  LAYER 2 — empirical weekend-haul distributions (points and DNFs only)\n`);
console.log(`  RIDER                     n   MEAN     SD   P50   P75   DNF RATE`);
for (const id of ids) {
  const d = assumptions.table.get(id)![0];
  console.log(`  ${(names.get(id) ?? "?").padEnd(24)} ${String(d.n).padStart(2)}  ${String(d.mean).padStart(5)}  ${String(d.sd).padStart(5)}  ${String(d.p50).padStart(4)}  ${String(d.p75).padStart(4)}  ${(d.dnfRate * 100).toFixed(0).padStart(6)}%`);
}

console.log(`\n  ASSUMED POINTS PER REMAINING ROUND\n`);
process.stdout.write(`  ${"".padEnd(24)}`);
for (const c of assumptions.circuits) process.stdout.write(c.shortName.padStart(6));
process.stdout.write("\n");
for (const id of ids) {
  process.stdout.write(`  ${(names.get(id) ?? "?").padEnd(24)}`);
  for (let i = 0; i < assumptions.circuits.length; i++) {
    const row = assumptions.assumed.get(id)!;
    const v = id === trackedId ? row.tracked[i] : row.rival[i];
    process.stdout.write(v.toFixed(1).padStart(6));
  }
  const row = assumptions.assumed.get(id)!;
  const total = (id === trackedId ? row.tracked : row.rival).reduce((a, b) => a + b, 0);
  process.stdout.write(id === trackedId ? `   = ${total.toFixed(0)} (normal)\n` : `   = ${total.toFixed(0)} (strong)\n`);
}

const realistic = computeRequirement(state, trackedId, {
  rivalAssumption: assumptions.rival,
  trackedAssumption: assumptions.tracked,
  distribute: "pace"
});
const realisticAnchor = computeRequirement(state, trackedId, {
  rivalAssumption: assumptions.rival,
  trackedAssumption: assumptions.tracked
});
const best = computeRequirement(state, trackedId, { rivalAssumption: RIVALS_ZERO });
const worst = computeRequirement(state, trackedId, { rivalAssumption: RIVALS_MAX });

const show = (label: string, r: typeof realistic) => {
  const m = r.minimum;
  const desc = m === null ? "beyond a perfect weekend" : m.sprint === null && m.gp === null ? "nothing at all" : `${m.sprint ? `sprint P${m.sprint} + ` : ""}${m.gp ? `GP P${m.gp}` : ""} (${m.points} pts)`;
  console.log(`  ${label.padEnd(28)} total ${String(r.requiredTotal).padStart(4)}   at the next race ${String(r.requiredNow).padStart(4)}   ${r.status.padEnd(17)} ${desc}`);
};

console.log(`\n  THE THREE MINIMUMS\n`);
show("best case (rivals at 0)", best);
show("REALISTIC — pace", realistic);
show("REALISTIC — anchor", realisticAnchor);
show("worst case (rivals at max)", worst);
console.log();
