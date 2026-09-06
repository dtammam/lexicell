import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, pick, seedFromString, shuffle, weightedPick } from './rng';

function floats(seed: number, n: number): number[] {
  let rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let v: number;
    [v, rng] = nextFloat(rng);
    out.push(v);
  }
  return out;
}

describe('rng determinism', () => {
  it('same seed yields the same sequence', () => {
    expect(floats(42, 50)).toEqual(floats(42, 50));
  });

  it('different seeds yield different sequences', () => {
    expect(floats(1, 10)).not.toEqual(floats(2, 10));
  });

  it('matches the reference mulberry32 output for seed 0', () => {
    // Reference: mulberry32(0) first three outputs, computed independently.
    function mulberry32(a: number) {
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const ref = mulberry32(0);
    expect(floats(0, 3)).toEqual([ref(), ref(), ref()]);
  });

  it('state is {seed, counter}: resuming from a mid-run Rng reproduces the tail', () => {
    let rng = createRng(7);
    for (let i = 0; i < 10; i++) [, rng] = nextFloat(rng);
    expect(rng).toEqual({ seed: 7, counter: 10 });
    const fromMid = JSON.parse(JSON.stringify(rng)) as typeof rng;
    const [a] = nextFloat(rng);
    const [b] = nextFloat(fromMid);
    expect(a).toBe(b);
    expect(a).toBe(floats(7, 11)[10]);
  });

  it('does not mutate its input', () => {
    const rng = createRng(3);
    nextFloat(rng);
    nextInt(rng, 5);
    shuffle(rng, [1, 2, 3]);
    expect(rng).toEqual({ seed: 3, counter: 0 });
  });

  it('is plain JSON', () => {
    const rng = createRng(99);
    expect(JSON.parse(JSON.stringify(rng))).toEqual(rng);
  });
});

describe('distributions', () => {
  it('nextFloat stays in [0,1)', () => {
    for (const v of floats(123, 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt is roughly uniform over its range', () => {
    let rng = createRng(5);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60_000; i++) {
      let v: number;
      [v, rng] = nextInt(rng, 6);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThan(9_000);
      expect(c).toBeLessThan(11_000);
    }
  });

  it('nextInt rejects non-positive ranges', () => {
    expect(() => nextInt(createRng(1), 0)).toThrow(RangeError);
    expect(() => nextInt(createRng(1), 1.5)).toThrow(RangeError);
  });

  it('weightedPick respects weights and never picks zero-weight entries', () => {
    let rng = createRng(11);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 30_000; i++) {
      let v: keyof typeof counts;
      [v, rng] = weightedPick(rng, [
        { item: 'a', weight: 3 },
        { item: 'b', weight: 1 },
        { item: 'c', weight: 0 },
      ]);
      counts[v]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.7);
    expect(counts.a / counts.b).toBeLessThan(3.3);
  });

  it('weightedPick rejects an all-zero pool', () => {
    expect(() => weightedPick(createRng(1), [{ item: 'x', weight: 0 }])).toThrow(RangeError);
  });

  it('shuffle returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const [out] = shuffle(createRng(8), input);
    expect(out).not.toEqual(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('pick throws on empty and returns members otherwise', () => {
    expect(() => pick(createRng(1), [])).toThrow(RangeError);
    const [v] = pick(createRng(1), ['x', 'y']);
    expect(['x', 'y']).toContain(v);
  });
});

describe('seedFromString', () => {
  it('is stable and distinguishes nearby strings', () => {
    expect(seedFromString('2026-09-06')).toBe(seedFromString('2026-09-06'));
    expect(seedFromString('2026-09-06')).not.toBe(seedFromString('2026-09-07'));
    expect(seedFromString('')).toBe(0x811c9dc5);
  });
});
