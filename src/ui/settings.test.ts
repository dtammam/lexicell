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
    expect(loadSettings(fake({}, true))).toEqual(DEFAULT_SETTINGS);
  });

  it('validates each field on its own; a bad value falls back to its default without dropping the others', () => {
    // A bad readable keeps the good sound/volume; a bad sound keeps the good readable/volume, etc.
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: 'yes', sound: false, volume: 0.3 }) }))).toEqual({ readable: false, sound: false, volume: 0.3 });
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: true, sound: 'off', volume: 0.3 }) }))).toEqual({ readable: true, sound: true, volume: 0.3 });
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: true, sound: false, volume: 'loud' }) }))).toEqual({ readable: true, sound: false, volume: DEFAULT_SETTINGS.volume });
  });

  it('clamps volume into 0..1 and rejects non-finite volume', () => {
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: false, sound: true, volume: 5 }) })).volume).toBe(1);
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: false, sound: true, volume: -2 }) })).volume).toBe(0);
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: false, sound: true, volume: Number.NaN }) })).volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it('is backward-compatible: an old blob with only readable loads with the new sound/volume defaults', () => {
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: true }) }))).toEqual({ readable: true, sound: DEFAULT_SETTINGS.sound, volume: DEFAULT_SETTINGS.volume });
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: false }) }))).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips all three fields and never throws when storage refuses a write', () => {
    const s = fake();
    saveSettings(s, { readable: true, sound: false, volume: 0.25 });
    expect(loadSettings(s)).toEqual({ readable: true, sound: false, volume: 0.25 });
    expect(() => {
      saveSettings(fake({}, true), { readable: true, sound: true, volume: 0.7 });
    }).not.toThrow();
  });

  it('lives under its own key, never the run save', () => {
    const s = fake();
    saveSettings(s, { readable: true, sound: true, volume: 0.7 });
    expect([...s.data.keys()]).toEqual([SETTINGS_KEY]);
    expect(SETTINGS_KEY).not.toBe('lexicell.run');
  });
});
