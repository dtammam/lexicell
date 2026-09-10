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
    // A bad readable keeps the good audio fields; a bad mute keeps the good volume, etc.
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: 'yes', sfxMuted: true, sfxVolume: 0.3, musicMuted: false, musicVolume: 0.4 }) }))).toEqual({ readable: false, sfxMuted: true, sfxVolume: 0.3, musicMuted: false, musicVolume: 0.4 });
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: true, sfxMuted: 'off', sfxVolume: 0.3, musicMuted: false, musicVolume: 0.4 }) }))).toEqual({ readable: true, sfxMuted: DEFAULT_SETTINGS.sfxMuted, sfxVolume: 0.3, musicMuted: false, musicVolume: 0.4 });
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: true, sfxMuted: true, sfxVolume: 'loud', musicMuted: true, musicVolume: 0.9 }) }))).toEqual({ readable: true, sfxMuted: true, sfxVolume: DEFAULT_SETTINGS.sfxVolume, musicMuted: true, musicVolume: 0.9 });
  });

  it('clamps each volume into 0..1 and rejects non-finite volumes', () => {
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: 5, musicVolume: 5 }) })).sfxVolume).toBe(1);
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: 5, musicVolume: 5 }) })).musicVolume).toBe(1);
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: -2, musicVolume: -2 }) })).sfxVolume).toBe(0);
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: -2, musicVolume: -2 }) })).musicVolume).toBe(0);
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: Number.NaN, musicVolume: Number.NaN }) })).sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: Number.NaN, musicVolume: Number.NaN }) })).musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });

  it('is backward-compatible: an old blob with only readable loads with the new audio defaults', () => {
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: true }) }))).toEqual({ ...DEFAULT_SETTINGS, readable: true });
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: false }) }))).toEqual(DEFAULT_SETTINGS);
  });

  it('is backward-compatible: an old { readable, sound, volume } blob maps sound onto both mutes and volume onto both buses', () => {
    // sound:false muted both buses; the single old volume set both.
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: true, sound: false, volume: 0.5 }) }))).toEqual({ readable: true, sfxMuted: true, sfxVolume: 0.5, musicMuted: true, musicVolume: 0.5 });
    // sound:true left both audible; the old volume still fills both new volumes.
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: false, sound: true, volume: 0.25 }) }))).toEqual({ readable: false, sfxMuted: false, sfxVolume: 0.25, musicMuted: false, musicVolume: 0.25 });
    // An old volume out of range still clamps.
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ readable: false, sound: true, volume: 9 }) })).sfxVolume).toBe(1);
  });

  it('round-trips all five fields and never throws when storage refuses a write', () => {
    const s = fake();
    saveSettings(s, { readable: true, sfxMuted: false, sfxVolume: 0.2, musicMuted: true, musicVolume: 0.9 });
    expect(loadSettings(s)).toEqual({ readable: true, sfxMuted: false, sfxVolume: 0.2, musicMuted: true, musicVolume: 0.9 });
    expect(() => {
      saveSettings(fake({}, true), DEFAULT_SETTINGS);
    }).not.toThrow();
  });

  it('lives under its own key, never the run save', () => {
    const s = fake();
    saveSettings(s, DEFAULT_SETTINGS);
    expect([...s.data.keys()]).toEqual([SETTINGS_KEY]);
    expect(SETTINGS_KEY).not.toBe('lexicell.run');
  });
});
