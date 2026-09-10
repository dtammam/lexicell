import type { StorageLike } from './persist';

/**
 * Per-device settings, separate from the run save so a toggle never touches a run and a run
 * never touches a toggle. One key, one plain object; unknown or corrupt blobs read as defaults.
 *
 * Sound effects and music are independent (Dean, 2026-09-10, Settings page): each has its own
 * mute and volume. Older builds stored a single `{ sound, volume }` pair; loadSettings maps that
 * onto both buses so an old blob upgrades without a reset.
 */
export const SETTINGS_KEY = 'lexicell.settings';

export interface Settings {
  /** Swap the pixel faces for a plain sans (Dean, 2026-09-08: a tester found the pixel type ambiguous). */
  readonly readable: boolean;
  /** Sound effects muted (Dean, 2026-09-10). */
  readonly sfxMuted: boolean;
  /** Sound-effects volume, 0..1 (Dean, 2026-09-10). */
  readonly sfxVolume: number;
  /** Music muted (Dean, 2026-09-10). */
  readonly musicMuted: boolean;
  /** Music volume, 0..1 (Dean, 2026-09-10). */
  readonly musicVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  readable: false,
  sfxMuted: false,
  sfxVolume: 0.7,
  musicMuted: false,
  musicVolume: 0.7,
};

export function loadSettings(storage: StorageLike): Settings {
  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (raw === null) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
    const p = parsed as {
      readable?: unknown;
      sound?: unknown;
      volume?: unknown;
      sfxMuted?: unknown;
      sfxVolume?: unknown;
      musicMuted?: unknown;
      musicVolume?: unknown;
    };
    // Back-compat: a pre-split blob carried one `{ sound, volume }` pair for both buses. Old
    // `sound: false` means muted; old `volume` sets both volumes. These fill in only when the
    // matching new field is absent, so a current blob is read verbatim and each field falls back
    // on its own.
    const legacyMuted = typeof p.sound === 'boolean' ? !p.sound : undefined;
    const legacyVolume = typeof p.volume === 'number' && Number.isFinite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : undefined;

    const readable = typeof p.readable === 'boolean' ? p.readable : DEFAULT_SETTINGS.readable;
    const sfxMuted = typeof p.sfxMuted === 'boolean' ? p.sfxMuted : legacyMuted ?? DEFAULT_SETTINGS.sfxMuted;
    const sfxVolume = typeof p.sfxVolume === 'number' && Number.isFinite(p.sfxVolume) ? Math.min(1, Math.max(0, p.sfxVolume)) : legacyVolume ?? DEFAULT_SETTINGS.sfxVolume;
    const musicMuted = typeof p.musicMuted === 'boolean' ? p.musicMuted : legacyMuted ?? DEFAULT_SETTINGS.musicMuted;
    const musicVolume = typeof p.musicVolume === 'number' && Number.isFinite(p.musicVolume) ? Math.min(1, Math.max(0, p.musicVolume)) : legacyVolume ?? DEFAULT_SETTINGS.musicVolume;
    return { readable, sfxMuted, sfxVolume, musicMuted, musicVolume };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: StorageLike, settings: Settings): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A blocked storage loses the preference, not the game.
  }
}
