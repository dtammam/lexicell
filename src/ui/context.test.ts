import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildContext } from './context';
import { SUPPLEMENT_PATH, WORDS_PATH } from '../../scripts/lib/load-dictionary';
import { freshGrid } from '../engine/grid';
import { createRng } from '../engine/rng';

const baseText = readFileSync(WORDS_PATH, 'utf8');
const suppText = readFileSync(SUPPLEMENT_PATH, 'utf8');

describe('buildContext (two-tier dictionary)', () => {
  it('validates against the full union but keeps the solver on the baseline only', () => {
    const ctx = buildContext('cat\ndog', 'catt\nzzzz');
    // A supplement word is a valid PLAY...
    expect(ctx.dictionary.has('catt')).toBe(true);
    expect(ctx.dictionary.has('cat')).toBe(true);
    // ...but the solver (canForm returns false for a word it does not know) never sees it.
    expect(ctx.solver.canForm('catt', ['c', 'a', 't', 't'])).toBe(false);
    expect(ctx.solver.canForm('cat', ['c', 'a', 't'])).toBe(true);
  });

  it('accepts brewmaster as a play, but never lets the solver surface it', () => {
    const ctx = buildContext(baseText, suppText);
    expect(ctx.dictionary.has('brewmaster')).toBe(true);
    expect(ctx.solver.canForm('brewmaster', Array.from('brewmaster'))).toBe(false);
  });

  it('the supplement cannot change grid generation: identical grids with and without it', () => {
    // This is the replay guarantee. freshGrid rerolls off the solver; if the supplement reached the
    // solver, the RNG draws would diverge and daily/shared seeds would replay differently.
    const withSupp = buildContext(baseText, suppText);
    const without = buildContext(baseText, '');
    for (let seed = 0; seed < 60; seed++) {
      expect(freshGrid(createRng(seed), withSupp.solver), `seed ${seed}`).toEqual(freshGrid(createRng(seed), without.solver));
    }
  });
});
