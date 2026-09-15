/**
 * "Seen build" marker (Dean, 2026-09-15): a returning player is shown the Release notes once after an
 * update, so they catch what changed. We store the last build number they were shown and, on launch,
 * send them to the notes when a newer build has shipped. Its own localStorage key, never part of the
 * run save; a brand-new player is not interrupted.
 */
import type { StorageLike } from './persist';

export const SEEN_BUILD_KEY = 'lexicell.seenBuild';

/** The build number the player was last shown the notes for, or null if never recorded (or unreadable). */
export function loadSeenBuild(storage: StorageLike): number | null {
  try {
    const raw = storage.getItem(SEEN_BUILD_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveSeenBuild(storage: StorageLike, build: number): void {
  try {
    storage.setItem(SEEN_BUILD_KEY, String(build));
  } catch {
    // A refusing/full storage just means the nudge may repeat next launch; not worth surfacing.
  }
}

/**
 * Whether to send the player to the Release notes on launch: only a RETURNING player (has a save or
 * run history) on a build newer than the one they last saw. A brand-new player, or one already on the
 * current build, is left on the title. `current` is null before builds exist (guards defensively).
 */
export function shouldShowReleaseNotes(opts: { seen: number | null; current: number | null; hasPlayed: boolean }): boolean {
  if (opts.current === null || !opts.hasPlayed) return false;
  return opts.seen === null || opts.seen < opts.current;
}
