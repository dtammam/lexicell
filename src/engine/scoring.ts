/**
 * word + resolved scoring effects -> damage. Single source of truth for the formula.
 *
 * Placeholder formula from the architecture pack; the Phase 0 sim decides
 * the numbers. Structure:
 *
 *   letters = sum(LETTER_VALUE[c]) + sum(letterBonus hits)
 *   base    = letters * lengthBonus(len) + sum(addFlat)
 *   mult    = 1 + sum(addMult)
 *   damage  = floor(base * mult)
 *
 * addFlat lands after the length bonus so "+5 damage" means +5, not
 * "+5 scaled by word length". Every item that touches damage goes through
 * here; nothing else computes damage.
 */
import type { Effect } from './effects';

/** Scrabble letter values, halved for the rare letters so a lone Q isn't a run-winner. */
export const LETTER_VALUE: Readonly<Record<string, number>> = {
  a: 1, e: 1, i: 1, o: 1, u: 1, l: 1, n: 1, s: 1, t: 1, r: 1,
  d: 2, g: 2,
  b: 3, c: 3, m: 3, p: 3,
  f: 4, h: 4, v: 4, w: 4, y: 4,
  k: 5,
  j: 6, x: 6,
  q: 8, z: 8,
};

/** Superlinear from 5 letters so long words feel like events. */
export function lengthBonus(len: number): number {
  if (len <= 4) return 1;
  if (len === 5) return 1.5;
  if (len === 6) return 2;
  if (len === 7) return 2.5;
  if (len === 8) return 3;
  return 3.5 + (len - 9) * 0.5;
}

export interface Score {
  readonly word: string;
  readonly letters: number;
  readonly base: number;
  readonly mult: number;
  readonly damage: number;
}

export function letterSum(word: string): number {
  let sum = 0;
  for (const c of word) {
    const v = LETTER_VALUE[c];
    if (v === undefined) throw new RangeError(`scoring: no value for ${JSON.stringify(c)}`);
    sum += v;
  }
  return sum;
}

/** `effects` must already be resolved (no conditions). Non-scoring effects are ignored. */
export function scoreWord(word: string, effects: readonly Effect[]): Score {
  let letters = letterSum(word);
  let flat = 0;
  let mult = 1;
  for (const e of effects) {
    switch (e.type) {
      case 'addFlat':
        flat += e.value;
        break;
      case 'addMult':
        mult += e.value;
        break;
      case 'letterBonus':
        for (const c of word) if (e.letters.includes(c)) letters += e.value;
        break;
      default:
        break;
    }
  }
  const base = letters * lengthBonus(word.length) + flat;
  const damage = Math.max(0, Math.floor(base * mult));
  return { word, letters, base, mult, damage };
}
