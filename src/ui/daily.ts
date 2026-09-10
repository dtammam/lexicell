/**
 * Daily challenge (variety wave step 8). All UI-side, no engine and no save-schema change: the daily
 * seed is a deterministic uint32 derived from the date, wired into the existing `newRun` action just
 * like a pasted seed. Same UTC day -> same seed on every device, Wordle-style, and it flips at the
 * same instant the word of the day does because both go through `dayNumber`.
 *
 * "One run per day" is a single localStorage slot holding the day number the daily was last started.
 * It is written the moment the daily starts, so abandoning the daily still counts (it cannot be
 * farmed), and it re-enables on its own when the date rolls over.
 */
import { dayNumber } from './definitions';
import type { StorageLike } from './persist';

export const DAILY_KEY = 'lexicell.daily';

/**
 * The daily seed for a date: the same multiplicative hash of the day number the word of the day uses,
 * kept as an unsigned uint32 so it round-trips through the `newRun` action and the share card exactly
 * as any other seed does.
 */
export function dailySeed(date: Date): number {
  return Math.imul(dayNumber(date), 2654435761) >>> 0;
}

/** True when a run's seed is the daily seed of the day it started; that is the run History marks daily. */
export function isDailyRun(seed: number, startedAt: string | null): boolean {
  if (startedAt === null) return false;
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return false;
  return dailySeed(d) === seed;
}

/** The day number of the daily last started on this device, or null when none/unreadable. */
export function dailyPlayedDay(storage: StorageLike): number | null {
  try {
    const raw = storage.getItem(DAILY_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

/** True when today's daily has not been started yet (so the control is offered). */
export function dailyAvailable(storage: StorageLike, date: Date): boolean {
  return dailyPlayedDay(storage) !== dayNumber(date);
}

/** Record that today's daily has been started. Written at the start, so an abandoned daily still counts. */
export function markDailyPlayed(storage: StorageLike, date: Date): void {
  try {
    storage.setItem(DAILY_KEY, String(dayNumber(date)));
  } catch {
    // A blocked or full storage loses only the one-per-day lock, not the run.
  }
}
