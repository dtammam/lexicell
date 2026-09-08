import { describe, expect, it } from 'vitest';
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

  it('tuning knobs are finite: startingPicks is a non-negative integer', () => {
    // newRun floors and clamps, but NaN/Infinity would still leave pendingPicks non-JSON. Content must never carry them.
    expect(Number.isInteger(CONTENT.tuning.startingPicks)).toBe(true);
    expect(CONTENT.tuning.venomMax).toBeGreaterThanOrEqual(1);
    expect(CONTENT.tuning.startingPicks).toBeGreaterThanOrEqual(0);
    for (const b of CONTENT.tuning.lengthBonus) expect(Number.isFinite(b)).toBe(true);
  });

  it('the boss has a distinct mechanic', () => {
    expect(CONTENT.bosses[0]?.special?.effects.some((e) => e.type === 'lockTiles')).toBe(true);
    expect(CONTENT.enemies.find((e) => e.id === 'polyp')?.special?.effects.some((e) => e.type === 'venomTiles')).toBe(true);
    for (const e of CONTENT.enemies) if (e.id !== 'polyp') expect(e.special).toBeUndefined();
  });
});
