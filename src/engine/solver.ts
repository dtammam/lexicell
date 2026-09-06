/**
 * All dictionary words formable from a set of available letters.
 *
 * Bookworm has no adjacency constraint, so a grid is a multiset of letters.
 * `createSolver` precomputes, once per dictionary, a 26-bit letter mask and a
 * 26-byte letter-count row for every word. Solving is then a linear scan:
 * a mask test rejects most words in one AND, and the survivors get a count
 * compare. ADR-005 estimated single-digit milliseconds; the test pins < 20 ms.
 *
 * The solver index is a derived resource like the dictionary itself. It is
 * never part of run state.
 */
import type { Dictionary } from './dictionary';

const A = 'a'.charCodeAt(0);

export interface Solver {
  /** Every valid word formable from `letters`, in dictionary (sorted) order. */
  solve(letters: readonly string[]): string[];
  /** Could this exact word be formed from `letters`? */
  canForm(word: string, letters: readonly string[]): boolean;
}

export function createSolver(dictionary: Dictionary): Solver {
  const words = dictionary.words;
  const n = words.length;
  const masks = new Uint32Array(n);
  const counts = new Uint8Array(n * 26);
  for (let i = 0; i < n; i++) {
    const w = words[i] as string;
    let mask = 0;
    for (let k = 0; k < w.length; k++) {
      const c = w.charCodeAt(k) - A;
      mask |= 1 << c;
      counts[i * 26 + c] = (counts[i * 26 + c] as number) + 1;
    }
    masks[i] = mask;
  }

  function fits(i: number, gridMask: number, gridCounts: Uint8Array): boolean {
    const m = masks[i] as number;
    if ((m & ~gridMask) !== 0) return false;
    const base = i * 26;
    for (let c = 0; c < 26; c++) {
      if ((counts[base + c] as number) > (gridCounts[c] as number)) return false;
    }
    return true;
  }

  function tally(letters: readonly string[]): [number, Uint8Array] {
    const gridCounts = new Uint8Array(26);
    let gridMask = 0;
    for (const l of letters) {
      const c = l.charCodeAt(0) - A;
      if (c < 0 || c > 25 || l.length !== 1) throw new RangeError(`solver: bad letter ${JSON.stringify(l)}`);
      gridCounts[c] = (gridCounts[c] as number) + 1;
      gridMask |= 1 << c;
    }
    return [gridMask, gridCounts];
  }

  return {
    solve(letters) {
      const [gridMask, gridCounts] = tally(letters);
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        if (fits(i, gridMask, gridCounts)) out.push(words[i] as string);
      }
      return out;
    },
    canForm(word, letters) {
      if (!dictionary.has(word)) return false;
      const [gridMask, gridCounts] = tally(letters);
      for (const ch of word.toLowerCase()) {
        const c = ch.charCodeAt(0) - A;
        if (c < 0 || c > 25) return false;
        if (((gridMask >> c) & 1) === 0 || (gridCounts[c] as number) === 0) return false;
        gridCounts[c] = (gridCounts[c] as number) - 1;
      }
      return true;
    },
  };
}

/**
 * Map a word onto tile indices, one tile per letter, using each index at most
 * once. `available` are the indices that may be used (e.g. unlocked tiles).
 * Returns null if the word cannot be spelled from those tiles.
 */
export function tilesForWord(word: string, letters: readonly string[], available: readonly number[]): number[] | null {
  const pool = new Map<string, number[]>();
  for (const i of available) {
    const l = letters[i];
    if (l === undefined) continue;
    const list = pool.get(l);
    if (list) list.push(i);
    else pool.set(l, [i]);
  }
  const out: number[] = [];
  for (const ch of word) {
    const list = pool.get(ch);
    const idx = list?.pop();
    if (idx === undefined) return null;
    out.push(idx);
  }
  return out;
}
