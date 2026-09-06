import { describe, expect, it } from 'vitest';
import { LETTER_VALUE, lengthBonus, letterSum, scoreWord } from './scoring';

describe('scoring placeholder formula', () => {
  it('has a value for every letter', () => {
    for (let c = 97; c < 123; c++) expect(LETTER_VALUE[String.fromCharCode(c)]).toBeGreaterThan(0);
  });

  it('length bonus is flat through 4 and strictly increasing after', () => {
    expect(lengthBonus(3)).toBe(1);
    expect(lengthBonus(4)).toBe(1);
    for (let n = 5; n <= 15; n++) expect(lengthBonus(n)).toBeGreaterThan(lengthBonus(n - 1));
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
