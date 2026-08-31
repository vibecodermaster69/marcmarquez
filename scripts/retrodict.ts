import { createDb } from "../lib/db";
import { clinchRound, replaySeason } from "../lib/engine/replay";

for (const year of [2024, 2025]) {
  const db = createDb();
  const { rounds, names } = replaySeason(db, year);
  const final = rounds[rounds.length - 1];
  const champion = final.state.standings[0];
  const clinch = clinchRound(rounds, champion.riderId);

  console.log(`\n=== ${year}: ${rounds.length} rounds replayed`);
  console.log(`  Champion: ${names.get(champion.riderId)} on ${champion.points} pts`);
  console.log(`  Runner-up: ${names.get(final.state.standings[1].riderId)} on ${final.state.standings[1].points} pts`);
  console.log(
    clinch
      ? `  Mathematically clinched at round ${clinch.round} (${clinch.shortName}), with ${clinch.state.roundsRemaining} round(s) to spare`
      : `  Never clinched before the final round — decided at the last race`
  );
  const last3 = rounds.slice(-4);
  for (const r of last3) {
    const lead = r.state.standings[0];
    const second = r.state.standings[1];
    console.log(
      `    after R${String(r.round).padStart(2)} ${r.shortName.padEnd(4)} ${(names.get(lead.riderId) ?? "").padEnd(20)} ${String(lead.points).padStart(3)}  lead ${String(lead.points - second.points).padStart(3)}  available ${String(r.state.pointsAvailable).padStart(3)}  clinched=${hasClinchedLabel(r, champion.riderId)}`
    );
  }
}

function hasClinchedLabel(r: { state: { standings: { riderId: string; points: number }[]; pointsAvailable: number } }, id: string) {
  const me = r.state.standings.find((s) => s.riderId === id)!;
  return r.state.standings.filter((s) => s.riderId !== id).every((o) => me.points > o.points + r.state.pointsAvailable);
}
