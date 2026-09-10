import { describe, expect, it } from 'vitest';
import { candidateIndices, candidateWords } from '../src/engine/candidates';
import { newRun } from '../src/engine/reducer';
import { chooseCursed, chooseTrait, curseCost, GREEDY_MAX_LENGTH, makeBot, nextAction, spendingVenom } from './lib/bots';
import { nodeContext } from './lib/context';
import { simulate, simulateRun, summarise } from './lib/simulate';
import { contentFor, exitCriteria, parseArgs, renderTable, stripCurses } from './sim';

import type { ItemDef } from '../src/engine/types';
import { CONTENT } from '../src/content/index';

/** No starting kit here so newRun lands in the first fight and candidates exist at once. */
const ctx = nodeContext({ ...CONTENT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });

describe('bots', () => {
  it('the greedy cap is 7 (Dean, 2026-09-06: greedy models a strong human, not a solver)', () => {
    // Pinned on purpose: the exit criterion "greedy < 90%" is judged on THIS bot. A different cap is a different ruling.
    expect(GREEDY_MAX_LENGTH).toBe(7);
  });

  it('solver plays the max-damage word; greedy the max within the cap; mediocre 4-5 letters when it can', () => {
    const s = newRun(1, ctx);
    const cands = candidateWords(s, ctx);
    const top = Math.max(...cands.map((c) => c.damage));
    const topCapped = Math.max(...cands.filter((c) => c.word.length <= GREEDY_MAX_LENGTH).map((c) => c.damage));
    expect(topCapped).toBeLessThan(top); // seed 1's grid has a long word, so the cap binds
    expect(makeBot('solver', 1).chooseWord(s, cands)?.damage).toBe(top);
    const g = makeBot('greedy', 1).chooseWord(s, cands);
    expect(g?.damage).toBe(topCapped);
    expect(g?.word.length).toBeLessThanOrEqual(GREEDY_MAX_LENGTH);
    const m = makeBot('mediocre', 1).chooseWord(s, cands);
    expect(m?.word.length).toBeGreaterThanOrEqual(4);
    expect(m?.word.length).toBeLessThanOrEqual(5);
    expect(nextAction(makeBot('greedy', 1), s, ctx)?.at(-1)).toEqual({ type: 'submitWord' });
  });

  it('chooseTrait takes the highest-scoring hooks and keeps the first on a tie (gate W5, PR #64)', () => {
    const ctx = nodeContext();
    const at = (offer: string[]) => ({ ...newRun(1, ctx), phase: 'evolve' as const, encounter: null, offer });
    expect(chooseTrait(at(['thick-membrane', 'predatory', 'venom-glands']), ctx)).toBe(0); // 2 / 2 / 2
    expect(chooseTrait(at(['adrenal', 'vowel-sense']), ctx)).toBe(1); // 1 / 4
    expect(chooseTrait(at(['vowel-sense', 'adrenal']), ctx)).toBe(0);
    expect(chooseTrait({ ...at([]), offer: null }, ctx)).toBe(0);
  });

  it('greedy falls back to the best available when nothing fits the cap', () => {
    const s = newRun(1, ctx);
    const longOnly = candidateWords(s, ctx).filter((c) => c.word.length > GREEDY_MAX_LENGTH);
    expect(longOnly.length).toBeGreaterThan(0);
    expect(makeBot('greedy', 1).chooseWord(s, longOnly)?.damage).toBe(Math.max(...longOnly.map((c) => c.damage)));
  });

  it('spendingVenom narrows to words through a venomed tile when one exists, and is a no-op otherwise', () => {
    const s = newRun(2, ctx);
    const enc = s.encounter;
    if (!enc) throw new Error('no encounter');
    const cands = candidateWords(s, ctx);
    expect(spendingVenom(s, cands)).toBe(cands);
    const grid = enc.grid.map((t, i) => (i === 4 ? { ...t, venom: 2 } : t));
    const venomed = { ...s, encounter: { ...enc, grid } };
    const pool = spendingVenom(venomed, cands);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.length).toBeLessThan(cands.length);
    for (const c of pool) expect(candidateIndices(venomed, c.word) ?? []).toContain(4);
  });

  it('a run is reproducible from its seed', () => {
    expect(simulateRun('mediocre', 17, ctx)).toEqual(simulateRun('mediocre', 17, ctx));
  });

  it('curseCost reads effect signs; the bots decide with it (variety wave step 6)', () => {
    const cost = (id: string) => curseCost(CONTENT.items.find((i) => i.id === id) as ItemDef);
    // Every shipped curse reads as a cost.
    for (const c of CONTENT.items.filter((i) => i.curse)) expect(curseCost(c), c.id).toBeGreaterThan(0);
    // A boon reads as no cost (no negative or self-harm effect).
    expect(cost('lens')).toBe(0); // Photoreceptor: +70% damage
    // A cursed offer: a strong boon paired with a mild curse, and weak boons paired with harsh curses.
    const at = (offer: string[], curses: string[]) => ({ ...newRun(1, ctx), phase: 'pick' as const, encounter: null, offer, curses });
    // Greedy and solver take a strong boon (curse and all); mediocre grabs the organelle down to a negative margin.
    const strongMild = at(['protocell', 'lens'], ['curse-dull', 'curse-weak']);
    expect(chooseCursed('greedy', strongMild, ctx)).not.toBeNull();
    expect(chooseCursed('solver', strongMild, ctx)).not.toBeNull();
    expect(chooseCursed('mediocre', strongMild, ctx)).not.toBeNull();
    // Weak commons with harsh curses: greedy leaves it (no boon clears the bar); mediocre still grabs
    // the least-bad organelle (a cursed offer replaces a normal one, so leaving forfeits the boon).
    const weakHarsh = at(['spores', 'bandage'], ['curse-bleed', 'curse-shackle']);
    expect(chooseCursed('greedy', weakHarsh, ctx)).toBeNull();
    expect(chooseCursed('mediocre', weakHarsh, ctx)).not.toBeNull();
    // A single dreadful pair (a weak boon under the harshest curse) is one even mediocre leaves.
    const dreadful = at(['spores'], ['curse-bleed']);
    expect(chooseCursed('mediocre', dreadful, ctx)).toBeNull();
    // nextAction turns a leave into a skipOffer and a take into a pickItem.
    expect(nextAction(makeBot('greedy', 1), weakHarsh, ctx)).toEqual([{ type: 'skipOffer' }]);
    expect(nextAction(makeBot('greedy', 1), strongMild, ctx)?.[0]?.type).toBe('pickItem');
  });
});

describe('summary', () => {
  it('computes win rate, median, and per-encounter HP means over runs that reached each encounter', () => {
    const s = summarise('greedy', [
      { seed: 0, won: true, encounterReached: 9, hpAtEncounterStart: [100, 80, 60, 50, 40, 30, 20, 10, 5], turns: 30, scrambles: 0, shuffles: 0, cursedOffersSeen: 0, cursedTaken: 0, finalHp: 5, items: [] },
      { seed: 1, won: false, encounterReached: 2, hpAtEncounterStart: [100, 20], turns: 8, scrambles: 1, shuffles: 0, cursedOffersSeen: 0, cursedTaken: 0, finalHp: 0, items: [] },
      { seed: 2, won: false, encounterReached: 4, hpAtEncounterStart: [100, 60, 40, 10], turns: 12, scrambles: 0, shuffles: 2, cursedOffersSeen: 0, cursedTaken: 0, finalHp: 0, items: [] },
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
  it('parses --cell and rejects an unknown cell (gate S4)', () => {
    expect(parseArgs(['--cell', 'aggro']).cell).toBe('aggro');
    expect(parseArgs([]).cell).toBe('balanced');
    expect(() => parseArgs(['--cell', 'nope'])).toThrow(/--cell needs one of/);
  });

  it('parses options and validates item ids', () => {
    expect(parseArgs([])).toMatchObject({ runs: 500, bots: ['greedy', 'mediocre', 'solver'], items: 'all' });
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
    expect(parseArgs(['--variant', 'pre-act1']).variant).toBe('pre-act1');
    expect(() => parseArgs(['--variant', 'easy'])).toThrow(/unknown variant/);
    // --no-curses (variety wave step 6): off by default, strips the curse pool when set.
    expect(parseArgs([]).noCurses).toBe(false);
    expect(parseArgs(['--no-curses']).noCurses).toBe(true);
    expect(stripCurses(contentFor('all')).items.some((i) => i.curse)).toBe(false);
    expect(contentFor('all').items.some((i) => i.curse)).toBe(true);
  });

  it('shipped content is act-1-eased with a starting kit; pre-act1 restores the baseline', () => {
    const now = contentFor('all');
    expect(now.tuning.startingPicks).toBe(1);
    expect(now.encounters[0]).toMatchObject({ hpScale: 0.7, damageScale: 0.5 });
    expect(now.encounters[1]?.damageScale).toBeCloseTo(0.84);
    expect(now.encounters[2]).toMatchObject({ hpScale: 0.7, damageScale: 0.84 });
    const before = contentFor('all', 'pre-act1');
    expect(before.tuning.startingPicks).toBe(0);
    expect(before.encounters[0]).toMatchObject({ hpScale: 1, damageScale: 1 });
    expect(before.encounters[1]).toMatchObject({ hpScale: 1.3, damageScale: 1.2 });
    expect(before.encounters[2]).toMatchObject({ hpScale: 1, damageScale: 1.2 });
    expect(before.encounters[3]).toEqual(now.encounters[3]);
  });
});
