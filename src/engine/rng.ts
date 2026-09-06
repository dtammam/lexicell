/**
 * Seeded PRNG for the engine. Every random decision in a run flows through here.
 *
 * Algorithm: mulberry32. Its internal state after n draws is exactly
 * `seed + n * 0x6D2B79F5 (mod 2^32)`, so the state we carry is literally
 * `{ seed, counter }` (per ADR-004) and advancing is O(1) — no replay needed to
 * reconstruct the generator at any point in a run.
 *
 * All functions are pure: they take an `Rng` and return the drawn value plus
 * the advanced `Rng`. Nothing here mutates. The `Rng` object is plain JSON and
 * lives inside run state.
 */

export interface Rng {
  readonly seed: number;
  readonly counter: number;
}

const INCREMENT = 0x6d2b79f5;

export function createRng(seed: number): Rng {
  return { seed: seed >>> 0, counter: 0 };
}

/** FNV-1a over a string, for human-readable seeds ("2026-09-06", "dean"). */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: Rng): [number, Rng] {
  const counter = rng.counter + 1;
  const a = (rng.seed + Math.imul(counter, INCREMENT)) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { seed: rng.seed, counter }];
}

/** Uniform integer in [0, maxExclusive). */
export function nextInt(rng: Rng, maxExclusive: number): [number, Rng] {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(`nextInt: maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  const [f, next] = nextFloat(rng);
  return [Math.floor(f * maxExclusive), next];
}

export function pick<T>(rng: Rng, items: readonly T[]): [T, Rng] {
  if (items.length === 0) throw new RangeError('pick: empty array');
  const [i, next] = nextInt(rng, items.length);
  return [items[i] as T, next];
}

export interface Weighted<T> {
  readonly item: T;
  readonly weight: number;
}

/** Pick proportionally to weight. Zero-weight entries are never chosen. */
export function weightedPick<T>(rng: Rng, entries: readonly Weighted<T>[]): [T, Rng] {
  let total = 0;
  for (const e of entries) {
    if (e.weight < 0) throw new RangeError('weightedPick: negative weight');
    total += e.weight;
  }
  if (total <= 0) throw new RangeError('weightedPick: total weight must be positive');
  const [f, next] = nextFloat(rng);
  let target = f * total;
  for (const e of entries) {
    if (e.weight === 0) continue;
    if (target < e.weight) return [e.item, next];
    target -= e.weight;
  }
  // Floating-point edge: f*total landed on the boundary. Return the last positive entry.
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as Weighted<T>;
    if (e.weight > 0) return [e.item, next];
  }
  throw new Error('unreachable');
}

/** Fisher–Yates. Returns a new array; the input is untouched. */
export function shuffle<T>(rng: Rng, items: readonly T[]): [T[], Rng] {
  const out = items.slice();
  let r = rng;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, r] = nextInt(r, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return [out, r];
}
