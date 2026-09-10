import type { StorageLike } from './persist';

/**
 * Per-device settings, separate from the run save so a toggle never touches a run and a run
 * never touches a toggle. One key, one plain object; unknown or corrupt blobs read as defaults.
 */
export const SETTINGS_KEY = 'lexicell.settings';

export interface Settings {
  /** Swap the pixel faces for a plain sans (Dean, 2026-09-08: a tester found the pixel type ambiguous). */
  readonly readable: boolean;
  /** Sound effects and music on/off (Dean, 2026-09-10). */
  readonly sound: boolean;
  /** Master volume, 0..1 (Dean, 2026-09-10). */
  readonly volume: number;
}

export const DEFAULT_SETTINGS: Settings = { readable: false, sound: true, volume: 0.7 };

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
    const p = parsed as { readable?: unknown; sound?: unknown; volume?: unknown };
    // Each field validated on its own, so an old blob with only `readable` loads with the new
    // defaults, and a bad value for any one field falls back without dropping the others.
    const readable = typeof p.readable === 'boolean' ? p.readable : DEFAULT_SETTINGS.readable;
    const sound = typeof p.sound === 'boolean' ? p.sound : DEFAULT_SETTINGS.sound;
    const volume = typeof p.volume === 'number' && Number.isFinite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : DEFAULT_SETTINGS.volume;
    return { readable, sound, volume };
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
