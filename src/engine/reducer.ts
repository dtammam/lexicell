/**
 * The only place run state changes. `reduce(state, action, ctx)` returns a
 * new state; nothing here or elsewhere mutates. The RNG lives in state and is
 * threaded through every random decision, so seed + action log = the run.
 *
 * Turn order, fixed:
 *   player submits word
 *     -> onWordScored effects (scoring first, then heal/damage extras)
 *     -> enemy takes damage; if dead: onEncounterEnd, then pick or win
 *   enemy turn
 *     -> attack on its cadence: onDamageTaken (reduceDamage first), then hp
 *     -> special on its cadence (bosses)
 *     -> if player dead: lose
 *   refill used tiles (onTileDraw vowelWeight), tick locks, dead-grid scramble
 *   next turn: onTurnStart effects; if enemy dead: same as above
 *
 * Conditions on onDamageTaken see the player's HP *before* the hit.
 */
import type { Dictionary } from './dictionary';
import { resolveEffects, type ConditionContext, type Effect } from './effects';
import { freshGrid, isDead, playableIndices, refill } from './grid';
import { collectEffects, itemDef } from './hooks';
import { createRng, nextInt, pick, weightedPick, type Rng } from './rng';
import { scoreWord } from './scoring';
import type { Solver } from './solver';
import { GRID_SIZE, type Content, type Encounter, type RunState, type Tile, type TurnReport } from './types';

export interface EngineContext {
  readonly dictionary: Dictionary;
  readonly solver: Solver;
  readonly content: Content;
}

export type Action =
  | { readonly type: 'newRun'; readonly seed: number }
  | { readonly type: 'toggleTile'; readonly index: number }
  | { readonly type: 'clearSelection' }
  | { readonly type: 'submitWord' }
  | { readonly type: 'pickItem'; readonly index: number };

export const SAVE_VERSION = 1;
export const OFFER_SIZE = 3;
export const RARITY_WEIGHT = { common: 3, uncommon: 2, rare: 1 } as const;

const EMPTY_REPORT: TurnReport = {
  word: '',
  base: 0,
  mult: 1,
  damage: 0,
  enemyDamage: 0,
  healed: 0,
  scrambled: false,
  enemyDefeated: false,
};

// ---------- entry points ----------

export function newRun(seed: number, ctx: EngineContext): RunState {
  const maxHp = ctx.content.playerMaxHp;
  const state: RunState = {
    v: 1,
    rng: createRng(seed),
    phase: 'fight',
    encounterIndex: 0,
    player: { hp: maxHp, maxHp, items: [] },
    encounter: null,
    offer: null,
    outcome: null,
    lastTurn: null,
    rejected: null,
    stats: { turns: 0, damageDealt: 0, damageTaken: 0, bestWord: '', bestWordDamage: 0, hpAtEncounterStart: [] },
  };
  return startEncounter(state, ctx);
}

export function reduce(state: RunState, action: Action, ctx: EngineContext): RunState {
  switch (action.type) {
    case 'newRun':
      return newRun(action.seed, ctx);
    case 'toggleTile':
      return toggleTile(state, action.index);
    case 'clearSelection':
      return state.encounter ? { ...state, rejected: null, encounter: { ...state.encounter, selection: [] } } : reject(state, 'no encounter');
    case 'submitWord':
      return submitWord(state, ctx);
    case 'pickItem':
      return pickItem(state, action.index, ctx);
  }
}

// ---------- helpers ----------

function reject(state: RunState, reason: string): RunState {
  return { ...state, rejected: reason };
}

function conditionCtx(state: RunState, word?: string): ConditionContext {
  const base = { hp: state.player.hp, maxHp: state.player.maxHp, turn: state.encounter?.turn ?? 0 };
  return word === undefined ? base : { ...base, word };
}

function vowelWeight(state: RunState, ctx: EngineContext): number {
  let w = 1;
  for (const e of collectEffects('onTileDraw', state.player.items, ctx.content, conditionCtx(state))) {
    if (e.type === 'vowelWeight') w *= e.value;
  }
  return w;
}

function withRng(state: RunState, rng: Rng): RunState {
  return { ...state, rng };
}

function clampHp(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, hp));
}

interface Applied {
  readonly state: RunState;
  readonly healed: number;
  readonly playerDamage: number;
  readonly enemyDamage: number;
  readonly scrambled: boolean;
}

/**
 * Apply resolved, non-scoring effects in the order given (already EFFECT_ORDER).
 * reduceDamage and vowelWeight are read elsewhere and ignored here.
 */
function applyEffects(state: RunState, effects: readonly Effect[], ctx: EngineContext): Applied {
  let s = state;
  let healed = 0;
  let playerDamage = 0;
  let enemyDamage = 0;
  let scrambled = false;
  for (const e of effects) {
    switch (e.type) {
      case 'heal': {
        const hp = clampHp(s.player.hp + e.value, s.player.maxHp);
        healed += hp - s.player.hp;
        s = { ...s, player: { ...s.player, hp } };
        break;
      }
      case 'damagePlayer': {
        const hp = clampHp(s.player.hp - e.value, s.player.maxHp);
        playerDamage += s.player.hp - hp;
        s = { ...s, player: { ...s.player, hp } };
        break;
      }
      case 'damageEnemy': {
        if (!s.encounter) break;
        const hp = Math.max(0, s.encounter.enemy.hp - e.value);
        enemyDamage += s.encounter.enemy.hp - hp;
        s = { ...s, encounter: { ...s.encounter, enemy: { ...s.encounter.enemy, hp } } };
        break;
      }
      case 'lockTiles': {
        if (!s.encounter) break;
        const grid = s.encounter.grid.slice();
        let rng = s.rng;
        let candidates = playableIndices(grid);
        for (let n = 0; n < e.count && candidates.length > 0; n++) {
          let k: number;
          [k, rng] = nextInt(rng, candidates.length);
          const idx = candidates[k] as number;
          grid[idx] = { ...(grid[idx] as Tile), lockedTurns: e.turns };
          candidates = candidates.filter((c) => c !== idx);
        }
        s = { ...s, rng, encounter: { ...s.encounter, grid, selection: [] } };
        break;
      }
      case 'scramble': {
        s = scramble(s, ctx);
        scrambled = true;
        break;
      }
      case 'addFlat':
      case 'addMult':
      case 'letterBonus':
      case 'reduceDamage':
      case 'vowelWeight':
      case 'condition':
        break;
    }
  }
  return { state: s, healed, playerDamage, enemyDamage, scrambled };
}

function scramble(state: RunState, ctx: EngineContext): RunState {
  if (!state.encounter) return state;
  const [grid, rng] = freshGrid(state.rng, ctx.solver, vowelWeight(state, ctx));
  return { ...state, rng, encounter: { ...state.encounter, grid, selection: [] } };
}

// ---------- encounter lifecycle ----------

function startEncounter(state: RunState, ctx: EngineContext): RunState {
  const def = ctx.content.encounters[state.encounterIndex];
  if (!def) throw new Error(`no encounter def at index ${state.encounterIndex}`);
  const pool = def.boss ? ctx.content.bosses : ctx.content.enemies;
  const [enemyDef, rng1] = pick(state.rng, pool);
  const maxHp = Math.round(enemyDef.hp * def.hpScale);
  const s1: RunState = withRng(state, rng1);
  const [grid, rng] = freshGrid(rng1, ctx.solver, vowelWeight(s1, ctx));
  const encounter: Encounter = {
    enemy: { id: enemyDef.id, hp: maxHp, maxHp, damage: Math.round(enemyDef.damage * def.damageScale) },
    grid,
    selection: [],
    turn: 1,
    playerHpAtStart: state.player.hp,
  };
  const s2: RunState = {
    ...s1,
    rng,
    phase: 'fight',
    encounter,
    offer: null,
    rejected: null,
    stats: { ...state.stats, hpAtEncounterStart: [...state.stats.hpAtEncounterStart, state.player.hp] },
  };
  return turnStart(s2, ctx, EMPTY_REPORT);
}

/** onTurnStart effects, then check whether they killed the enemy. */
function turnStart(state: RunState, ctx: EngineContext, report: TurnReport): RunState {
  const effects = collectEffects('onTurnStart', state.player.items, ctx.content, conditionCtx(state));
  const a = applyEffects(state, effects, ctx);
  const s: RunState = {
    ...a.state,
    lastTurn: { ...report, healed: report.healed + a.healed, damage: report.damage + a.enemyDamage },
    stats: { ...a.state.stats, damageDealt: a.state.stats.damageDealt + a.enemyDamage },
  };
  if (s.encounter && s.encounter.enemy.hp <= 0) return endEncounter(s, ctx);
  return s;
}

function endEncounter(state: RunState, ctx: EngineContext): RunState {
  const effects = collectEffects('onEncounterEnd', state.player.items, ctx.content, conditionCtx(state));
  const a = applyEffects(state, effects, ctx);
  const s: RunState = {
    ...a.state,
    lastTurn: { ...(a.state.lastTurn ?? EMPTY_REPORT), enemyDefeated: true, healed: (a.state.lastTurn?.healed ?? 0) + a.healed },
  };
  const last = s.encounterIndex >= ctx.content.encounters.length - 1;
  if (last) return { ...s, phase: 'summary', outcome: 'won', encounter: null, offer: null };
  return makeOffer(s, ctx);
}

function makeOffer(state: RunState, ctx: EngineContext): RunState {
  const owned = new Set(state.player.items);
  let pool = ctx.content.items.filter((i) => !owned.has(i.id));
  const offer: string[] = [];
  let rng = state.rng;
  while (offer.length < OFFER_SIZE && pool.length > 0) {
    let chosen;
    [chosen, rng] = weightedPick(
      rng,
      pool.map((item) => ({ item, weight: RARITY_WEIGHT[item.rarity] })),
    );
    offer.push(chosen.id);
    pool = pool.filter((i) => i.id !== chosen.id);
  }
  const s = withRng(state, rng);
  if (offer.length === 0) return startEncounter({ ...s, encounterIndex: s.encounterIndex + 1, encounter: null }, ctx);
  return { ...s, phase: 'pick', offer, encounter: null };
}

// ---------- actions ----------

function toggleTile(state: RunState, index: number): RunState {
  const enc = state.encounter;
  if (state.phase !== 'fight' || !enc) return reject(state, 'not in a fight');
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE) return reject(state, 'bad tile index');
  const tile = enc.grid[index] as Tile;
  if (tile.lockedTurns > 0) return reject(state, 'tile is locked');
  const selection = enc.selection.includes(index) ? enc.selection.filter((i) => i !== index) : [...enc.selection, index];
  return { ...state, rejected: null, encounter: { ...enc, selection } };
}

export function selectedWord(state: RunState): string {
  const enc = state.encounter;
  if (!enc) return '';
  return enc.selection.map((i) => (enc.grid[i] as Tile).letter).join('');
}

function submitWord(state: RunState, ctx: EngineContext): RunState {
  const enc = state.encounter;
  if (state.phase !== 'fight' || !enc) return reject(state, 'not in a fight');
  if (new Set(enc.selection).size !== enc.selection.length) return reject(state, 'duplicate tile');
  if (enc.selection.some((i) => (enc.grid[i] as Tile).lockedTurns > 0)) return reject(state, 'tile is locked');
  const word = selectedWord(state);
  if (!ctx.dictionary.has(word)) return reject(state, word.length < 3 ? 'too short' : 'not a word');

  // Player attack.
  const effects = collectEffects('onWordScored', state.player.items, ctx.content, conditionCtx(state, word));
  const score = scoreWord(word, effects, ctx.content.tuning);
  const enemyHp = Math.max(0, enc.enemy.hp - score.damage);
  let s: RunState = {
    ...state,
    rejected: null,
    encounter: { ...enc, enemy: { ...enc.enemy, hp: enemyHp } },
    stats: {
      ...state.stats,
      turns: state.stats.turns + 1,
      damageDealt: state.stats.damageDealt + (enc.enemy.hp - enemyHp),
      bestWord: score.damage > state.stats.bestWordDamage ? word : state.stats.bestWord,
      bestWordDamage: Math.max(score.damage, state.stats.bestWordDamage),
    },
  };
  const extras = applyEffects(s, effects, ctx);
  s = extras.state;
  let report: TurnReport = {
    ...EMPTY_REPORT,
    word,
    base: score.base,
    mult: score.mult,
    damage: enc.enemy.hp - enemyHp + extras.enemyDamage,
    healed: extras.healed,
    scrambled: extras.scrambled,
  };
  s = { ...s, lastTurn: report, stats: { ...s.stats, damageDealt: s.stats.damageDealt + extras.enemyDamage } };
  if (s.encounter && s.encounter.enemy.hp <= 0) return endEncounter(s, ctx);

  // Enemy turn.
  const enc2 = s.encounter as Encounter;
  const enemyDef = [...ctx.content.enemies, ...ctx.content.bosses].find((e) => e.id === enc2.enemy.id);
  if (!enemyDef) throw new Error(`unknown enemy ${enc2.enemy.id}`);
  let enemyDamage = 0;
  if (enc2.turn % enemyDef.attackEvery === 0) {
    const taken = collectEffects('onDamageTaken', s.player.items, ctx.content, conditionCtx(s));
    let dmg = enc2.enemy.damage;
    for (const e of taken) if (e.type === 'reduceDamage') dmg = Math.max(0, dmg - e.value);
    const hp = clampHp(s.player.hp - dmg, s.player.maxHp);
    enemyDamage = s.player.hp - hp;
    s = { ...s, player: { ...s.player, hp }, stats: { ...s.stats, damageTaken: s.stats.damageTaken + enemyDamage } };
    const after = applyEffects(s, taken, ctx);
    s = after.state;
    report = { ...report, healed: report.healed + after.healed };
  }
  if (enemyDef.special && enc2.turn % enemyDef.special.every === 0) {
    const special = resolveEffects(enemyDef.special.effects, conditionCtx(s));
    const a = applyEffects(s, special, ctx);
    s = a.state;
    enemyDamage += a.playerDamage;
    s = { ...s, stats: { ...s.stats, damageTaken: s.stats.damageTaken + a.playerDamage } };
    report = { ...report, scrambled: report.scrambled || a.scrambled };
  }
  report = { ...report, enemyDamage };
  if (s.player.hp <= 0) {
    return { ...s, phase: 'summary', outcome: 'lost', encounter: null, offer: null, lastTurn: report };
  }

  // Refill, tick locks, guard against a dead grid.
  const enc3 = s.encounter as Encounter;
  const used = enc.selection;
  const [refilled, rng] = refill(s.rng, enc3.grid, used, vowelWeight(s, ctx));
  const grid = refilled.map((t) => (t.lockedTurns > 0 ? { ...t, lockedTurns: t.lockedTurns - 1 } : t));
  s = { ...s, rng, encounter: { ...enc3, grid, selection: [], turn: enc3.turn + 1 } };
  if (isDead(grid, ctx.solver)) {
    s = scramble(s, ctx);
    report = { ...report, scrambled: true };
  }
  return turnStart(s, ctx, report);
}

function pickItem(state: RunState, index: number, ctx: EngineContext): RunState {
  if (state.phase !== 'pick' || !state.offer) return reject(state, 'not picking');
  const id = state.offer[index];
  if (id === undefined) return reject(state, 'bad offer index');
  itemDef(ctx.content, id); // throws on unknown id
  const s: RunState = {
    ...state,
    rejected: null,
    player: { ...state.player, items: [...state.player.items, id] },
    offer: null,
    encounterIndex: state.encounterIndex + 1,
  };
  return startEncounter(s, ctx);
}
