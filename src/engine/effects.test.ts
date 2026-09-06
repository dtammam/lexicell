import { describe, expect, it } from 'vitest';
import { EFFECT_ORDER, evaluateCondition, resolveEffects, type Effect } from './effects';

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
      { type: 'lockTiles', count: 0, turns: 0 },
      { type: 'scramble' },
      { type: 'condition', when: { kind: 'minLength', value: 0 }, then: [] },
    ];
    for (const e of sample) expect(EFFECT_ORDER, e.type).toContain(e.type);
  });
});
