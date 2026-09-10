import { describe, expect, it } from 'vitest';
import { parseSeed, resultText, SHARE_URL } from './share';

describe('parseSeed', () => {
  it('reads a run of digits and clamps to uint32', () => {
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed('123456')).toBe(123456);
    expect(parseSeed('  42  ')).toBe(42);
    // 2^32 wraps to 0; 2^32 + 5 to 5. Real seeds are already uint32, so they round-trip unchanged.
    expect(parseSeed('4294967296')).toBe(0);
    expect(parseSeed('4294967301')).toBe(5);
    expect(parseSeed('4294967295')).toBe(4294967295);
  });

  it('treats blank or non-numeric as "roll a random seed" (null)', () => {
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('   ')).toBeNull();
    expect(parseSeed('-1')).toBeNull();
    expect(parseSeed('1.5')).toBeNull();
    expect(parseSeed('abc')).toBeNull();
    expect(parseSeed('12x')).toBeNull();
    expect(parseSeed('0x10')).toBeNull();
  });

  it('round-trips a copied seed unchanged', () => {
    for (const seed of [0, 1, 999, 20260918, 4294967295]) {
      expect(parseSeed(String(seed))).toBe(seed);
    }
  });
});

describe('resultText', () => {
  it('names outcome, cell, reach, best word, seed and the play link', () => {
    const line = resultText({ won: true, mode: 'normal', cellName: 'Amoeba', reached: 9, bestWord: 'crane', bestWordDamage: 42, seed: 123456 });
    expect(line).toContain('won as Amoeba');
    expect(line).toContain('reached 9 of 9');
    expect(line).toContain('CRANE for 42');
    expect(line).toContain('Seed 123456');
    expect(line).toContain(SHARE_URL);
    expect(line).not.toMatch(/—/);
  });

  it('endless reads the encounter reached without a total, and a loss says so', () => {
    const line = resultText({ won: false, mode: 'endless', cellName: 'Gambler', reached: 14, bestWord: '', bestWordDamage: 0, seed: 7 });
    expect(line).toContain('the deep took me');
    expect(line).toContain('reached encounter 14');
    expect(line).not.toContain('of 9');
    expect(line).not.toContain('Best word');
  });

  it('a normal loss says died', () => {
    expect(resultText({ won: false, mode: 'normal', cellName: 'Amoeba', reached: 3, bestWord: 'ox', bestWordDamage: 4, seed: 1 })).toContain('died as Amoeba');
  });
});
