import { describe, expect, it } from 'vitest';
import { ITEMS } from '../content/items';
import type { Effect } from './effects';
import { collectEffects, gatherEffects, itemDef } from './hooks';
import type { Content, Hook } from './types';

const content: Content = { items: ITEMS, cells: [], enemies: [], bosses: [], encounters: [], events: [], traits: [], playerMaxHp: 100, tuning: { lengthBonus: [1], startingPicks: 0, venomMax: 4, poisonMax: 12, shieldMax: 30, perUnitMultCap: 1.5, enrageAfter: 20, enragePerTurn: 1, restHeal: 0.3, eliteHpScale: 1.3, eliteDamageScale: 1.15, endlessHpGrowth: 1.06, endlessDamageGrowth: 1.08 } };
const ctx = { word: 'quartz', hp: 100, maxHp: 100, turn: 1 };

describe('hooks', () => {
  it('itemDef throws on an unknown id rather than silently skipping', () => {
    expect(() => itemDef(content, 'nope')).toThrow(/unknown item/);
    expect(itemDef(content, 'lens').name).toBe('Photoreceptor');
  });

  it('gathers in acquisition order and only for the requested hook', () => {
    const raw = gatherEffects('onWordScored', ['lens', 'sharp-pen', 'bandage'], content);
    expect(raw).toEqual([
      { type: 'addMult', value: 0.7 },
      { type: 'addFlat', value: 8 },
    ]);
    expect(gatherEffects('onEncounterEnd', ['lens', 'sharp-pen', 'bandage'], content)).toEqual([{ type: 'heal', value: 20 }]);
  });

  it('collect resolves conditions and applies the fixed order', () => {
    const items = ['lens', 'long-fuse', 'sharp-pen', 'leech'];
    expect(collectEffects('onWordScored', items, content, ctx)).toEqual([
      { type: 'addFlat', value: 8 },
      { type: 'addMult', value: 0.7 },
      { type: 'addMult', value: 1 },
      { type: 'heal', value: 4 },
    ]);
    expect(collectEffects('onWordScored', items, content, { ...ctx, word: 'cat' })).toEqual([
      { type: 'addFlat', value: 8 },
      { type: 'addMult', value: 0.7 },
    ]);
  });

  it('duplicates of an item stack', () => {
    expect(collectEffects('onWordScored', ['sharp-pen', 'sharp-pen'], content, ctx)).toHaveLength(2);
  });
});

describe('placeholder item set (roadmap deliverable 5)', () => {
  it('has two hundred draftable items with unique ids, twelve of them mythic, plus the curse pool', () => {
    // Curses (variety wave step 6) are items too, but never drafted as boons; the draftable pool is 200.
    const boons = ITEMS.filter((i) => !i.curse);
    expect(boons).toHaveLength(200);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(boons.filter((i) => i.rarity === 'mythic')).toHaveLength(12);
    expect(ITEMS.filter((i) => i.curse).length).toBeGreaterThanOrEqual(8);
  });

  it('uses at least three hooks and four effect types', () => {
    const hooks = new Set<Hook>();
    const types = new Set<string>();
    const walk = (list: readonly Effect[]) => {
      for (const e of list) {
        types.add(e.type);
        if (e.type === 'condition') walk(e.then);
      }
    };
    for (const item of ITEMS) {
      for (const [hook, effects] of Object.entries(item.hooks)) {
        hooks.add(hook as Hook);
        walk(effects);
      }
    }
    expect(hooks.size).toBeGreaterThanOrEqual(3);
    expect(types.size).toBeGreaterThanOrEqual(4);
  });

  it('every item has at least one hook with at least one effect', () => {
    for (const item of ITEMS) {
      const lists = Object.values(item.hooks);
      expect(lists.length, item.id).toBeGreaterThan(0);
      for (const l of lists) expect(l.length, item.id).toBeGreaterThan(0);
    }
  });
});
