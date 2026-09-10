import { describe, expect, it } from 'vitest';
import { dayNumber } from './definitions';
import { dailyAvailable, dailyPlayedDay, dailySeed, isDailyRun, markDailyPlayed } from './daily';
import type { StorageLike } from './persist';

function fake(initial: Record<string, string> = {}, refuse = false): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (refuse) throw new Error('blocked');
  };
  return {
    data,
    getItem: (k) => {
      guard();
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      guard();
      data.set(k, v);
    },
    removeItem: (k) => {
      guard();
      data.delete(k);
    },
  };
}

describe('dailySeed', () => {
  it('is a deterministic uint32 of the day number, so the same UTC day gives the same seed on every device', () => {
    const a = new Date('2026-09-10T00:00:01.000Z');
    const b = new Date('2026-09-10T23:59:59.000Z');
    expect(dailySeed(a)).toBe(dailySeed(b)); // same UTC day
    expect(dailySeed(a)).toBe((dailySeed(a) >>> 0)); // already a uint32
    expect(Number.isInteger(dailySeed(a))).toBe(true);
  });

  it('shares its day boundary with the word of the day (dayNumber), flipping at UTC midnight', () => {
    const lastMoment = new Date('2026-09-10T23:59:59.999Z');
    const firstMoment = new Date('2026-09-11T00:00:00.000Z');
    expect(dayNumber(firstMoment) - dayNumber(lastMoment)).toBe(1);
    expect(dailySeed(lastMoment)).not.toBe(dailySeed(firstMoment)); // a new day is a new seed
  });

  it('mirrors the word-of-the-day multiplicative hash of the day number', () => {
    for (const d of ['1970-01-01T00:00:00.000Z', '2026-09-10T12:00:00.000Z', '2000-06-15T06:00:00.000Z']) {
      const date = new Date(d);
      expect(dailySeed(date)).toBe(Math.imul(dayNumber(date), 2654435761) >>> 0);
    }
  });
});

describe('isDailyRun', () => {
  it('is true only when a run seed matches the daily seed of the day it started', () => {
    const started = '2026-09-10T09:00:00.000Z';
    expect(isDailyRun(dailySeed(new Date(started)), started)).toBe(true);
    expect(isDailyRun(dailySeed(new Date(started)) + 1, started)).toBe(false);
    // A daily begun yesterday still reads as daily by its own start date.
    const yesterday = '2026-09-09T09:00:00.000Z';
    expect(isDailyRun(dailySeed(new Date(yesterday)), yesterday)).toBe(true);
  });

  it('is false when the start time is unknown or unparseable', () => {
    expect(isDailyRun(0, null)).toBe(false);
    expect(isDailyRun(dailySeed(new Date('2026-09-10T00:00:00.000Z')), 'not a date')).toBe(false);
  });
});

describe('the one-per-day lock', () => {
  it('starts available, closes once marked for today, and reopens when the day rolls over', () => {
    const today = new Date('2026-09-10T12:00:00.000Z');
    const tomorrow = new Date('2026-09-11T12:00:00.000Z');
    const s = fake();
    expect(dailyPlayedDay(s)).toBeNull();
    expect(dailyAvailable(s, today)).toBe(true);
    markDailyPlayed(s, today);
    expect(dailyPlayedDay(s)).toBe(dayNumber(today));
    expect(dailyAvailable(s, today)).toBe(false);
    expect(dailyAvailable(s, tomorrow)).toBe(true); // a new day reopens it
  });

  it('survives a reload (it is only the stored day number) and never throws when storage refuses', () => {
    const today = new Date('2026-09-10T12:00:00.000Z');
    const persisted = fake({ 'lexicell.daily': String(dayNumber(today)) });
    expect(dailyAvailable(persisted, today)).toBe(false); // read back after a "reload"
    const refusing = fake({}, true);
    expect(dailyPlayedDay(refusing)).toBeNull();
    expect(dailyAvailable(refusing, today)).toBe(true);
    expect(() => {
      markDailyPlayed(refusing, today);
    }).not.toThrow();
  });

  it('reads a garbage stored value as "not played"', () => {
    const today = new Date('2026-09-10T12:00:00.000Z');
    expect(dailyPlayedDay(fake({ 'lexicell.daily': 'nope' }))).toBeNull();
    expect(dailyAvailable(fake({ 'lexicell.daily': 'nope' }), today)).toBe(true);
  });
});
