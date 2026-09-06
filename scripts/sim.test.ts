import { describe, expect, it } from 'vitest';
import { candidateWords } from '../src/engine/candidates';
import { newRun } from '../src/engine/reducer';
import { makeBot, nextAction } from './lib/bots';
import { nodeContext } from './lib/context';
import { simulate, simulateRun, summarise } from './lib/simulate';
import { contentFor, exitCriteria, parseArgs, renderTable } from './sim';

const ctx = nodeContext();

describe('bots', () => {
  it('greedy plays the max-damage word; mediocre plays 4-5 letters when it can', () => {
    const s = newRun(1, ctx);
    const cands = candidateWords(s, ctx);
    const g = makeBot('greedy', 1).chooseWord(s, cands);
    expect(g?.damage).toBe(Math.max(...cands.map((c) => c.damage)));
    const m = makeBot('mediocre', 1).chooseWord(s, cands);
    expect(m?.word.length).toBeGreaterThanOrEqual(4);
    expect(m?.word.length).toBeLessThanOrEqual(5);
    expect(nextAction(makeBot('greedy', 1), s, ctx)?.at(-1)).toEqual({ type: 'submitWord' });
  });

  it('a run is reproducible from its seed', () => {
    expect(simulateRun('mediocre', 17, ctx)).toEqual(simulateRun('mediocre', 17, ctx));
  });
});

describe('summary', () => {
  it('computes win rate, median, and per-encounter HP means over runs that reached each encounter', () => {
    const s = summarise('greedy', [
      { seed: 0, won: true, encounterReached: 9, hpAtEncounterStart: [100, 80, 60, 50, 40, 30, 20, 10, 5], turns: 30, scrambles: 0, finalHp: 5, items: [] },
      { seed: 1, won: false, encounterReached: 2, hpAtEncounterStart: [100, 20], turns: 8, scrambles: 1, finalHp: 0, items: [] },
      { seed: 2, won: false, encounterReached: 4, hpAtEncounterStart: [100, 60, 40, 10], turns: 12, scrambles: 0, finalHp: 0, items: [] },
    ]);
    expect(s.winRate).toBeCloseTo(1 / 3);
    expect(s.medianEncounter).toBe(4);
    expect(s.meanHpPerEncounter[0]).toBe(100);
    expect(s.meanHpPerEncounter[1]).toBeCloseTo((80 + 20 + 60) / 3);
    expect(s.meanHpPerEncounter[8]).toBe(5);
    expect(s.reachedPerEncounter).toEqual([3, 3, 2, 2, 1, 1, 1, 1, 1]);
    expect(s.totalScrambles).toBe(1);
  });

  it('a small simulation runs end to end and renders', () => {
    const summaries = [simulate('greedy', ctx, 5), simulate('mediocre', ctx, 5)];
    const table = renderTable(summaries);
    expect(table).toContain('greedy');
    expect(table).toContain('mediocre');
    expect(table.split('\n')).toHaveLength(4);
    const c = exitCriteria(summaries);
    expect(c.noDeadGrids).toBe(true);
    expect(typeof c.mediocreInBand).toBe('boolean');
  });
});

describe('cli', () => {
  it('parses options and validates item ids', () => {
    expect(parseArgs([])).toMatchObject({ runs: 500, bots: ['greedy', 'mediocre'], items: 'all' });
    expect(parseArgs(['--bot', 'greedy', '--runs', '7', '--items', 'lens,leech', '--seed', '9'])).toMatchObject({
      runs: 7,
      bots: ['greedy'],
      items: ['lens', 'leech'],
      seedBase: 9,
    });
    expect(() => parseArgs(['--bot', 'lucky'])).toThrow(/unknown bot/);
    expect(() => parseArgs(['--runs', '0'])).toThrow();
    expect(contentFor('none').items).toEqual([]);
    expect(contentFor(['lens']).items.map((i) => i.id)).toEqual(['lens']);
    expect(() => contentFor(['nope'])).toThrow(/unknown item ids/);
  });
});
