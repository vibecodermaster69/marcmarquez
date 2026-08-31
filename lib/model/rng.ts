/**
 * A small seeded PRNG (mulberry32).
 *
 * The simulation must be reproducible: the same database and the same seed have
 * to produce the same probability, or the number on screen would drift between
 * page loads and no test could pin it.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, n). */
export function pickIndex(random: () => number, n: number): number {
  return Math.min(n - 1, Math.floor(random() * n));
}
