import { CONTENT } from '../content/index';
import { DEFAULT_CELL_ID, SAVE_VERSION } from '../engine/reducer';
import type { RunState } from '../engine/types';

/** The slice of the Storage interface persist needs, so tests inject a Map-backed fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'lexicell.run';

/**
 * The exact key set of a RunState (v3 since the effects wave; the player and enemy gained fields, the top level did not). Load refuses a blob whose keys differ, so a
 * RunState field added or removed without bumping SAVE_VERSION drops the old save
 * instead of resuming into a shape the reducer never produced (tech-debt #3).
 * persist.test.ts binds this list to newRun's actual output.
 */
export const RUN_STATE_KEYS: readonly string[] = [
  'v',
  'cell',
  'kinds',
  'rng',
  'phase',
  'encounterIndex',
  'event',
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

const PHASES: ReadonlySet<unknown> = new Set(['fight', 'pick', 'rest', 'event', 'evolve', 'summary']);
const KINDS: ReadonlySet<unknown> = new Set(['fight', 'elite', 'rest', 'event']);

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
      isNum(v.encounter.enemy.poison) &&
      isNum(v.encounter.enemy.stunned) &&
      Array.isArray(v.encounter.grid) &&
      v.encounter.grid.length === 16 &&
      Array.isArray(v.encounter.selection));
  return (
    isNum(v.v) &&
    typeof v.cell === 'string' &&
    Array.isArray(v.kinds) &&
    v.kinds.every((k) => KINDS.has(k)) &&
    // An event id only while an event is on screen (gate S4): forged pairs are dropped.
    (v.phase === 'event' ? typeof v.event === 'string' : v.event === null) &&
    isRecord(v.rng) &&
    isNum(v.rng.seed) &&
    isNum(v.rng.counter) &&
    PHASES.has(v.phase) &&
    Number.isInteger(v.encounterIndex) &&
    isRecord(v.player) &&
    isNum(v.player.hp) &&
    isNum(v.player.maxHp) &&
    Array.isArray(v.player.items) &&
    Array.isArray(v.player.traits) &&
    v.player.traits.every((t) => typeof t === 'string') &&
    isNum(v.player.shield) &&
    isNum(v.player.freeShuffles) &&
    encounterOk &&
    (v.phase !== 'fight' || v.encounter !== null) &&
    (v.offer === null || Array.isArray(v.offer)) &&
    // A pick or an evolve screen needs something to pick (gate S4, PR #64): the reducer never writes an empty one.
    ((v.phase !== 'pick' && v.phase !== 'evolve') || (Array.isArray(v.offer) && v.offer.length > 0)) &&
    (v.outcome === null || typeof v.outcome === 'string') &&
    (v.lastTurn === null || isRecord(v.lastTurn)) &&
    (v.rejected === null || typeof v.rejected === 'string') &&
    isNum(v.pendingPicks) &&
    isRecord(v.stats) &&
    typeof v.stats.bestWord === 'string' &&
    isNum(v.stats.bestWordDamage) &&
    typeof v.stats.worstWord === 'string' &&
    isNum(v.stats.worstWordDamage)
  );
}

/**
 * Migrations on record, applied in order: v3 gains `cell: 'balanced'` (starting cells), v4 gains
 * the empty worst-word stats (stats HUD). Anything else passes through and meets the shape check.
 */
const KNOWN_ITEMS: ReadonlySet<string> = new Set(CONTENT.items.map((i) => i.id));
const KNOWN_TRAITS: ReadonlySet<string> = new Set(CONTENT.traits.map((t) => t.id));

/**
 * An id the content no longer has is dropped from a save at load (gate, PR #64): the engine's
 * lookups throw on an unknown item or trait id, which would throw on the next hook of a run saved
 * across a content change and leave it stuck. A held item or trait that is gone is simply gone; an
 * evolve offer keeps its known traits, and a mid-evolve save whose offered traits are all gone is
 * dropped by the shape check (its offer would be empty).
 */
export function dropUnknownIds(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.player)) return value;
  const player = value.player;
  const items = Array.isArray(player.items) ? player.items.filter((id) => KNOWN_ITEMS.has(id as string)) : player.items;
  const traits = Array.isArray(player.traits) ? player.traits.filter((id) => KNOWN_TRAITS.has(id as string)) : player.traits;
  let offer = value.offer;
  if (value.phase === 'evolve' && Array.isArray(offer)) offer = offer.filter((id) => KNOWN_TRAITS.has(id as string));
  else if (value.phase === 'pick' && Array.isArray(offer)) offer = offer.filter((id) => KNOWN_ITEMS.has(id as string));
  return { ...value, player: { ...player, items, traits }, offer };
}

export function migrate(value: unknown): unknown {
  let v: unknown = value;
  if (isRecord(v) && v.v === 3 && !('cell' in v)) v = { ...v, v: 4, cell: DEFAULT_CELL_ID };
  if (isRecord(v) && v.v === 4 && isRecord(v.stats) && !('worstWord' in v.stats)) {
    v = { ...v, v: 5, stats: { ...v.stats, worstWord: '', worstWordDamage: 0 } };
  }
  // v5 -> v6 (encounter types): no kinds were placed, so the rest of the run is fights; no event on screen.
  if (isRecord(v) && v.v === 5 && !('kinds' in v)) v = { ...v, v: 6, kinds: [], event: null };
  // v6 -> v7 (evolution): no traits picked yet.
  if (isRecord(v) && v.v === 6 && isRecord(v.player) && !('traits' in v.player)) v = { ...v, v: 7, player: { ...v.player, traits: [] } };
  return v;
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
      // v3 -> v4 (starting cells, Dean, 2026-09-08, question 3): a v3 save is the balanced cell.
      const migrated = dropUnknownIds(migrate(parsed));
      if (!looksLikeRunState(migrated) || migrated.v !== SAVE_VERSION) {
        storage.removeItem(key);
        return null;
      }
      return migrated;
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
