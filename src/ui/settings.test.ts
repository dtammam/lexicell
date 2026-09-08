import { describe, expect, it } from 'vitest';
import type { StorageLike } from './persist';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from './settings';

function fake(initial: Record<string, string> = {}, refuse = false): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => {
      if (refuse) throw new Error('blocked');
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (refuse) throw new Error('blocked');
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

describe('settings', () => {
  it('defaults when nothing is stored, when the blob is corrupt, and when storage refuses', () => {
    expect(loadSettings(fake())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fake({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fake({ [SETTINGS_KEY]: '"a string"' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: 'yes' }) }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fake({}, true))).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips and never throws when storage refuses a write', () => {
    const s = fake();
    saveSettings(s, { readable: true });
    expect(loadSettings(s)).toEqual({ readable: true });
    expect(() => {
      saveSettings(fake({}, true), { readable: true });
    }).not.toThrow();
  });

  it('lives under its own key, never the run save', () => {
    const s = fake();
    saveSettings(s, { readable: true });
    expect([...s.data.keys()]).toEqual([SETTINGS_KEY]);
    expect(SETTINGS_KEY).not.toBe('lexicell.run');
  });
});
