import { SAVE_VERSION } from '../engine/reducer';
import type { RunState } from '../engine/types';

/** The slice of the Storage interface persist needs, so tests inject a Map-backed fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'lexicell.run';

/**
 * The exact key set of a v1 RunState. Load refuses a blob whose keys differ, so a
 * RunState field added or removed without bumping SAVE_VERSION drops the old save
 * instead of resuming into a shape the reducer never produced (tech-debt #3).
 * persist.test.ts binds this list to newRun's actual output.
 */
export const RUN_STATE_KEYS: readonly string[] = [
  'v',
  'rng',
  'phase',
  'encounterIndex',
  'player',
  'encounter',
  'offer',
  'outcome',
  'lastTurn',
  'rejected',
  'pendingPicks',
  'stats',
];

export interface Persist {
  /** The saved run, or null when there is none, it is unreadable, or its shape is not the current one. */
  load(): RunState | null;
  /** Save after every reducer step. Never throws: a full or blocked storage loses the save, not the game. */
  save(state: RunState): void;
  clear(): void;
}

const PHASES: ReadonlySet<unknown> = new Set(['fight', 'pick', 'summary']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Key set plus the field types the screens dereference on first paint. A blob with the
 * right keys and wrong types (player: []) would otherwise load, throw inside render, and
 * come back on every reload; the gate's W1 for Phase 1. Deeper shape errors are caught by
 * the render boundary in App.svelte, which clears the save and starts over.
 */
function looksLikeRunState(value: unknown): value is RunState {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...RUN_STATE_KEYS].sort();
  if (keys.length !== expected.length || !keys.every((k, i) => k === expected[i])) return false;
  const v = value;
  const encounterOk =
    v.encounter === null ||
    (isRecord(v.encounter) &&
      isRecord(v.encounter.enemy) &&
      Array.isArray(v.encounter.grid) &&
      v.encounter.grid.length === 16 &&
      Array.isArray(v.encounter.selection));
  return (
    isNum(v.v) &&
    isRecord(v.rng) &&
    isNum(v.rng.seed) &&
    isNum(v.rng.counter) &&
    PHASES.has(v.phase) &&
    Number.isInteger(v.encounterIndex) &&
    isRecord(v.player) &&
    isNum(v.player.hp) &&
    isNum(v.player.maxHp) &&
    Array.isArray(v.player.items) &&
    encounterOk &&
    (v.phase !== 'fight' || v.encounter !== null) &&
    (v.offer === null || Array.isArray(v.offer)) &&
    (v.outcome === null || typeof v.outcome === 'string') &&
    (v.lastTurn === null || isRecord(v.lastTurn)) &&
    (v.rejected === null || typeof v.rejected === 'string') &&
    isNum(v.pendingPicks) &&
    isRecord(v.stats)
  );
}

export function createPersist(storage: StorageLike, key: string = SAVE_KEY): Persist {
  return {
    load() {
      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch {
        return null;
      }
      if (raw === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        storage.removeItem(key);
        return null;
      }
      if (!looksLikeRunState(parsed) || parsed.v !== SAVE_VERSION) {
        storage.removeItem(key);
        return null;
      }
      return parsed;
    },
    save(state) {
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch {
        // Quota or private-mode refusal. The run continues in memory.
      }
    },
    clear() {
      try {
        storage.removeItem(key);
      } catch {
        // Nothing to do; the next save overwrites anyway.
      }
    },
  };
}
