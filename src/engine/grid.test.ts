import { describe, expect, it } from 'vitest';
import { loadDictionary } from '../../scripts/lib/load-dictionary';
import { VOWEL_FLOOR, drawLetter, enforceVowelFloor, freshGrid, isDead, isVowel, plainTile, playableIndices, playableLetters, refill } from './grid';
import { createRng } from './rng';
import { createSolver } from './solver';

const solver = createSolver(loadDictionary());

describe('drawLetter', () => {
  it('vowelWeight shifts the vowel rate', () => {
    const rate = (vw: number) => {
      let rng = createRng(1);
      let vowels = 0;
      for (let i = 0; i < 5000; i++) {
        let l: string;
        [l, rng] = drawLetter(rng, vw);
        if (isVowel(l)) vowels++;
      }
      return vowels / 5000;
    };
    const base = rate(1);
    expect(base).toBeGreaterThan(0.35);
    expect(base).toBeLessThan(0.5);
    expect(rate(2)).toBeGreaterThan(base + 0.1);
    expect(rate(0.5)).toBeLessThan(base - 0.1);
  });
});

describe('enforceVowelFloor', () => {
  it('raises an all-consonant grid to the floor without touching locked tiles', () => {
    const grid = 'bcdfghjklmnpqrst'.split('').map(plainTile);
    const locked = grid.map((t, i) => (i < 2 ? { ...t, lockedTurns: 2 } : t));
    const [out] = enforceVowelFloor(createRng(3), locked);
    expect(out.filter((t) => isVowel(t.letter)).length).toBe(VOWEL_FLOOR);
    expect(out[0]).toEqual({ letter: 'b', lockedTurns: 2 });
    expect(out[1]).toEqual({ letter: 'c', lockedTurns: 2 });
  });

  it('leaves a grid that already meets the floor unchanged', () => {
    const grid = 'aeiobcdfghjklmnp'.split('').map(plainTile);
    const [out, rng] = enforceVowelFloor(createRng(3), grid);
    expect(out).toEqual(grid);
    expect(rng.counter).toBe(0);
  });
});

describe('refill', () => {
  it('replaces only the given indices and keeps the floor', () => {
    const grid = 'aeiobcdfghjklmnp'.split('').map(plainTile);
    const [out] = refill(createRng(9), grid, [4, 5, 6]);
    expect(out.length).toBe(16);
    for (const i of [0, 1, 2, 3, 7, 8, 15]) expect(out[i]).toEqual(grid[i]);
    expect(out.filter((t) => isVowel(t.letter)).length).toBeGreaterThanOrEqual(VOWEL_FLOOR);
  });
});

describe('freshGrid', () => {
  it('always yields a 4+ letter word across many seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const [grid] = freshGrid(createRng(seed), solver);
      expect(grid).toHaveLength(16);
      const words = solver.solve(playableLetters(grid));
      expect(Math.max(...words.map((w) => w.length)), `seed ${seed}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('is deterministic', () => {
    expect(freshGrid(createRng(77), solver)).toEqual(freshGrid(createRng(77), solver));
  });
});

describe('playable + isDead', () => {
  it('locked tiles are invisible to the solver', () => {
    const grid = 'catxxxxxxxxxxxxx'.split('').map(plainTile);
    expect(isDead(grid, solver)).toBe(false);
    const locked = grid.map((t, i) => (i < 3 ? { ...t, lockedTurns: 1 } : t));
    expect(playableIndices(locked)).toHaveLength(13);
    expect(isDead(locked, solver)).toBe(true);
  });
});
