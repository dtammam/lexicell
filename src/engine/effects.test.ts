import { describe, expect, it } from 'vitest';
import { EFFECT_ORDER, evaluateCondition, resolveEffects, unitCount, type Effect } from './effects';

const ctx = { word: 'quartz', hp: 20, maxHp: 100, turn: 6 };

describe('evaluateCondition', () => {
  it('length and letter conditions need a word', () => {
    expect(evaluateCondition({ kind: 'minLength', value: 6 }, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'minLength', value: 7 }, ctx)).toBe(false);
    expect(evaluateCondition({ kind: 'maxLength', value: 6 }, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'containsLetter', letters: 'xq' }, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'containsLetter', letters: 'xy' }, ctx)).toBe(false);
    const noWord = { hp: 20, maxHp: 100, turn: 1 };
    expect(evaluateCondition({ kind: 'minLength', value: 1 }, noWord)).toBe(false);
    expect(evaluateCondition({ kind: 'containsLetter', letters: 'a' }, noWord)).toBe(false);
  });

  it('hpBelow is strict and fractional', () => {
    expect(evaluateCondition({ kind: 'hpBelow', fraction: 0.25 }, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'hpBelow', fraction: 0.2 }, ctx)).toBe(false);
  });

  it('turnEvery fires on multiples only', () => {
    expect(evaluateCondition({ kind: 'turnEvery', value: 3 }, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'turnEvery', value: 4 }, ctx)).toBe(false);
    expect(evaluateCondition({ kind: 'turnEvery', value: 0 }, ctx)).toBe(false);
  });
});

describe('resolveEffects', () => {
  it('splices passing conditions and drops failing ones, recursively', () => {
    const effects: Effect[] = [
      { type: 'heal', value: 1 },
      {
        type: 'condition',
        when: { kind: 'minLength', value: 5 },
        then: [
          { type: 'addMult', value: 1 },
          { type: 'condition', when: { kind: 'hpBelow', fraction: 0.5 }, then: [{ type: 'addFlat', value: 9 }] },
          { type: 'condition', when: { kind: 'hpBelow', fraction: 0.1 }, then: [{ type: 'addFlat', value: 99 }] },
        ],
      },
    ];
    expect(resolveEffects(effects, ctx)).toEqual([
      { type: 'addFlat', value: 9 },
      { type: 'addMult', value: 1 },
      { type: 'heal', value: 1 },
    ]);
  });

  it('orders by EFFECT_ORDER regardless of input order, stable within a type', () => {
    const out = resolveEffects(
      [
        { type: 'scramble' },
        { type: 'heal', value: 2 },
        { type: 'addMult', value: 0.5 },
        { type: 'heal', value: 1 },
        { type: 'addFlat', value: 3 },
      ],
      ctx,
    );
    expect(out.map((e) => e.type)).toEqual(['addFlat', 'addMult', 'heal', 'heal', 'scramble']);
    expect(out[2]).toEqual({ type: 'heal', value: 2 });
  });

  it('EFFECT_ORDER covers every effect type exactly once', () => {
    expect(new Set(EFFECT_ORDER).size).toBe(EFFECT_ORDER.length);
    const sample: Effect[] = [
      { type: 'addFlat', value: 0 },
      { type: 'addMult', value: 0 },
      { type: 'letterBonus', letters: 'a', value: 0 },
      { type: 'heal', value: 0 },
      { type: 'damageEnemy', value: 0 },
      { type: 'damagePlayer', value: 0 },
      { type: 'reduceDamage', value: 0 },
      { type: 'vowelWeight', value: 1 },
      { type: 'venomTiles', count: 0, value: 0 },
      { type: 'lockTiles', count: 0, turns: 0 },
      { type: 'scramble' },
      { type: 'condition', when: { kind: 'minLength', value: 0 }, then: [] },
    ];
    for (const e of sample) expect(EFFECT_ORDER, e.type).toContain(e.type);
  });
});

describe('effects wave: new conditions and perUnit', () => {
  const ctx = { hp: 60, maxHp: 100, turn: 1, items: 3, enemyHp: 20, enemyMaxHp: 100, venomedTiles: 2, lockedTiles: 1 };

  it('word-shape conditions read the word and are false without one', () => {
    const w = { ...ctx, word: 'splinter' };
    expect(evaluateCondition({ kind: 'startsWith', letters: 'st' }, w)).toBe(true);
    expect(evaluateCondition({ kind: 'startsWith', letters: 'p' }, w)).toBe(false);
    expect(evaluateCondition({ kind: 'endsWith', letters: 'r' }, w)).toBe(true);
    expect(evaluateCondition({ kind: 'uniqueLetters' }, w)).toBe(true);
    expect(evaluateCondition({ kind: 'repeatLetter' }, w)).toBe(false);
    expect(evaluateCondition({ kind: 'repeatLetter' }, { ...ctx, word: 'letter' })).toBe(true);
    expect(evaluateCondition({ kind: 'uniqueLetters' }, { ...ctx, word: 'letter' })).toBe(false);
    expect(evaluateCondition({ kind: 'minVowels', value: 2 }, w)).toBe(true);
    expect(evaluateCondition({ kind: 'minVowels', value: 3 }, w)).toBe(false);
    for (const kind of ['startsWith', 'endsWith'] as const) expect(evaluateCondition({ kind, letters: 'abcdefghijklmnopqrstuvwxyz' }, ctx)).toBe(false);
    expect(evaluateCondition({ kind: 'uniqueLetters' }, ctx)).toBe(false);
    expect(evaluateCondition({ kind: 'repeatLetter' }, ctx)).toBe(false);
    expect(evaluateCondition({ kind: 'minVowels', value: 0 }, ctx)).toBe(false);
  });

  it('fight-state conditions: enemyHpBelow is strict and needs an enemy, firstTurn is turn 1 only', () => {
    expect(evaluateCondition({ kind: 'enemyHpBelow', fraction: 0.25 }, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'enemyHpBelow', fraction: 0.2 }, ctx)).toBe(false);
    expect(evaluateCondition({ kind: 'enemyHpBelow', fraction: 0.9 }, { hp: 1, maxHp: 1, turn: 1 })).toBe(false);
    expect(evaluateCondition({ kind: 'firstTurn' }, ctx)).toBe(true);
    expect(evaluateCondition({ kind: 'firstTurn' }, { ...ctx, turn: 2 })).toBe(false);
  });

  it('unitCount reads every unit; word units are zero without a word', () => {
    const w = { ...ctx, word: 'quartz' };
    expect(unitCount('item', w)).toBe(3);
    expect(unitCount('letter', w)).toBe(6);
    expect(unitCount('vowel', w)).toBe(2);
    expect(unitCount('consonant', w)).toBe(4);
    expect(unitCount('rareLetter', w)).toBe(2);
    expect(unitCount('turn', w)).toBe(1);
    expect(unitCount('missingTenth', w)).toBe(4);
    expect(unitCount('venomedTile', w)).toBe(2);
    expect(unitCount('lockedTile', w)).toBe(1);
    for (const u of ['letter', 'vowel', 'consonant', 'rareLetter'] as const) expect(unitCount(u, ctx)).toBe(0);
    expect(unitCount('item', { hp: 1, maxHp: 1, turn: 1 })).toBe(0);
  });

  it('perUnit scales its children by the count, caps addMult, and drops them at zero', () => {
    const per: Effect = {
      type: 'perUnit',
      unit: 'item',
      then: [
        { type: 'addFlat', value: 2 },
        { type: 'addMult', value: 0.6 },
        { type: 'heal', value: 1 },
        { type: 'scramble' },
      ],
    };
    const out = resolveEffects([per], { ...ctx, perUnitMultCap: 1.5 });
    expect(out).toEqual([
      { type: 'addFlat', value: 6 },
      { type: 'addMult', value: 1.5 },
      { type: 'heal', value: 3 },
    ]);
    expect(resolveEffects([per], { ...ctx, items: 0 })).toEqual([]);
    expect(resolveEffects([per], { ...ctx, items: 1 })[1]).toEqual({ type: 'addMult', value: 0.6 });
  });

  it('perUnit scales at count one too: the cap binds and unscalable children drop (gate W1)', () => {
    const one = { ...ctx, items: 1, perUnitMultCap: 1.5 };
    expect(resolveEffects([{ type: 'perUnit', unit: 'item', then: [{ type: 'addMult', value: 2 }] }], one)).toEqual([{ type: 'addMult', value: 1.5 }]);
    expect(resolveEffects([{ type: 'perUnit', unit: 'item', then: [{ type: 'scramble' }, { type: 'letterWeight', letters: 'e', value: 2 }] }], one)).toEqual([]);
    // Two scalers share one cap: 1.5 + 1.5 shrinks to 0.75 + 0.75.
    const two: Effect[] = [
      { type: 'perUnit', unit: 'item', then: [{ type: 'addMult', value: 0.5 }] },
      { type: 'perUnit', unit: 'item', then: [{ type: 'addMult', value: 0.5 }] },
    ];
    const out = resolveEffects(two, { ...ctx, items: 3, perUnitMultCap: 1.5 });
    expect(out.map((e) => (e as { value: number }).value)).toEqual([0.75, 0.75]);
    // A plain addMult outside any perUnit is never capped.
    expect(resolveEffects([{ type: 'addMult', value: 9 }], one)).toEqual([{ type: 'addMult', value: 9 }]);
    // A condition nested inside a perUnit stays inside it (gate N07): its children still scale.
    expect(resolveEffects([{ type: 'perUnit', unit: 'item', then: [{ type: 'condition', when: { kind: 'minLength', value: 3 }, then: [{ type: 'addFlat', value: 1 }] }] }], { ...ctx, items: 3, word: 'abc' })).toEqual([{ type: 'addFlat', value: 3 }]);
    // The cap comes from the context (gate S8), not the default.
    expect(resolveEffects([{ type: 'perUnit', unit: 'item', then: [{ type: 'addMult', value: 2 }] }], { ...one, perUnitMultCap: 0.4 })).toEqual([{ type: 'addMult', value: 0.4 }]);
  });

  it('perUnit scales lifesteal fractions and redraw counts (gate S2)', () => {
    const out = resolveEffects([{ type: 'perUnit', unit: 'vowel', then: [{ type: 'lifesteal', fraction: 0.1 }, { type: 'redrawTiles', count: 1 }] }], { ...ctx, word: 'audio' });
    expect(out).toEqual([{ type: 'lifesteal', fraction: 0.4 }, { type: 'redrawTiles', count: 4 }]);
  });

  it('turnEvery never fires at turn 0, which is what onPick sees (gate S6)', () => {
    expect(evaluateCondition({ kind: 'turnEvery', value: 1 }, { ...ctx, turn: 0 })).toBe(false);
    expect(evaluateCondition({ kind: 'turnEvery', value: 2 }, { ...ctx, turn: 0 })).toBe(false);
    expect(evaluateCondition({ kind: 'turnEvery', value: 2 }, { ...ctx, turn: 2 })).toBe(true);
  });

  it('perUnit nests with conditions and with itself', () => {
    const nested: Effect = {
      type: 'condition',
      when: { kind: 'minLength', value: 5 },
      then: [{ type: 'perUnit', unit: 'vowel', then: [{ type: 'perUnit', unit: 'item', then: [{ type: 'addFlat', value: 1 }] }] }],
    };
    expect(resolveEffects([nested], { ...ctx, word: 'audio' })).toEqual([{ type: 'addFlat', value: 12 }]);
    expect(resolveEffects([nested], { ...ctx, word: 'ax' })).toEqual([]);
  });

  it('EFFECT_ORDER covers the effects wave types too', () => {
    const wave: Effect[] = [
      { type: 'poisonEnemy', value: 1 },
      { type: 'stun', value: 1 },
      { type: 'shield', value: 1 },
      { type: 'lifesteal', fraction: 0.5 },
      { type: 'freeShuffle', value: 1 },
      { type: 'redrawTiles', count: 1 },
      { type: 'letterWeight', letters: 'e', value: 2 },
      { type: 'maxHp', value: 1 },
      { type: 'perUnit', unit: 'item', then: [] },
    ];
    for (const e of wave) expect(EFFECT_ORDER, e.type).toContain(e.type);
    expect(EFFECT_ORDER).toHaveLength(23);
  });
});
