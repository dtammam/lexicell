import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORDS_PATH } from '../../scripts/lib/load-dictionary';
import { CONTENT } from './index';

describe('content bundle', () => {
  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(CONTENT))).toEqual(CONTENT);
  });

  it('has nine encounters in three acts with a boss every third', () => {
    expect(CONTENT.encounters).toHaveLength(9);
    CONTENT.encounters.forEach((e, i) => {
      expect(e.boss, `encounter ${i}`).toBe(i % 3 === 2);
      expect(e.act, `encounter ${i}`).toBe(Math.floor(i / 3) + 1);
      expect(e.hpScale).toBeGreaterThan(0);
      expect(e.damageScale).toBeGreaterThan(0);
    });
  });

  it('has three enemies and one boss with unique ids and sane numbers', () => {
    expect(CONTENT.enemies).toHaveLength(3);
    expect(CONTENT.bosses).toHaveLength(1);
    const all = [...CONTENT.enemies, ...CONTENT.bosses];
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) {
      expect(e.hp, e.id).toBeGreaterThan(0);
      expect(e.damage, e.id).toBeGreaterThan(0);
      expect(e.attackEvery, e.id).toBeGreaterThanOrEqual(1);
      if (e.special) expect(e.special.every, e.id).toBeGreaterThanOrEqual(1);
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

  it('has five starting cells with unique ids, balanced first with no traits, every starting item real, HP in a sane band', () => {
    expect(CONTENT.cells).toHaveLength(5);
    expect(new Set(CONTENT.cells.map((c) => c.id)).size).toBe(5);
    expect(CONTENT.cells[0]?.id).toBe('balanced');
    expect(CONTENT.cells[0]?.traits).toEqual({});
    for (const c of CONTENT.cells) {
      expect(c.maxHp).toBeGreaterThanOrEqual(60);
      expect(c.maxHp).toBeLessThanOrEqual(150);
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.flavor.length).toBeGreaterThan(3);
      for (const id of c.startingItems) expect(CONTENT.items.some((i) => i.id === id), id).toBe(true);
    }
  });

  it('the boss has a distinct mechanic', () => {
    expect(CONTENT.bosses[0]?.special?.effects.some((e) => e.type === 'lockTiles')).toBe(true);
    expect(CONTENT.enemies.find((e) => e.id === 'polyp')?.special?.effects.some((e) => e.type === 'venomTiles')).toBe(true);
    for (const e of CONTENT.enemies) if (e.id !== 'polyp') expect(e.special).toBeUndefined();
  });
});
