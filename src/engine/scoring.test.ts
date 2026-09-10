import { describe, expect, it } from 'vitest';
import { LETTER_VALUE, lengthBonus, letterSum, scoreWord as score } from './scoring';
import type { Effect } from './effects';
import type { Tuning } from './types';

/** Fixed table for these tests so content tuning can move without breaking formula tests. */
const T: Tuning = { lengthBonus: [1, 1, 1, 1, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5], startingPicks: 0, venomMax: 4, poisonMax: 12, shieldMax: 30, perUnitMultCap: 1.5, enrageAfter: 20, enragePerTurn: 1, restHeal: 0.3, eliteHpScale: 1.3, eliteDamageScale: 1.15, endlessHpGrowth: 1.06, endlessDamageGrowth: 1.08 };
const scoreWord = (w: string, e: readonly Effect[]) => score(w, e, T);

describe('scoring placeholder formula', () => {
  it('has a value for every letter', () => {
    for (let c = 97; c < 123; c++) expect(LETTER_VALUE[String.fromCharCode(c)]).toBeGreaterThan(0);
  });

  it('length bonus reads the table and clamps past its end', () => {
    expect(lengthBonus(3, T)).toBe(1);
    expect(lengthBonus(5, T)).toBe(1.5);
    expect(lengthBonus(40, T)).toBe(6.5);
    expect(() => lengthBonus(3, { lengthBonus: [], startingPicks: 0, venomMax: 4, poisonMax: 12, shieldMax: 30, perUnitMultCap: 1.5, enrageAfter: 20, enragePerTurn: 1, restHeal: 0.3, eliteHpScale: 1.3, eliteDamageScale: 1.15, endlessHpGrowth: 1.06, endlessDamageGrowth: 1.08 })).toThrow(RangeError);
  });

  it('bare word: letters * lengthBonus', () => {
    expect(letterSum('cat')).toBe(5);
    expect(scoreWord('cat', [])).toEqual({ word: 'cat', letters: 5, base: 5, mult: 1, damage: 5 });
    expect(scoreWord('quartz', []).damage).toBe(Math.floor((8 + 1 + 1 + 1 + 1 + 8) * 2));
  });

  it('flat adds after the length bonus; mult applies last; floor at the end', () => {
    const s = scoreWord('cats', [
      { type: 'addFlat', value: 5 },
      { type: 'addMult', value: 0.5 },
      { type: 'addMult', value: 0.25 },
    ]);
    expect(s.base).toBe(6 + 5);
    expect(s.mult).toBe(1.75);
    expect(s.damage).toBe(Math.floor(11 * 1.75));
  });

  it('letterBonus counts each matching letter and is scaled by length', () => {
    const s = scoreWord('jazz', [{ type: 'letterBonus', letters: 'jz', value: 10 }]);
    expect(s.letters).toBe(6 + 1 + 8 + 8 + 30);
    expect(s.damage).toBe(53);
  });

  it('ignores non-scoring effects and rejects unknown letters', () => {
    expect(scoreWord('cat', [{ type: 'heal', value: 50 }]).damage).toBe(5);
    expect(() => scoreWord('ca1', [])).toThrow(RangeError);
  });

  it('never returns negative damage', () => {
    expect(scoreWord('cat', [{ type: 'addFlat', value: -100 }]).damage).toBe(0);
  });
});
