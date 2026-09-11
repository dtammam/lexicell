import { describe, expect, it } from 'vitest';
import { loadDictionary } from '../../scripts/lib/load-dictionary';
import { createDictionary } from './dictionary';
import { createSolver, tilesForWord } from './solver';

const tiny = createDictionary(['cat', 'act', 'tact', 'dog', 'good', 'goo', 'coat', 'taco', 'ace'].join('\n'));

describe('solver on a hand-built dictionary', () => {
  const s = createSolver(tiny);

  it('finds exactly the words whose letter multiset fits', () => {
    expect(s.solve(['c', 'a', 't', 'o'])).toEqual(['act', 'cat', 'coat', 'taco']);
  });

  it('respects letter multiplicity', () => {
    expect(s.solve(['t', 'a', 'c'])).toEqual(['act', 'cat']); // tact needs two t's
    expect(s.solve(['t', 'a', 'c', 't'])).toEqual(['act', 'cat', 'tact']);
    expect(s.solve(['g', 'o', 'd'])).toEqual(['dog']); // goo/good need two o's
    expect(s.solve(['g', 'o', 'o', 'd'])).toEqual(['dog', 'goo', 'good']);
  });

  it('returns nothing for a grid with no words', () => {
    expect(s.solve(['x', 'q', 'z'])).toEqual([]);
    expect(s.solve([])).toEqual([]);
  });

  it('solveWithWild treats the wilds as any letter and is a superset of solve (v11)', () => {
    // wilds 0 is exactly solve.
    expect(s.solveWithWild(['c', 'a', 't', 'o'], 0)).toEqual(s.solve(['c', 'a', 't', 'o']));
    // 'ca' + one wild forms 'act'/'cat' (wild = t) and 'ace' (wild = e); a bare 'ca' forms nothing.
    expect(s.solve(['c', 'a'])).toEqual([]);
    expect(s.solveWithWild(['c', 'a'], 1)).toEqual(['ace', 'act', 'cat']);
    // The wild covers a doubled letter: 'god' + wild = 'good'/'goo' (the missing second o), plus 'dog'.
    expect(s.solve(['g', 'o', 'd'])).toEqual(['dog']);
    expect(s.solveWithWild(['g', 'o', 'd'], 1)).toEqual(['dog', 'goo', 'good']);
    // Superset property on a random-ish letter set: every plain word is still present with a wild.
    const letters = ['c', 'a', 't'];
    const plain = new Set(s.solve(letters));
    const wild = new Set(s.solveWithWild(letters, 1));
    for (const w of plain) expect(wild.has(w)).toBe(true);
  });

  it('canForm agrees with solve and rejects non-dictionary words', () => {
    expect(s.canForm('taco', ['c', 'a', 't', 'o'])).toBe(true);
    expect(s.canForm('tact', ['c', 'a', 't', 'o'])).toBe(false);
    expect(s.canForm('cato', ['c', 'a', 't', 'o'])).toBe(false);
  });

  it('rejects malformed letters loudly', () => {
    expect(() => s.solve(['ab'])).toThrow(RangeError);
    expect(() => s.solve(['A'])).toThrow(RangeError);
  });
});

describe('tilesForWord', () => {
  const letters = ['c', 'a', 't', 'a', 'c', 't', 'x', 'y'];
  const all = letters.map((_, i) => i);

  it('uses each tile once and only from the available set', () => {
    const idx = tilesForWord('tact', letters, all) ?? [];
    expect(idx).toHaveLength(4);
    expect(new Set(idx).size).toBe(4);
    expect(idx.map((i) => letters[i]).join('')).toBe('tact');
  });

  it('fails when a needed tile is unavailable', () => {
    expect(tilesForWord('tact', letters, [0, 1, 2, 3, 4])).toBeNull(); // only one t available
    expect(tilesForWord('cat', letters, [0, 1, 2])).toEqual([0, 1, 2]);
  });
});

describe('solver on the shipped dictionary', () => {
  const dict = loadDictionary();
  const s = createSolver(dict);

  it('finds known words in a real 16-tile grid', () => {
    const grid = 'lexicellsabtorwn'.split('');
    const found = s.solve(grid);
    for (const w of ['cell', 'lexical', 'excel', 'brawl', 'rice', 'lace']) {
      expect(found, w).toContain(w);
    }
    expect(found).not.toContain('lexicell');
    for (const w of found) expect(s.canForm(w, grid), w).toBe(true);
  });

  it('a vowel-less grid still has words (ENABLE has "nth", "tsk", "brr")', () => {
    const found = s.solve('bcdfghjklmnprstv'.split(''));
    expect(found.length).toBeGreaterThan(0);
    expect(found).toContain('nth');
  });

  it('solves a 16-tile grid in under 20 ms on average', () => {
    // Twenty random-ish grids; warm up first so JIT does not skew the measurement.
    const grids = Array.from({ length: 20 }, (_, g) =>
      Array.from({ length: 16 }, (_, i) => String.fromCharCode(97 + ((g * 7 + i * 5 + (i * i) % 11) % 26))),
    );
    s.solve(grids[0] as string[]);
    const t0 = performance.now();
    let total = 0;
    for (const grid of grids) total += s.solve(grid).length;
    const perGrid = (performance.now() - t0) / grids.length;
    expect(total).toBeGreaterThan(0);
    expect(perGrid).toBeLessThan(20);
  });
});
