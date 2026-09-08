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
 *     -> attack on its cadence: a stun consumes itself and skips the hit; otherwise
 *        onDamageTaken (reduceDamage first), then the shield absorbs, then hp
 *     -> special on its cadence (bosses)
 *     -> if player dead: lose
 *   refill used tiles (onTileDraw vowelWeight / letterWeight), settle columns (gravity), tick locks, dead-grid scramble
 *   next turn: onTurnStart effects; if enemy dead: same as above
 *     -> poison ticks on the enemy (value, then value-1 ...); if enemy dead: same as above
 *     -> venom bites the player; if player dead: lose
 *
 * shuffle: redraw every unlocked tile, count a turn, then the enemy turn and end of
 *   turn above with nothing refilled (Dean, 2026-09-08: a shuffle costs the turn).
 *   With a free shuffle charge (effects wave): redraw, dead-grid guard, and nothing else;
 *   the turn does not advance and the enemy does not act.
 *
 * pickItem: the item's onPick effects fire once, player-side only (no encounter exists).
 *
 * Conditions on onDamageTaken see the player's HP *before* the hit.
 */
import type { Dictionary } from './dictionary';
import { resolveEffects, type ConditionContext, type Effect } from './effects';
import { freshGrid, isDead, playableIndices, refill, settle, type LetterBias } from './grid';
import { cellDef, collectEffects, itemDef } from './hooks';
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
  | { readonly type: 'newRun'; readonly seed: number; readonly cell?: string }
  | { readonly type: 'toggleTile'; readonly index: number }
  | { readonly type: 'clearSelection' }
  | { readonly type: 'submitWord' }
  | { readonly type: 'pickItem'; readonly index: number }
  | { readonly type: 'shuffle' };

/**
 * 4 since starting cells (RunState.cell); a v3 save is MIGRATED by persist.ts, not dropped: it
 * loads as the balanced cell (Dean, 2026-09-08, question 3). 3 was the effects wave (v2 dropped),
 * 2 the tuning wave (v1 dropped).
 */
export const SAVE_VERSION = 4;
/** The cell a run gets when none is named: the game as it was before cells. */
export const DEFAULT_CELL_ID = 'balanced';
export const OFFER_SIZE = 3;
export const RARITY_WEIGHT = { common: 3, uncommon: 2, rare: 1, mythic: 0.35 } as const;

const EMPTY_REPORT: TurnReport = {
  word: '',
  base: 0,
  mult: 1,
  damage: 0,
  enemyDamage: 0,
  healed: 0,
  scrambled: false,
  used: [],
  venom: 0,
  enemyDefeated: false,
  poison: 0,
  stunned: false,
  shielded: 0,
  redrawn: [],
};

// ---------- entry points ----------

export function newRun(seed: number, ctx: EngineContext, cellId: string = DEFAULT_CELL_ID): RunState {
  const cell = cellDef(ctx.content, cellId); // throws on an unknown id
  for (const id of cell.startingItems) itemDef(ctx.content, id);
  const maxHp = cell.maxHp;
  const state: RunState = {
    v: 4,
    cell: cell.id,
    rng: createRng(seed),
    phase: 'fight',
    encounterIndex: 0,
    player: { hp: maxHp, maxHp, items: [...cell.startingItems], shield: 0, freeShuffles: 0 },
    encounter: null,
    offer: null,
    outcome: null,
    lastTurn: null,
    rejected: null,
    pendingPicks: Math.max(0, Math.floor(ctx.content.tuning.startingPicks) + Math.max(0, Math.floor(cell.extraPicks))),
    stats: { turns: 0, damageDealt: 0, damageTaken: 0, bestWord: '', bestWordDamage: 0, hpAtEncounterStart: [] },
  };
  // A starting kit (Dean, 2026-09-06, variant B): the run opens on a pick, not a fight.
  return state.pendingPicks > 0 ? makeOffer(state, ctx) : startEncounter(state, ctx);
}

export function reduce(state: RunState, action: Action, ctx: EngineContext): RunState {
  switch (action.type) {
    case 'newRun':
      return newRun(action.seed, ctx, action.cell ?? DEFAULT_CELL_ID);
    case 'toggleTile':
      return toggleTile(state, action.index);
    case 'clearSelection':
      return state.encounter ? { ...state, rejected: null, encounter: { ...state.encounter, selection: [] } } : reject(state, 'no encounter');
    case 'submitWord':
      return submitWord(state, ctx);
    case 'pickItem':
      return pickItem(state, action.index, ctx);
    case 'shuffle':
      return shuffle(state, ctx);
  }
}

// ---------- helpers ----------

function reject(state: RunState, reason: string): RunState {
  return { ...state, rejected: reason };
}

/** Everything a condition or perUnit can see. Shared with candidates.ts so the preview matches the hit. */
export function conditionCtx(state: RunState, ctx: EngineContext, word?: string): ConditionContext {
  const enc = state.encounter;
  const base: ConditionContext = {
    hp: state.player.hp,
    maxHp: state.player.maxHp,
    turn: enc?.turn ?? 0,
    items: state.player.items.length,
    venomedTiles: enc ? enc.grid.filter((t) => t.venom > 0).length : 0,
    lockedTiles: enc ? enc.grid.filter((t) => t.lockedTurns > 0).length : 0,
    perUnitMultCap: ctx.content.tuning.perUnitMultCap,
  };
  const withEnemy = enc ? { ...base, enemyHp: enc.enemy.hp, enemyMaxHp: enc.enemy.maxHp } : base;
  return word === undefined ? withEnemy : { ...withEnemy, word };
}

/** onTileDraw effects folded into one per-letter multiplier: vowelWeight on the vowels, letterWeight on its letters. */
function letterBias(state: RunState, ctx: EngineContext): LetterBias {
  const bias: Record<string, number> = {};
  const bump = (letter: string, value: number) => {
    bias[letter] = (bias[letter] ?? 1) * value;
  };
  for (const e of collectEffects('onTileDraw', state.player.items, ctx.content, conditionCtx(state, ctx), state.cell)) {
    if (e.type === 'vowelWeight') for (const v of 'aeiou') bump(v, e.value);
    if (e.type === 'letterWeight') for (const l of new Set(e.letters)) if (l >= 'a' && l <= 'z') bump(l, e.value);
  }
  return bias;
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
  readonly redrawn: readonly number[];
}

/**
 * Apply resolved, non-scoring effects in the order given (already EFFECT_ORDER).
 * reduceDamage, vowelWeight and letterWeight are read elsewhere and ignored here.
 * `dealt` is the damage the word just did, for lifesteal; 0 outside onWordScored.
 */
function applyEffects(state: RunState, effects: readonly Effect[], ctx: EngineContext, dealt = 0): Applied {
  let s = state;
  let healed = 0;
  let playerDamage = 0;
  let enemyDamage = 0;
  let scrambled = false;
  let redrawn: number[] = [];
  const tuning = ctx.content.tuning;
  for (const e of effects) {
    switch (e.type) {
      case 'heal': {
        const hp = clampHp(s.player.hp + e.value, s.player.maxHp);
        healed += hp - s.player.hp;
        s = { ...s, player: { ...s.player, hp } };
        break;
      }
      case 'lifesteal': {
        const hp = clampHp(s.player.hp + Math.floor(dealt * e.fraction), s.player.maxHp);
        healed += hp - s.player.hp;
        s = { ...s, player: { ...s.player, hp } };
        break;
      }
      case 'maxHp': {
        // Grow the ceiling and fill the new room; a negative value shrinks both, never below 1.
        const maxHp = Math.max(1, s.player.maxHp + e.value);
        const hp = clampHp(s.player.hp + Math.max(0, e.value), maxHp);
        healed += Math.max(0, hp - s.player.hp);
        s = { ...s, player: { ...s.player, hp, maxHp } };
        break;
      }
      case 'shield': {
        const shield = Math.max(0, Math.min(tuning.shieldMax, s.player.shield + e.value));
        s = { ...s, player: { ...s.player, shield } };
        break;
      }
      case 'freeShuffle': {
        s = { ...s, player: { ...s.player, freeShuffles: Math.max(0, s.player.freeShuffles + e.value) } };
        break;
      }
      case 'poisonEnemy': {
        if (!s.encounter) break;
        const poison = Math.max(0, Math.min(tuning.poisonMax, s.encounter.enemy.poison + e.value));
        s = { ...s, encounter: { ...s.encounter, enemy: { ...s.encounter.enemy, poison } } };
        break;
      }
      case 'stun': {
        if (!s.encounter) break;
        const stunned = Math.max(0, s.encounter.enemy.stunned + e.value);
        s = { ...s, encounter: { ...s.encounter, enemy: { ...s.encounter.enemy, stunned } } };
        break;
      }
      case 'redrawTiles': {
        if (!s.encounter) break;
        // In place, no settle: the letters change under the player's eyes. The selection is left
        // alone (it is the word being played, or the player's work in progress at turn start).
        const played = new Set(s.encounter.selection);
        let candidates = playableIndices(s.encounter.grid).filter((i) => !played.has(i));
        let rng = s.rng;
        const chosen: number[] = [];
        for (let n = 0; n < e.count && candidates.length > 0; n++) {
          let k: number;
          [k, rng] = nextInt(rng, candidates.length);
          const idx = candidates[k] as number;
          chosen.push(idx);
          candidates = candidates.filter((c) => c !== idx);
        }
        if (chosen.length === 0) break;
        const [grid, rng2] = refill(rng, s.encounter.grid, chosen, letterBias(s, ctx));
        redrawn = [...redrawn, ...chosen];
        s = { ...s, rng: rng2, encounter: { ...s.encounter, grid } };
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
        // The special fires before the refill, so the tiles of the word just played are still
        // on the grid; a lock on one of them would be overwritten by the refill (tracker #5).
        const played = new Set(s.encounter.selection);
        let candidates = playableIndices(grid).filter((i) => !played.has(i));
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
      case 'venomTiles': {
        if (!s.encounter) break;
        const grid = s.encounter.grid.slice();
        let rng = s.rng;
        const played = new Set(s.encounter.selection);
        let candidates = playableIndices(grid).filter((i) => !played.has(i) && (grid[i] as Tile).venom === 0);
        for (let n = 0; n < e.count && candidates.length > 0; n++) {
          let k: number;
          [k, rng] = nextInt(rng, candidates.length);
          const idx = candidates[k] as number;
          grid[idx] = { ...(grid[idx] as Tile), venom: e.value };
          candidates = candidates.filter((c) => c !== idx);
        }
        s = { ...s, rng, encounter: { ...s.encounter, grid } };
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
      case 'letterWeight':
      case 'condition':
      case 'perUnit':
        break;
    }
  }
  return { state: s, healed, playerDamage, enemyDamage, scrambled, redrawn };
}

function scramble(state: RunState, ctx: EngineContext): RunState {
  if (!state.encounter) return state;
  const [grid, rng] = freshGrid(state.rng, ctx.solver, letterBias(state, ctx));
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
  const [grid, rng] = freshGrid(rng1, ctx.solver, letterBias(s1, ctx));
  const encounter: Encounter = {
    enemy: { id: enemyDef.id, hp: maxHp, maxHp, damage: Math.round(enemyDef.damage * def.damageScale), poison: 0, stunned: 0 },
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

/**
 * onTurnStart effects, then poison ticks on the enemy, then venom bites the player. Poison goes
 * first so a poison that finishes the enemy ends the fight before the venom bites.
 */
function turnStart(state: RunState, ctx: EngineContext, report: TurnReport): RunState {
  const effects = collectEffects('onTurnStart', state.player.items, ctx.content, conditionCtx(state, ctx), state.cell);
  const a = applyEffects(state, effects, ctx);
  let s: RunState = {
    ...a.state,
    lastTurn: {
      ...report,
      healed: report.healed + a.healed,
      damage: report.damage + a.enemyDamage,
      redrawn: [...report.redrawn, ...a.redrawn],
    },
    stats: { ...a.state.stats, damageDealt: a.state.stats.damageDealt + a.enemyDamage },
  };
  if (s.encounter && s.encounter.enemy.hp <= 0) return endEncounter(s, ctx);
  s = poisonTick(s);
  if (s.encounter && s.encounter.enemy.hp <= 0) return endEncounter(s, ctx);
  s = venomBite(s, ctx.content.tuning.venomMax);
  if (s.player.hp <= 0) return { ...s, phase: 'summary', outcome: 'lost', encounter: null, offer: null };
  return s;
}

/** The enemy takes its poison, then the poison shrinks by one. */
function poisonTick(state: RunState): RunState {
  const enc = state.encounter;
  if (!enc || enc.enemy.poison <= 0) return state;
  const hp = Math.max(0, enc.enemy.hp - enc.enemy.poison);
  const dealt = enc.enemy.hp - hp;
  return {
    ...state,
    encounter: { ...enc, enemy: { ...enc.enemy, hp, poison: enc.enemy.poison - 1 } },
    lastTurn: { ...(state.lastTurn ?? EMPTY_REPORT), poison: dealt, damage: (state.lastTurn?.damage ?? 0) + dealt },
    stats: { ...state.stats, damageDealt: state.stats.damageDealt + dealt },
  };
}

/** Every venomous tile bites for its venom, then grows by one. A tile is cured only by leaving the grid. */
function venomBite(state: RunState, venomMax: number): RunState {
  const enc = state.encounter;
  if (!enc) return state;
  const bite = enc.grid.reduce((sum, t) => sum + t.venom, 0);
  if (bite === 0) return state;
  const hp = clampHp(state.player.hp - bite, state.player.maxHp);
  const taken = state.player.hp - hp;
  const grid = enc.grid.map((t) => (t.venom > 0 ? { ...t, venom: Math.min(t.venom + 1, Math.max(1, venomMax)) } : t));
  return {
    ...state,
    player: { ...state.player, hp },
    encounter: { ...enc, grid },
    lastTurn: { ...(state.lastTurn ?? EMPTY_REPORT), venom: taken },
    stats: { ...state.stats, damageTaken: state.stats.damageTaken + taken },
  };
}

function endEncounter(state: RunState, ctx: EngineContext): RunState {
  const effects = collectEffects('onEncounterEnd', state.player.items, ctx.content, conditionCtx(state, ctx), state.cell);
  const a = applyEffects(state, effects, ctx);
  const s: RunState = {
    ...a.state,
    lastTurn: { ...(a.state.lastTurn ?? EMPTY_REPORT), enemyDefeated: true, healed: (a.state.lastTurn?.healed ?? 0) + a.healed },
  };
  const last = s.encounterIndex >= ctx.content.encounters.length - 1;
  if (last) return { ...s, phase: 'summary', outcome: 'won', encounter: null, offer: null };
  return makeOffer(s, ctx);
}

/** An offer holds at most this many commons (Dean, 2026-09-08, question 2): a pick always has something in it. */
export const MAX_COMMONS_PER_OFFER = 2;

function makeOffer(state: RunState, ctx: EngineContext): RunState {
  const owned = new Set(state.player.items);
  let pool = ctx.content.items.filter((i) => !owned.has(i.id));
  const offer: string[] = [];
  let commons = 0;
  let rng = state.rng;
  while (offer.length < OFFER_SIZE && pool.length > 0) {
    const eligible = commons >= MAX_COMMONS_PER_OFFER && pool.some((i) => i.rarity !== 'common') ? pool.filter((i) => i.rarity !== 'common') : pool;
    let chosen;
    [chosen, rng] = weightedPick(
      rng,
      eligible.map((item) => ({ item, weight: RARITY_WEIGHT[item.rarity] })),
    );
    if (chosen.rarity === 'common') commons++;
    offer.push(chosen.id);
    pool = pool.filter((i) => i.id !== chosen.id);
  }
  const s = withRng(state, rng);
  if (offer.length === 0) return advance({ ...s, encounter: null }, ctx);
  return { ...s, phase: 'pick', offer, encounter: null };
}

/** After a pick (or an empty offer): consume a pending starting pick, or move to the next encounter. */
function advance(state: RunState, ctx: EngineContext): RunState {
  if (state.pendingPicks > 0) {
    const s = { ...state, pendingPicks: state.pendingPicks - 1 };
    return s.pendingPicks > 0 ? makeOffer(s, ctx) : startEncounter(s, ctx);
  }
  return startEncounter({ ...state, encounterIndex: state.encounterIndex + 1 }, ctx);
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
  const effects = collectEffects('onWordScored', state.player.items, ctx.content, conditionCtx(state, ctx, word), state.cell);
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
  const extras = applyEffects(s, effects, ctx, enc.enemy.hp - enemyHp);
  s = extras.state;
  const report: TurnReport = {
    ...EMPTY_REPORT,
    word,
    base: score.base,
    mult: score.mult,
    damage: enc.enemy.hp - enemyHp + extras.enemyDamage,
    healed: extras.healed,
    scrambled: extras.scrambled,
    used: enc.selection,
    redrawn: extras.redrawn,
  };
  s = { ...s, lastTurn: report, stats: { ...s.stats, damageDealt: s.stats.damageDealt + extras.enemyDamage } };
  if (s.encounter && s.encounter.enemy.hp <= 0) return endEncounter(s, ctx);

  const after = enemyTurn(s, ctx, report);
  if (after.state.phase === 'summary') return after.state;
  return endTurn(after.state, ctx, after.report, enc.selection);
}

/**
 * The enemy's half of a turn: attack on its cadence (reduced by onDamageTaken items),
 * then its special. Returns the summary state on a kill so callers stop there.
 */
function enemyTurn(state: RunState, ctx: EngineContext, report: TurnReport): { state: RunState; report: TurnReport } {
  let s = state;
  const enc2 = s.encounter as Encounter;
  const enemyDef = [...ctx.content.enemies, ...ctx.content.bosses].find((e) => e.id === enc2.enemy.id);
  if (!enemyDef) throw new Error(`unknown enemy ${enc2.enemy.id}`);
  let enemyDamage = 0;
  if (enc2.turn % enemyDef.attackEvery === 0) {
    if (enc2.enemy.stunned > 0) {
      // A stun eats the attack. The special below still fires: a stun is not a silence.
      s = { ...s, encounter: { ...enc2, enemy: { ...enc2.enemy, stunned: enc2.enemy.stunned - 1 } } };
      report = { ...report, stunned: true };
    } else {
      const taken = collectEffects('onDamageTaken', s.player.items, ctx.content, conditionCtx(s, ctx), s.cell);
      let dmg = enc2.enemy.damage;
      for (const e of taken) if (e.type === 'reduceDamage') dmg = Math.max(0, dmg - e.value);
      // The shield absorbs what reduction left, then HP takes the rest.
      const shielded = Math.min(s.player.shield, dmg);
      dmg -= shielded;
      const hp = clampHp(s.player.hp - dmg, s.player.maxHp);
      enemyDamage = s.player.hp - hp;
      s = {
        ...s,
        player: { ...s.player, hp, shield: s.player.shield - shielded },
        stats: { ...s.stats, damageTaken: s.stats.damageTaken + enemyDamage },
      };
      const after = applyEffects(s, taken, ctx);
      s = after.state;
      report = { ...report, healed: report.healed + after.healed, shielded };
    }
  }
  if (enemyDef.special && (s.encounter as Encounter).turn % enemyDef.special.every === 0) {
    const special = resolveEffects(enemyDef.special.effects, conditionCtx(s, ctx));
    const a = applyEffects(s, special, ctx);
    s = a.state;
    enemyDamage += a.playerDamage;
    s = { ...s, stats: { ...s.stats, damageTaken: s.stats.damageTaken + a.playerDamage } };
    report = { ...report, scrambled: report.scrambled || a.scrambled };
  }
  report = { ...report, enemyDamage };
  if (s.player.hp <= 0) {
    return { state: { ...s, phase: 'summary', outcome: 'lost', encounter: null, offer: null, lastTurn: report }, report };
  }
  return { state: s, report };
}

/** End of a turn: refill the used tiles, tick locks, guard against a dead grid, then the next turn starts. */
function endTurn(state: RunState, ctx: EngineContext, report: TurnReport, used: readonly number[]): RunState {
  let s = state;
  const enc3 = s.encounter as Encounter;
  const [refilled, rng] = used.length > 0 ? refill(s.rng, enc3.grid, used, letterBias(s, ctx)) : [enc3.grid, s.rng];
  // Gravity: survivors rise, fresh tiles land at the bottom of their column.
  const settled = used.length > 0 ? settle(refilled, used) : refilled;
  const grid = settled.map((t) => (t.lockedTurns > 0 ? { ...t, lockedTurns: t.lockedTurns - 1 } : t));
  s = { ...s, rng, encounter: { ...enc3, grid, selection: [], turn: enc3.turn + 1 } };
  if (isDead(grid, ctx.solver)) {
    s = scramble(s, ctx);
    // freshGrid replaced every tile, locks included; tell the UI so it animates the whole grid.
    report = { ...report, scrambled: true, used: Array.from({ length: GRID_SIZE }, (_, i) => i) };
  }
  return turnStart(s, ctx, report);
}

/**
 * Shuffle (Dean, 2026-09-08): redraw every unlocked tile and give the turn to the enemy,
 * as if a word had been played for zero damage. Locked tiles stay locked, so a shuffle
 * never answers a boss's lock. The redraw goes through refill, the same RNG-threaded
 * path a played word uses, and the dead-grid guard still applies afterwards.
 */
function shuffle(state: RunState, ctx: EngineContext): RunState {
  const enc = state.encounter;
  if (state.phase !== 'fight' || !enc) return reject(state, 'not in a fight');
  const unlocked = enc.grid.map((t, i) => (t.lockedTurns > 0 ? -1 : i)).filter((i) => i >= 0);
  const [refilled, rng] = refill(state.rng, enc.grid, unlocked, letterBias(state, ctx));
  const grid = settle(refilled, unlocked);
  if (state.player.freeShuffles > 0) {
    // A free shuffle (effects wave): the grid changes and nothing else does. No enemy turn, no
    // turn advance, no venom bite; only the dead-grid guard, which never leaves a player stuck.
    let free: RunState = {
      ...state,
      rng,
      rejected: null,
      player: { ...state.player, freeShuffles: state.player.freeShuffles - 1 },
      encounter: { ...enc, grid, selection: [] },
    };
    let report: TurnReport = { ...EMPTY_REPORT, scrambled: true, used: unlocked };
    if (isDead(grid, ctx.solver)) {
      free = scramble(free, ctx);
      report = { ...report, used: Array.from({ length: GRID_SIZE }, (_, i) => i) };
    }
    return { ...free, lastTurn: report };
  }
  const s: RunState = {
    ...state,
    rng,
    rejected: null,
    encounter: { ...enc, grid, selection: [] },
    stats: { ...state.stats, turns: state.stats.turns + 1 },
  };
  const report: TurnReport = { ...EMPTY_REPORT, scrambled: true, used: unlocked };
  const after = enemyTurn(s, ctx, report);
  if (after.state.phase === 'summary') return after.state;
  return endTurn(after.state, ctx, after.report, []);
}

function pickItem(state: RunState, index: number, ctx: EngineContext): RunState {
  if (state.phase !== 'pick' || !state.offer) return reject(state, 'not picking');
  const id = state.offer[index];
  if (id === undefined) return reject(state, 'bad offer index');
  const def = itemDef(ctx.content, id); // throws on unknown id
  let s: RunState = {
    ...state,
    rejected: null,
    player: { ...state.player, items: [...state.player.items, id] },
    offer: null,
  };
  // onPick (effects wave): this item's own once-only effects. No encounter exists here, so
  // enemy and grid effects are no-ops; heal, maxHp, shield and freeShuffle land.
  const onPick = resolveEffects(def.hooks.onPick ?? [], conditionCtx(s, ctx));
  if (onPick.length > 0) {
    const a = applyEffects(s, onPick, ctx);
    s = { ...a.state, lastTurn: { ...(a.state.lastTurn ?? EMPTY_REPORT), healed: (a.state.lastTurn?.healed ?? 0) + a.healed } };
  }
  return advance(s, ctx);
}
