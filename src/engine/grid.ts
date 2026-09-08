/**
 * Tile drawing and grid generation. Weighted by English letter frequency
 * (Scrabble distribution), with a vowel floor and a solver check so a fresh
 * grid always has a 4+ letter word and a refilled grid never has zero words.
 * ADR-005 / risk table: "dead or near-dead grids".
 */
import { nextInt, weightedPick, type Rng, type Weighted } from './rng';
import type { Solver } from './solver';
import { GRID_SIZE, type Tile } from './types';

/** Scrabble tile counts double as frequency weights. */
export const LETTER_WEIGHT: Readonly<Record<string, number>> = {
  a: 9, b: 2, c: 2, d: 4, e: 12, f: 2, g: 3, h: 2, i: 9, j: 1, k: 1, l: 4, m: 2,
  n: 6, o: 8, p: 2, q: 1, r: 6, s: 4, t: 6, u: 4, v: 2, w: 2, x: 1, y: 2, z: 1,
};

export const VOWELS = 'aeiou';
/** Minimum vowels in a 16-tile grid after any draw. */
export const VOWEL_FLOOR = 4;
/** A fresh grid must offer a word at least this long. */
export const FRESH_GRID_MIN_WORD = 4;
const FRESH_GRID_ATTEMPTS = 20;

export function isVowel(letter: string): boolean {
  return VOWELS.includes(letter);
}

function weights(vowelWeight: number): Weighted<string>[] {
  return Object.entries(LETTER_WEIGHT).map(([item, w]) => ({ item, weight: isVowel(item) ? w * vowelWeight : w }));
}

const VOWEL_WEIGHTS: Weighted<string>[] = Object.entries(LETTER_WEIGHT)
  .filter(([l]) => isVowel(l))
  .map(([item, weight]) => ({ item, weight }));

export function drawLetter(rng: Rng, vowelWeight = 1): [string, Rng] {
  return weightedPick(rng, weights(vowelWeight));
}

export function plainTile(letter: string): Tile {
  return { letter, lockedTurns: 0, venom: 0 };
}

/** Letters of tiles that can currently be played. */
export function playableLetters(grid: readonly Tile[]): string[] {
  return grid.filter((t) => t.lockedTurns === 0).map((t) => t.letter);
}

export function playableIndices(grid: readonly Tile[]): number[] {
  const out: number[] = [];
  grid.forEach((t, i) => {
    if (t.lockedTurns === 0) out.push(i);
  });
  return out;
}

/**
 * If the grid has fewer than VOWEL_FLOOR vowels, replace random playable
 * consonants with random vowels until it does. Locked tiles are left alone.
 */
export function enforceVowelFloor(rng: Rng, grid: readonly Tile[]): [Tile[], Rng] {
  const out = grid.slice();
  let r = rng;
  let vowels = out.filter((t) => isVowel(t.letter)).length;
  while (vowels < VOWEL_FLOOR) {
    const consonants = out.map((t, i) => (t.lockedTurns === 0 && !isVowel(t.letter) ? i : -1)).filter((i) => i >= 0);
    if (consonants.length === 0) break;
    let k: number;
    let v: string;
    [k, r] = nextInt(r, consonants.length);
    [v, r] = weightedPick(r, VOWEL_WEIGHTS);
    // Only the letter changes: a venomed or otherwise marked tile keeps its marks (gate W1).
    const at = consonants[k] as number;
    out[at] = { ...(out[at] as Tile), letter: v };
    vowels++;
  }
  return [out, r];
}

/** Replace the tiles at `indices` with fresh draws, then apply the vowel floor. */
export function refill(rng: Rng, grid: readonly Tile[], indices: readonly number[], vowelWeight = 1): [Tile[], Rng] {
  const out = grid.slice();
  let r = rng;
  for (const i of indices) {
    let l: string;
    [l, r] = drawLetter(r, vowelWeight);
    out[i] = plainTile(l);
  }
  return enforceVowelFloor(r, out);
}

function longestWord(words: readonly string[]): number {
  let best = 0;
  for (const w of words) if (w.length > best) best = w.length;
  return best;
}

/**
 * A brand-new 16-tile grid with at least one word of FRESH_GRID_MIN_WORD
 * letters. Regenerates on failure; the vowel floor makes failure rare enough
 * that the attempt cap is a safety net, not a code path.
 */
export function freshGrid(rng: Rng, solver: Solver, vowelWeight = 1): [Tile[], Rng] {
  let r = rng;
  let grid: Tile[] = [];
  for (let attempt = 0; attempt < FRESH_GRID_ATTEMPTS; attempt++) {
    [grid, r] = refill(
      r,
      Array.from({ length: GRID_SIZE }, () => plainTile('a')),
      Array.from({ length: GRID_SIZE }, (_, i) => i),
      vowelWeight,
    );
    if (longestWord(solver.solve(playableLetters(grid))) >= FRESH_GRID_MIN_WORD) return [grid, r];
  }
  return [grid, r];
}

/** Columns of the 4x4 grid; index = row * GRID_COLS + col. */
export const GRID_COLS = 4;

/**
 * Gravity (Dean, 2026-09-08): after a refill, each column settles so the surviving tiles
 * keep their order at the top and the fresh tiles sit at the bottom. Pure permutation, no
 * RNG: the multiset of letters is exactly what refill drew, only positions change.
 */
export function settle(grid: readonly Tile[], fresh: readonly number[]): Tile[] {
  const isFresh = new Set(fresh);
  const rows = grid.length / GRID_COLS;
  const out = grid.slice();
  for (let c = 0; c < GRID_COLS; c++) {
    const survivors: Tile[] = [];
    const incoming: Tile[] = [];
    for (let r = 0; r < rows; r++) {
      const i = r * GRID_COLS + c;
      (isFresh.has(i) ? incoming : survivors).push(grid[i] as Tile);
    }
    const column = [...survivors, ...incoming];
    for (let r = 0; r < rows; r++) out[r * GRID_COLS + c] = column[r] as Tile;
  }
  return out;
}

/** True when no word can be made from the playable tiles. */
export function isDead(grid: readonly Tile[], solver: Solver): boolean {
  return solver.solve(playableLetters(grid)).length === 0;
}
