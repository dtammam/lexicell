import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORDS_PATH } from '../../scripts/lib/load-dictionary';
import type { Effect } from '../engine/effects';
import { CONTENT } from './index';

describe('content bundle', () => {
  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(CONTENT))).toEqual(CONTENT);
  });

  it('has nine encounters in three acts with a boss every third', () => {
    expect(CONTENT.encounters).toHaveLength(9);
    expect(CONTENT.tuning.restHeal).toBeGreaterThan(0);
    expect(CONTENT.tuning.restHeal).toBeLessThanOrEqual(1);
    expect(CONTENT.tuning.eliteHpScale).toBeGreaterThanOrEqual(1);
    expect(CONTENT.tuning.eliteDamageScale).toBeGreaterThanOrEqual(1);
    CONTENT.encounters.forEach((e, i) => {
      expect(e.boss, `encounter ${i}`).toBe(i % 3 === 2);
      expect(e.act, `encounter ${i}`).toBe(Math.floor(i / 3) + 1);
      expect(e.hpScale).toBeGreaterThan(0);
      expect(e.damageScale).toBeGreaterThan(0);
    });
  });

  it('has twenty-four enemies in three act pools and one boss per act, unique ids, sane numbers, a sprite each', () => {
    expect(CONTENT.enemies).toHaveLength(24);
    expect(CONTENT.bosses).toHaveLength(3);
    for (const act of [1, 2, 3]) {
      expect(CONTENT.enemies.filter((e) => e.act === act), `act ${act}`).toHaveLength(8);
      expect(CONTENT.bosses.filter((e) => e.act === act), `boss act ${act}`).toHaveLength(1);
    }
    const all = [...CONTENT.enemies, ...CONTENT.bosses];
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) {
      expect(e.hp, e.id).toBeGreaterThan(0);
      expect(e.damage, e.id).toBeGreaterThan(0);
      expect(e.attackEvery, e.id).toBeGreaterThanOrEqual(1);
      expect(e.variance, e.id).toBeGreaterThanOrEqual(0);
      expect(e.variance, e.id).toBeLessThanOrEqual(0.6);
      if (e.special) expect(e.special.every, e.id).toBeGreaterThanOrEqual(1);
      if (e.traits?.armour) expect(e.traits.armour, e.id).toBeLessThanOrEqual(7); // a 7-letter word always lands in full
      expect(existsSync(`public/sprites/${e.id}.png`), e.id).toBe(true);
    }
  });

  it('demanders (challenge wave): three enemies carry resist, one per act, factor 0.5 (never 0), demand escalating by act', () => {
    const resisters = [...CONTENT.enemies, ...CONTENT.bosses].filter((e) => e.traits?.resist);
    expect(resisters.map((e) => e.id)).toEqual(['stentor', 'zoanthid', 'anglerfish']); // one per act, in act order
    for (const e of resisters) {
      const r = e.traits!.resist!;
      expect(r.factor, e.id).toBe(0.5); // a demand halves; it never zeroes a fight (0 would be unwinnable)
      expect(r.when.kind, e.id).toBe('minLength');
    }
    // Escalating: act 1 under 5, act 2 under 6, act 3 under 7.
    const byId = (id: string) => resisters.find((e) => e.id === id)!.traits!.resist!.when;
    expect(byId('stentor')).toEqual({ kind: 'minLength', value: 5 });
    expect(byId('zoanthid')).toEqual({ kind: 'minLength', value: 6 });
    expect(byId('anglerfish')).toEqual({ kind: 'minLength', value: 7 });
  });

  it('events (variety wave step 2): unique ids, short phone-legible text, a trade first and a walk-away last, player-side verbs only, a cost on every trade', () => {
    expect(CONTENT.events.length).toBeGreaterThanOrEqual(6);
    expect(new Set(CONTENT.events.map((e) => e.id)).size).toBe(CONTENT.events.length);
    const playerSide = new Set(['heal', 'damagePlayer', 'maxHp', 'shield', 'freeShuffle']);
    for (const ev of CONTENT.events) {
      expect(ev.name.length, ev.id).toBeGreaterThan(0);
      expect(ev.text.length, ev.id).toBeLessThanOrEqual(120);
      expect(ev.choices.length, ev.id).toBeGreaterThanOrEqual(2);
      const trade = ev.choices[0];
      const pass = ev.choices[ev.choices.length - 1];
      expect(trade?.effects.length, ev.id).toBeGreaterThan(0);
      expect(pass?.effects, ev.id).toEqual([]);
      expect(pass?.rarePick, ev.id).toBeUndefined();
      // Every trade costs something: HP now, max HP, or both.
      const cost = trade?.effects.some((e) => e.type === 'damagePlayer' || (e.type === 'maxHp' && e.value < 0));
      expect(cost, ev.id).toBe(true);
      for (const c of ev.choices) {
        expect(c.label.length, ev.id).toBeLessThanOrEqual(48);
        for (const e of c.effects) expect(playerSide.has(e.type), `${ev.id}: ${e.type}`).toBe(true);
      }
    }
    expect(CONTENT.events.some((e) => e.choices[0]?.rarePick)).toBe(true);
  });

  it('traits (variety wave step 3): at least nine so both evolutions offer three fresh ones, unique ids, description and flavor, real hooks', () => {
    expect(CONTENT.traits.length).toBeGreaterThanOrEqual(9);
    expect(new Set(CONTENT.traits.map((t) => t.id)).size).toBe(CONTENT.traits.length);
    const itemIds = new Set(CONTENT.items.map((i) => i.id));
    for (const t of CONTENT.traits) {
      expect(itemIds.has(t.id), t.id).toBe(false); // a trait is not an item
      expect(t.name.length, t.id).toBeGreaterThan(0);
      expect(t.description.length, t.id).toBeGreaterThan(0);
      expect(t.flavor.length, t.id).toBeGreaterThan(0);
      expect(t.flavor, t.id).not.toMatch(/\d/);
      expect(Object.values(t.hooks).some((e) => (e?.length ?? 0) > 0), t.id).toBe(true);
    }
  });

  it('every item carries a mechanic and a separate line of flavor, neither empty', () => {
    for (const i of CONTENT.items) {
      expect(i.description.length, i.id).toBeGreaterThan(0);
      expect(i.flavor.length, i.id).toBeGreaterThan(0);
      expect(i.flavor, i.id).not.toMatch(/\d/);
    }
  });

  it('tuning knobs are finite: startingPicks is a non-negative integer', () => {
    // newRun floors and clamps, but NaN/Infinity would still leave pendingPicks non-JSON. Content must never carry them.
    expect(Number.isInteger(CONTENT.tuning.startingPicks)).toBe(true);
    expect(CONTENT.tuning.venomMax).toBeGreaterThanOrEqual(1);
    // A special's starting venom must not exceed the cap, or the first bite would be the biggest.
    for (const e of [...CONTENT.enemies, ...CONTENT.bosses]) {
      for (const eff of e.special?.effects ?? []) if (eff.type === 'venomTiles') expect(eff.value, e.id).toBeLessThanOrEqual(CONTENT.tuning.venomMax);
    }
    expect(CONTENT.tuning.startingPicks).toBeGreaterThanOrEqual(0);
    for (const b of CONTENT.tuning.lengthBonus) expect(Number.isFinite(b)).toBe(true);
  });

  it('every item has a generated icon under public/sprites/items (scripts/sprites.py)', () => {
    const root = WORDS_PATH.replace(/src\/content\/dictionary\/words\.txt$/, '');
    for (const item of CONTENT.items) expect(existsSync(`${root}public/sprites/items/${item.id}.png`), item.id).toBe(true);
  });

  it('curses (variety wave step 6): at least eight, each carries the flag, a cost hook from the existing verbs, description and flavor, a sprite; boons carry no flag', () => {
    const root = WORDS_PATH.replace(/src\/content\/dictionary\/words\.txt$/, '');
    const curses = CONTENT.items.filter((i) => i.curse);
    expect(curses.length).toBeGreaterThanOrEqual(8);
    // Every curse must be an actual cost: at least one hook effect is a negative number or a
    // self-harm verb. A curse with only upside would be a free item, not a curse.
    const isCost = (e: Effect): boolean => {
      switch (e.type) {
        case 'addFlat':
        case 'addMult':
        case 'reduceDamage':
        case 'maxHp':
          return e.value < 0;
        case 'vowelWeight':
          return e.value < 1;
        case 'damagePlayer':
          return e.value > 0;
        case 'lockTiles':
        case 'venomTiles':
        case 'scramble':
          return true;
        default:
          return false;
      }
    };
    const anyCost = (effects: readonly Effect[]): boolean =>
      effects.some((e) => (e.type === 'condition' ? anyCost(e.then) : e.type === 'perUnit' ? anyCost(e.then) : isCost(e)));
    for (const c of curses) {
      expect(c.curse, c.id).toBe(true);
      expect(c.description.length, c.id).toBeGreaterThan(0);
      expect(c.flavor.length, c.id).toBeGreaterThan(0);
      expect(c.flavor, c.id).not.toMatch(/\d/);
      const hookHasCost = Object.values(c.hooks).some((effects) => anyCost(effects ?? []));
      expect(hookHasCost, `${c.id}: no cost hook`).toBe(true);
      expect(existsSync(`${root}public/sprites/items/${c.id}.png`), c.id).toBe(true);
    }
    // Self-venom stays at or under the cap, like an enemy special (content test above).
    for (const c of curses) for (const h of Object.values(c.hooks)) for (const e of h ?? []) if (e.type === 'venomTiles') expect(e.value, c.id).toBeLessThanOrEqual(CONTENT.tuning.venomMax);
    // Every non-curse item leaves the flag off, so drawOffer's `!i.curse` filter and the compendium split are exact.
    for (const i of CONTENT.items.filter((x) => !x.curse)) expect(i.curse, i.id).toBeUndefined();
  });

  it('has five starting cells with unique ids, balanced first with no traits, every starting item real, HP in a sane band', () => {
    expect(CONTENT.cells).toHaveLength(5);
    expect(new Set(CONTENT.cells.map((c) => c.id)).size).toBe(5);
    expect(CONTENT.cells[0]?.id).toBe('balanced');
    expect(CONTENT.cells[0]?.traits).toEqual({});
    expect(CONTENT.cells[0]?.maxHp).toBe(CONTENT.playerMaxHp);
    for (const c of CONTENT.cells) {
      expect(Number.isInteger(c.maxHp), c.id).toBe(true);
      expect(Number.isInteger(c.extraPicks) && c.extraPicks >= 0, c.id).toBe(true);
      expect(new Set(c.startingItems).size, c.id).toBe(c.startingItems.length);
      expect(c.traits.onPick, `${c.id}: a cell has no pick moment; onPick traits would never fire`).toBeUndefined();
      expect(c.maxHp).toBeGreaterThanOrEqual(60);
      expect(c.maxHp).toBeLessThanOrEqual(150);
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.flavor.length).toBeGreaterThan(3);
      for (const id of c.startingItems) expect(CONTENT.items.some((i) => i.id === id), id).toBe(true);
    }
  });

  it('every cell has a sprite for each act under public/sprites (scripts/sprites.py)', () => {
    for (const c of CONTENT.cells) for (const act of [1, 2, 3]) expect(existsSync(`public/sprites/cell-${c.id}-${act}.png`), `${c.id} act ${act}`).toBe(true);
  });

  it('grid rules (step 4): one enemy cracks tiles with sane turns, one trait gilds them, and gold values stay small', () => {
    const crackers = [...CONTENT.enemies, ...CONTENT.bosses].filter((e) => e.special?.effects.some((x) => x.type === 'crackTiles'));
    expect(crackers.map((e) => e.id)).toEqual(['diatom-swarm']);
    for (const e of crackers) for (const x of e.special?.effects ?? []) if (x.type === 'crackTiles') expect(x.turns).toBeGreaterThanOrEqual(1);
    const gilders = CONTENT.traits.filter((t) => Object.values(t.hooks).some((h) => h?.some((x) => x.type === 'goldTiles')));
    expect(gilders.map((t) => t.id)).toEqual(['midas']);
    for (const t of gilders) for (const h of Object.values(t.hooks)) for (const x of h ?? []) if (x.type === 'goldTiles') expect(x.value).toBeLessThanOrEqual(10);
  });

  it('every boss has a special and a trait, and no enemy carries both a lock and a venom special', () => {
    for (const b of CONTENT.bosses) {
      expect(b.special, b.id).toBeDefined();
      expect(b.traits && Object.keys(b.traits).length > 0, b.id).toBe(true);
    }
    for (const e of [...CONTENT.enemies, ...CONTENT.bosses]) {
      const types = new Set((e.special?.effects ?? []).map((x) => x.type));
      expect(types.has('lockTiles') && types.has('venomTiles'), e.id).toBe(false);
    }
  });
});
