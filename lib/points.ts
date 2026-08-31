/**
 * MotoGP points — the deterministic foundation (Layer 1).
 *
 * Nothing in this file may guess. Every function is pure and total.
 */

export const GP_POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
export const SPRINT_POINTS = [12, 9, 7, 6, 5, 4, 3, 2, 1] as const;

/** A perfect weekend: sprint win + Grand Prix win. */
export const MAX_WEEKEND_POINTS = GP_POINTS[0] + SPRINT_POINTS[0];

export type ScoringSession = "SPR" | "RAC";

/** Points for a finishing position, or 0 outside the scoring positions / for a DNF. */
export function pointsForPosition(type: ScoringSession, position: number | null): number {
  if (position === null || !Number.isInteger(position) || position < 1) return 0;
  const table = type === "RAC" ? GP_POINTS : SPRINT_POINTS;
  return position <= table.length ? table[position - 1] : 0;
}

/** Total points available across a number of complete race weekends. */
export function pointsAvailable(roundsRemaining: number): number {
  if (roundsRemaining < 0) throw new RangeError("roundsRemaining must be >= 0");
  return roundsRemaining * MAX_WEEKEND_POINTS;
}

/** The weekend haul for a sprint/GP position pair. */
export function weekendPoints(sprintPosition: number | null, gpPosition: number | null): number {
  return pointsForPosition("SPR", sprintPosition) + pointsForPosition("RAC", gpPosition);
}

/** How deep into the points a requirement reaches. An unconstrained session demands nothing. */
export function requirementDemand(type: ScoringSession, position: number | null): number {
  if (position === null) return 0;
  const table = type === "RAC" ? GP_POINTS : SPRINT_POINTS;
  if (position < 1 || position > table.length) return 0;
  return table.length - position + 1;
}

/**
 * The least demanding weekend that scores at least `required` points.
 * Returns null when `required` exceeds a perfect weekend.
 *
 * "Least demanding" is defined precisely, in this order:
 *   1. fewest points (never overshoot the requirement),
 *   2. lowest total demand — the shallower the finishes, the easier the ask,
 *      and an unconstrained session demands nothing at all,
 *   3. prefer leaving the sprint unconstrained, so the headline is a single
 *      Grand Prix position ("Marc needs P3 at Misano") rather than a coupled pair.
 *
 * Rule 2 means one hard constraint beats two coupled ones: for 25 points this
 * returns "win the Grand Prix", not "P2 sprint and P3 race", because a single
 * requirement is what the product actually displays.
 */
export function minimumWeekendFor(
  required: number
): { sprint: number | null; gp: number | null; points: number } | null {
  if (required <= 0) return { sprint: null, gp: null, points: 0 };
  if (required > MAX_WEEKEND_POINTS) return null;

  const sprintOptions: (number | null)[] = [null, ...SPRINT_POINTS.map((_, i) => i + 1)];
  const gpOptions: (number | null)[] = [null, ...GP_POINTS.map((_, i) => i + 1)];

  let best: { sprint: number | null; gp: number | null; points: number } | null = null;
  let bestKey: [number, number, number] | null = null;

  for (const sprint of sprintOptions) {
    for (const gp of gpOptions) {
      const points = weekendPoints(sprint, gp);
      if (points < required) continue;
      const key: [number, number, number] = [
        points,
        requirementDemand("SPR", sprint) + requirementDemand("RAC", gp),
        sprint === null ? 0 : 1
      ];
      if (bestKey === null || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
        best = { sprint, gp, points };
        bestKey = key;
      }
    }
  }
  return best;
}

/**
 * A few realistic ways to score at least `required` points across a weekend.
 *
 * `minimumWeekendFor` deliberately prefers a single constraint, which makes a
 * pace target read as "win the Grand Prix" when "P2 plus a few sprint points"
 * achieves exactly the same haul. For a pace figure the alternatives are the
 * informative part, so this returns them.
 */
export function waysToScore(required: number, limit = 3): { sprint: number | null; gp: number | null; points: number }[] {
  if (required <= 0 || required > MAX_WEEKEND_POINTS) return [];

  const options: { sprint: number | null; gp: number | null; points: number }[] = [];
  const sprintOptions: (number | null)[] = [null, ...SPRINT_POINTS.map((_, i) => i + 1)];
  const gpOptions: (number | null)[] = [null, ...GP_POINTS.map((_, i) => i + 1)];

  for (const sprint of sprintOptions) {
    for (const gp of gpOptions) {
      const points = weekendPoints(sprint, gp);
      if (points >= required) options.push({ sprint, gp, points });
    }
  }

  // Closest to the requirement first, then the least demanding Grand Prix
  // result — the combinations a rider would actually recognise as reachable.
  options.sort((a, b) => (a.points - b.points) || (b.gp ?? 0) - (a.gp ?? 0));

  const seen = new Set<number>();
  const distinct: typeof options = [];
  for (const option of options) {
    const key = (option.gp ?? 99) * 100 + (option.sprint ?? 99);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(option);
    if (distinct.length >= limit) break;
  }
  return distinct;
}

/** The worst Grand Prix position that scores at least `points`, or null if none does. */
export function gpPositionFor(points: number): number | null {
  if (points <= 0) return null;
  for (let position = GP_POINTS.length; position >= 1; position--) {
    if (GP_POINTS[position - 1] >= points) return position;
  }
  return null;
}

/** The worst sprint position that scores at least `points`, or null if none does. */
export function sprintPositionFor(points: number): number | null {
  if (points <= 0) return null;
  for (let position = SPRINT_POINTS.length; position >= 1; position--) {
    if (SPRINT_POINTS[position - 1] >= points) return position;
  }
  return null;
}

/**
 * Splits a weekend points target into one target per session.
 *
 * A rider does not ride "25 points"; they ride a sprint and a Grand Prix. So
 * pick the single pair that delivers the target, chosen to be as ridable as
 * possible:
 *   1. score exactly the target where possible — never demand more than needed;
 *   2. avoid requiring a win in either session if some other pair does the job;
 *   3. among what is left, prefer the most balanced pair — a similar level of
 *      result on both days, rather than a cruise on Saturday and a near-win on
 *      Sunday.
 *
 * Returns null when the target exceeds a perfect weekend.
 */
export function weekendTarget(
  required: number
): { sprint: number | null; gp: number | null; points: number } | null {
  if (required <= 0) return { sprint: null, gp: null, points: 0 };
  if (required > MAX_WEEKEND_POINTS) return null;

  type Pair = { sprint: number | null; gp: number | null; points: number };
  const candidates: Pair[] = [];
  for (let sprint = 1; sprint <= SPRINT_POINTS.length; sprint++) {
    for (let gp = 1; gp <= GP_POINTS.length; gp++) {
      const points = weekendPoints(sprint, gp);
      if (points >= required) candidates.push({ sprint, gp, points });
    }
  }
  // A target reachable in one session alone still needs a pair to display, so
  // fall back to the cheapest single-session requirement.
  if (candidates.length === 0) return minimumWeekendFor(required);

  const fewestPoints = Math.min(...candidates.map((c) => c.points));
  const exact = candidates.filter((c) => c.points === fewestPoints);

  // Higher position numbers are less demanding; a P1 requirement is the harshest.
  const leastHarsh = Math.max(...exact.map((c) => Math.min(c.sprint!, c.gp!)));
  const ridable = exact.filter((c) => Math.min(c.sprint!, c.gp!) === leastHarsh);

  const imbalance = (c: Pair) =>
    Math.abs(c.sprint! / SPRINT_POINTS.length - c.gp! / GP_POINTS.length);

  return [...ridable].sort((a, b) => imbalance(a) - imbalance(b))[0];
}
