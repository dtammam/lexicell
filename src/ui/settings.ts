import type { StorageLike } from './persist';

/**
 * Per-device settings, separate from the run save so a toggle never touches a run and a run
 * never touches a toggle. One key, one plain object; unknown or corrupt blobs read as defaults.
 */
export const SETTINGS_KEY = 'lexicell.settings';

export interface Settings {
  /** Swap the pixel faces for a plain sans (Dean, 2026-09-08: a tester found the pixel type ambiguous). */
  readonly readable: boolean;
}

export const DEFAULT_SETTINGS: Settings = { readable: false };

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
    const r = (parsed as { readable?: unknown }).readable;
    return { readable: typeof r === 'boolean' ? r : DEFAULT_SETTINGS.readable };
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
