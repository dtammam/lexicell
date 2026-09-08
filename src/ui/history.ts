/**
 * Run history (Dean, 2026-09-08): a per-device list of finished runs under its own key, never
 * inside RunState. The reducer knows nothing of it; App appends an entry when a run reaches the
 * summary or is abandoned. Versioned like the save; a blob of another version or shape reads
 * as empty and is replaced on the next write. Export is a file the browser downloads; no
 * clipboard, no backend.
 */
import type { RunState } from '../engine/types';
import type { StorageLike } from './persist';

export const HISTORY_KEY = 'lexicell.history';
export const RUN_STARTED_KEY = 'lexicell.run.started';
export const HISTORY_VERSION = 1;
/** The oldest fall off past this many (Dean, question 2). */
export const HISTORY_CAP = 200;

export type HistoryOutcome = 'won' | 'lost' | 'abandoned';

export interface HistoryEntry {
  readonly seed: number;
  /** ISO strings written by the UI layer; the engine never reads a clock. Null when unknown. */
  readonly startedAt: string | null;
  readonly endedAt: string;
  readonly outcome: HistoryOutcome;
  /** 1-based encounter the run ended in (9 on a win). */
  readonly encounterReached: number;
  readonly turns: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly bestWord: string;
  readonly bestWordDamage: number;
  /** Item ids in acquisition order. */
  readonly items: readonly string[];
  readonly build: string;
  /** Starting cell id; absent on entries written before cells existed. */
  readonly cell?: string;
}

interface HistoryFile {
  readonly v: number;
  readonly runs: readonly HistoryEntry[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
const OUTCOMES: ReadonlySet<unknown> = new Set(['won', 'lost', 'abandoned']);

export function looksLikeEntry(v: unknown): v is HistoryEntry {
  return (
    isRecord(v) &&
    isNum(v.seed) &&
    (v.startedAt === null || typeof v.startedAt === 'string') &&
    typeof v.endedAt === 'string' &&
    OUTCOMES.has(v.outcome) &&
    isNum(v.encounterReached) &&
    isNum(v.turns) &&
    isNum(v.damageDealt) &&
    isNum(v.damageTaken) &&
    typeof v.bestWord === 'string' &&
    isNum(v.bestWordDamage) &&
    Array.isArray(v.items) &&
    v.items.every((i) => typeof i === 'string') &&
    typeof v.build === 'string' &&
    (v.cell === undefined || typeof v.cell === 'string')
  );
}

/** The stored runs, newest last. Anything unreadable is an empty history. */
export function loadHistory(storage: StorageLike): HistoryEntry[] {
  let raw: string | null;
  try {
    raw = storage.getItem(HISTORY_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || parsed.v !== HISTORY_VERSION || !Array.isArray(parsed.runs)) return [];
  return parsed.runs.filter(looksLikeEntry);
}

function write(storage: StorageLike, runs: readonly HistoryEntry[]): void {
  const file: HistoryFile = { v: HISTORY_VERSION, runs };
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(file));
  } catch {
    // A full or blocked storage loses the history write, not the game.
  }
}

/** Append one finished run; the oldest fall off past HISTORY_CAP. Returns the new list. */
export function appendRun(storage: StorageLike, entry: HistoryEntry): HistoryEntry[] {
  const runs = [...loadHistory(storage), entry].slice(-HISTORY_CAP);
  write(storage, runs);
  return runs;
}

export function clearHistory(storage: StorageLike): void {
  try {
    storage.removeItem(HISTORY_KEY);
  } catch {
    // Nothing to do.
  }
}

/** Remember when the current run started. One slot (there is one save); the seed says which run it belongs to. */
export function markRunStarted(storage: StorageLike, seed: number, now: string): void {
  try {
    storage.setItem(RUN_STARTED_KEY, JSON.stringify({ seed, startedAt: now }));
  } catch {
    // Loses the start time only.
  }
}

export function runStartedAt(storage: StorageLike, seed: number): string | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RUN_STARTED_KEY) ?? 'null');
    if (isRecord(parsed) && parsed.seed === seed && typeof parsed.startedAt === 'string') return parsed.startedAt;
  } catch {
    // Fall through.
  }
  return null;
}

/** Build the entry for a run that just ended (or was abandoned at `state`). */
export function entryFrom(state: RunState, outcome: HistoryOutcome, endedAt: string, startedAt: string | null, build: string): HistoryEntry {
  return {
    seed: state.rng.seed,
    startedAt,
    endedAt,
    outcome,
    encounterReached: Math.min(9, state.encounterIndex + 1),
    turns: state.stats.turns,
    damageDealt: state.stats.damageDealt,
    damageTaken: state.stats.damageTaken,
    bestWord: state.stats.bestWord,
    bestWordDamage: state.stats.bestWordDamage,
    items: [...state.player.items],
    build,
    cell: state.cell,
  };
}

export function exportJson(runs: readonly HistoryEntry[]): string {
  return JSON.stringify({ v: HISTORY_VERSION, exportedAt: new Date().toISOString(), runs }, null, 2);
}

const CSV_HEAD = ['seed', 'startedAt', 'endedAt', 'outcome', 'encounterReached', 'turns', 'damageDealt', 'damageTaken', 'bestWord', 'bestWordDamage', 'items', 'build', 'cell'];

function csvCell(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per run, items joined by `;`, RFC 4180 quoting. */
export function exportCsv(runs: readonly HistoryEntry[]): string {
  const lines = [CSV_HEAD.join(',')];
  for (const r of runs) {
    lines.push(
      [r.seed, r.startedAt, r.endedAt, r.outcome, r.encounterReached, r.turns, r.damageDealt, r.damageTaken, r.bestWord, r.bestWordDamage, r.items.join(';'), r.build, r.cell ?? '']
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
