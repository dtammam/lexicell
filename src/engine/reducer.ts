/**
 * The only place run state changes. `reduce(state, action, ctx)` returns a
 * new state; nothing here or elsewhere mutates. The RNG lives in state and is
 * threaded through every random decision, so seed + action log = the run.
 *
 * Turn order, fixed:
 *   player submits word
 *     -> scoring, plus the gold on the tiles played (step 4); armour halves it (floored) when the
 *        word is shorter than the enemy's armour
 *     -> onWordScored effects (heal/damage extras; lifesteal reads what landed)
 *     -> enemy takes damage; if dead: onEncounterEnd, then pick or win
 *   enemy turn
 *     -> attack on its cadence: a stun consumes itself and skips the hit (unless the enemy is
 *        enraged, past tuning.enrageAfter: then it attacks through the stun); otherwise
 *        the hit is rolled inside hitRange(damage, variance) with one RNG draw (none when the
 *        range is a single value), then onDamageTaken's reduceDamage, then the shield absorbs,
 *        then hp; 0 HP is death right there, before the rest of onDamageTaken (heals) fires
 *     -> special on its cadence (bosses)
 *     -> if player dead: lose
 *   refill used tiles (onTileDraw vowelWeight / letterWeight), settle columns (gravity), tick locks,
 *   tick cracks (a tile at 1 crumbles: refilled and settled), dead-grid scramble
 *   next turn: onTurnStart effects; if enemy dead: same as above
 *     -> enemy traits tick from turn 2: regen heals it (never above max), hunger and the enrage
 *        clock grow its damage. Regen goes before poison, so a regenerating enemy can out-heal
 *        the poison on it (pinned by test; Dean's call if it should flip)
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
 * Evolution (variety wave step 3): when a boss falls short of the last slot, three traits the
 * player lacks are offered (phase 'evolve'); pickTrait keeps one for the run on player.traits,
 * gathered after the cell and before the items in every hook, then the item offer follows.
 *
 * Modes (variety wave step 5): Normal ends on the ninth slot's boss; Endless continues past it
 * on a generated curve (encounterDefFor) with the act-3 pools, a boss every third slot, an
 * evolve after each, and one detour per block of three drawn as the block is reached
 * (extendKinds); it ends only when the player falls.
 *
 * Slots (variety wave step 2): newRun places one elite, one rest and one event among the non-boss
 * slots after the first, drawn from the run RNG (three draws) before the starting kit. An elite
 * slot is a fight against the next act's pool at this slot's scale (act 3: an act-3 enemy scaled
 * by tuning.eliteHpScale/eliteDamageScale) whose offer carries a guaranteed rare. A rest slot is a
 * screen: restHeal (tuning.restHeal of max HP) or pickItem from a normal three-offer. An event slot
 * draws one of content.events (one draw) and eventChoice applies the chosen trade's player-side
 * effects, never below 1 HP, then a rare-guaranteed pick if the choice says so. Rest and event
 * slots count as encounters reached (stats.hpAtEncounterStart gets an entry).
 *
 * Conditions on onDamageTaken see the player's HP *before* the hit.
 */
import type { Dictionary } from './dictionary';
import { resolveEffects, type ConditionContext, type Effect } from './effects';
import { freshGrid, isDead, playableIndices, refill, settle, type LetterBias } from './grid';
import { cellDef, collectEffects, itemDef, traitDef } from './hooks';
import { createRng, nextInt, pick, weightedPick, type Rng } from './rng';
import { scoreWord } from './scoring';
import type { Solver } from './solver';
import { GRID_SIZE, type Content, type Encounter, type EncounterDef, type EncounterKind, type EnemyDef, type EventDef, type Rarity, type RunMode, type RunState, type Tile, type TraitDef, type TurnReport } from './types';

export interface EngineContext {
  readonly dictionary: Dictionary;
  readonly solver: Solver;
  readonly content: Content;
}

export type Action =
  | { readonly type: 'newRun'; readonly seed: number; readonly cell?: string; readonly mode?: RunMode }
  | { readonly type: 'toggleTile'; readonly index: number }
  | { readonly type: 'clearSelection' }
  | { readonly type: 'submitWord' }
  | { readonly type: 'pickItem'; readonly index: number }
  /* Variety wave step 6: leave a cursed offer entirely (valid only on a cursed pick). */
  | { readonly type: 'skipOffer' }
  | { readonly type: 'shuffle' }
  /* Variety wave step 2: the rest screen's heal (its pick is pickItem), and an event's choice. */
  | { readonly type: 'restHeal' }
  | { readonly type: 'eventChoice'; readonly index: number }
  /* Variety wave step 3: the trait pick after a boss. */
  | { readonly type: 'pickTrait'; readonly index: number };

/**
 * 10 since curses (RunState.curses; variety wave step 6); a v9 save is MIGRATED by persist.ts with
 * curses null. 9 was modes (mode), 8 grid rules (Tile.gold, Tile.cracked), 7 evolution
 * (player.traits), 6 encounter types (kinds, event), 5 the stats HUD (worstWord), 4 starting cells,
 * 3 the effects wave (v2 dropped), 2 the tuning wave (v1 dropped); v3 to v9 all migrate forward.
 */
export const SAVE_VERSION = 10;
/** The mode a run gets when none is named. */
export const DEFAULT_MODE: RunMode = 'normal';
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
  gold: 0,
  crumbled: 0,
};

// ---------- entry points ----------

export function newRun(seed: number, ctx: EngineContext, cellId: string = DEFAULT_CELL_ID, mode: RunMode = DEFAULT_MODE): RunState {
  const cell = cellDef(ctx.content, cellId); // throws on an unknown id
  for (const id of cell.startingItems) itemDef(ctx.content, id);
  const maxHp = cell.maxHp;
  const [kinds, rng] = placeKinds(createRng(seed), ctx.content);
  const state: RunState = {
    v: 10,
    cell: cell.id,
    mode,
    kinds,
    rng,
    phase: 'fight',
    encounterIndex: 0,
    event: null,
    player: { hp: maxHp, maxHp, items: [...cell.startingItems], traits: [], shield: 0, freeShuffles: 0 },
    encounter: null,
    offer: null,
    curses: null,
    outcome: null,
    lastTurn: null,
    rejected: null,
    pendingPicks: Math.max(0, Math.floor(ctx.content.tuning.startingPicks) + Math.max(0, Math.floor(cell.extraPicks))),
    stats: { turns: 0, damageDealt: 0, damageTaken: 0, bestWord: '', bestWordDamage: 0, worstWord: '', worstWordDamage: 0, hpAtEncounterStart: [] },
  };
  // A starting item is a picked item: its onPick fires here, once, in order (gate W4, cells round).
  let s: RunState = state;
  for (const id of cell.startingItems) {
    const onPick = resolveEffects(itemDef(ctx.content, id).hooks.onPick ?? [], conditionCtx(s, ctx));
    if (onPick.length > 0) s = applyEffects(s, onPick, ctx).state;
  }
  // A starting kit (Dean, 2026-09-06, variant B): the run opens on a pick, not a fight.
  return s.pendingPicks > 0 ? makeOffer(s, ctx) : startEncounter(s, ctx);
}

export function reduce(state: RunState, action: Action, ctx: EngineContext): RunState {
  switch (action.type) {
    case 'newRun':
      return newRun(action.seed, ctx, action.cell ?? DEFAULT_CELL_ID, action.mode ?? DEFAULT_MODE);
    case 'toggleTile':
      return toggleTile(state, action.index);
    case 'clearSelection':
      return state.encounter ? { ...state, rejected: null, encounter: { ...state.encounter, selection: [] } } : reject(state, 'no encounter');
    case 'submitWord':
      return submitWord(state, ctx);
    case 'pickItem':
      return pickItem(state, action.index, ctx);
    case 'skipOffer':
      return skipOffer(state, ctx);
    case 'shuffle':
      return shuffle(state, ctx);
    case 'restHeal':
      return restHeal(state, ctx);
    case 'eventChoice':
      return eventChoice(state, action.index, ctx);
    case 'pickTrait':
      return pickTrait(state, action.index, ctx);
  }
}

/**
 * One elite, one rest and one event among the non-boss slots after the first (slots 2 to 8 of
 * nine: indexes 1, 3, 4, 6, 7), in that order, three draws. Fewer than three eligible slots
 * (a shortened curve in a sim variant) place what fits.
 */
export function placeKinds(rng: Rng, content: Content): [EncounterKind[], Rng] {
  const kinds: EncounterKind[] = content.encounters.map(() => 'fight');
  let open = content.encounters.map((e, i) => (i > 0 && !e.boss ? i : -1)).filter((i) => i >= 0);
  for (const kind of ['elite', 'rest', 'event'] as const) {
    if (open.length === 0) break;
    let k: number;
    [k, rng] = nextInt(rng, open.length);
    const slot = open[k] as number;
    kinds[slot] = kind;
    open = open.filter((i) => i !== slot);
  }
  return [kinds, rng];
}

/** The kind of the slot at `index`; past the placed array (a migrated v5 save) it is a fight. */
export function kindAt(state: RunState, index: number): EncounterKind {
  return state.kinds[index] ?? 'fight';
}

/**
 * The curve at `index`. Inside the content's list it is that slot. Past it (Endless, step 5) the
 * deep is generated: act 3's pools, a boss every third slot (index % 3 === 2, as the content lays
 * them out), the last act's fight or boss scale grown by tuning.endlessHpGrowth /
 * endlessDamageGrowth per slot past the end. Pure: the same index gives the same def, so a save
 * needs nothing new to continue.
 */
export function encounterDefFor(content: Content, index: number): EncounterDef {
  const list = content.encounters;
  const own = list[index];
  if (own) return own;
  const lastAct = Math.max(...list.map((e) => e.act)) as 1 | 2 | 3;
  const boss = index % 3 === 2;
  const base = [...list].reverse().find((e) => e.act === lastAct && e.boss === boss) ?? list[list.length - 1];
  if (!base) throw new Error('no encounters in content');
  const past = index - (list.length - 1);
  const hpScale = base.hpScale * Math.pow(content.tuning.endlessHpGrowth, past);
  const damageScale = base.damageScale * Math.pow(content.tuning.endlessDamageGrowth, past);
  return { act: lastAct, boss, hpScale, damageScale };
}

/** Whether winning the slot at `index` ends the run: only in Normal, on the content's last slot. */
function endsAt(state: RunState, content: Content, index: number): boolean {
  return state.mode !== 'endless' && index >= content.encounters.length - 1;
}

/**
 * Endless slots get their kinds as the run reaches them (step 5): entering the first slot of a
 * generated block of three (two fights, then the boss), one draw picks which of the two
 * non-boss slots is special and one draw picks its kind from elite, rest, event or a plain
 * fight, so every block past the ninth holds at most one detour.
 */
function extendKinds(state: RunState, ctx: EngineContext, index: number): RunState {
  if (index < ctx.content.encounters.length || state.kinds.length > index) return state;
  const blockStart = index - (index % 3);
  const kinds: EncounterKind[] = [...state.kinds];
  while (kinds.length < blockStart) kinds.push('fight');
  const [which, rng1] = nextInt(state.rng, 2);
  const [k, rng] = nextInt(rng1, 4);
  const special = (['elite', 'rest', 'event', 'fight'] as const)[k] ?? 'fight';
  kinds.push(which === 0 ? special : 'fight', which === 1 ? special : 'fight', 'fight');
  return { ...withRng(state, rng), kinds };
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
export function letterBias(state: RunState, ctx: EngineContext): LetterBias {
  const bias: Record<string, number> = {};
  const bump = (letter: string, value: number) => {
    bias[letter] = (bias[letter] ?? 1) * value;
  };
  for (const e of collectEffects('onTileDraw', state.player.items, ctx.content, conditionCtx(state, ctx), state.cell, state.player.traits)) {
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
      case 'goldTiles': {
        if (!s.encounter) break;
        const grid = s.encounter.grid.slice();
        let rng = s.rng;
        const played = new Set(s.encounter.selection);
        let candidates = playableIndices(grid).filter((i) => !played.has(i) && (grid[i] as Tile).gold === 0);
        for (let n = 0; n < e.count && candidates.length > 0; n++) {
          let k: number;
          [k, rng] = nextInt(rng, candidates.length);
          const idx = candidates[k] as number;
          grid[idx] = { ...(grid[idx] as Tile), gold: e.value };
          candidates = candidates.filter((c) => c !== idx);
        }
        s = { ...s, rng, encounter: { ...s.encounter, grid } };
        break;
      }
      case 'crackTiles': {
        if (!s.encounter) break;
        const grid = s.encounter.grid.slice();
        let rng = s.rng;
        const played = new Set(s.encounter.selection);
        let candidates = playableIndices(grid).filter((i) => !played.has(i) && (grid[i] as Tile).cracked === 0);
        for (let n = 0; n < e.count && candidates.length > 0; n++) {
          let k: number;
          [k, rng] = nextInt(rng, candidates.length);
          const idx = candidates[k] as number;
          grid[idx] = { ...(grid[idx] as Tile), cracked: Math.max(1, e.turns) };
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

/** The enemies of an act; falls back to the whole list so a content set without pools still runs. */
function poolFor(list: readonly EnemyDef[], act: number): readonly EnemyDef[] {
  const inAct = list.filter((e) => e.act === act);
  return inAct.length > 0 ? inAct : list;
}

function startEncounter(state0: RunState, ctx: EngineContext): RunState {
  const state = extendKinds(state0, ctx, state0.encounterIndex);
  const def = encounterDefFor(ctx.content, state.encounterIndex);
  const kind = def.boss ? 'fight' : kindAt(state, state.encounterIndex);
  const arrived: RunState = { ...state, stats: { ...state.stats, hpAtEncounterStart: [...state.stats.hpAtEncounterStart, state.player.hp] } };
  if (kind === 'rest') return startRest(arrived, ctx);
  if (kind === 'event') return startEvent(arrived, ctx);
  // An elite (variety wave step 2) comes from the next act's pool; act 3 has none, so its elite
  // is an act-3 enemy scaled up instead.
  const elite = kind === 'elite';
  const lastAct = def.act >= Math.max(...ctx.content.encounters.map((e) => e.act));
  const pool = def.boss ? poolFor(ctx.content.bosses, def.act) : poolFor(ctx.content.enemies, elite && !lastAct ? def.act + 1 : def.act);
  const hpScale = def.hpScale * (elite && lastAct ? ctx.content.tuning.eliteHpScale : 1);
  const damageScale = def.damageScale * (elite && lastAct ? ctx.content.tuning.eliteDamageScale : 1);
  const [enemyDef, rng1] = pick(state.rng, pool);
  const maxHp = Math.round(enemyDef.hp * hpScale);
  const s1: RunState = withRng(arrived, rng1);
  const [grid, rng] = freshGrid(rng1, ctx.solver, letterBias(s1, ctx));
  const encounter: Encounter = {
    enemy: { id: enemyDef.id, hp: maxHp, maxHp, damage: Math.round(enemyDef.damage * damageScale), poison: 0, stunned: 0 },
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
    curses: null,
    rejected: null,
  };
  return turnStart(s2, ctx, EMPTY_REPORT);
}

/** A rest slot: the heal-or-pick screen. The offer is a normal one; with nothing left to offer, the heal stands alone. */
function startRest(state: RunState, ctx: EngineContext): RunState {
  const [offer, rng] = drawOffer(state, ctx);
  return { ...withRng(state, rng), phase: 'rest', encounter: null, offer: offer.length > 0 ? offer : null, curses: null, rejected: null };
}

/** An event slot: one draw picks the event. With no events in content the slot is skipped. */
function startEvent(state: RunState, ctx: EngineContext): RunState {
  if (ctx.content.events.length === 0) return advance(state, ctx);
  const [def, rng] = pick(state.rng, ctx.content.events);
  return { ...withRng(state, rng), phase: 'event', event: def.id, encounter: null, offer: null, curses: null, rejected: null };
}

/** The event by id, or undefined: a save can carry an id that content has since dropped (gate W1). */
function eventDefOf(ctx: EngineContext, id: string): EventDef | undefined {
  return ctx.content.events.find((e) => e.id === id);
}

/** Rest: heal tuning.restHeal of max HP (rounded, capped), forgo the pick, move on. */
function restHeal(state: RunState, ctx: EngineContext): RunState {
  if (state.phase !== 'rest') return reject(state, 'not resting');
  const hp = clampHp(state.player.hp + Math.round(state.player.maxHp * ctx.content.tuning.restHeal), state.player.maxHp);
  const s: RunState = {
    ...state,
    rejected: null,
    player: { ...state.player, hp },
    offer: null,
    lastTurn: { ...EMPTY_REPORT, healed: hp - state.player.hp },
  };
  return advance(s, ctx);
}

/**
 * Event: apply the choice's player-side effects IN THE ORDER WRITTEN (a trade is a script, not a
 * hook: "max HP +20, take 30" grows first and then takes 30, so the cost is always the cost; the
 * item vocabulary's EFFECT_ORDER would land the damage first and make the trade a net heal at
 * low HP, gate S1). A trade never kills on the spot: HP floors at 1 (the next turn start can
 * still, gate S2). Then a rare-guaranteed pick if the choice carries one, else the next slot.
 * An event id that content no longer has (a save across a content change, gate W1) is treated
 * as the walk-away: the slot is left with nothing applied.
 */
function eventChoice(state: RunState, index: number, ctx: EngineContext): RunState {
  if (state.phase !== 'event' || state.event === null) return reject(state, 'no event');
  const def = eventDefOf(ctx, state.event);
  if (!def) return advance({ ...state, rejected: null, event: null }, ctx);
  const choice = def.choices[index];
  if (!choice) return reject(state, 'bad event choice');
  const a = applyEffects({ ...state, rejected: null }, choice.effects, ctx);
  const hp = Math.max(1, a.state.player.hp);
  const s: RunState = {
    ...a.state,
    player: { ...a.state.player, hp },
    event: null,
    lastTurn: { ...EMPTY_REPORT, healed: a.healed },
    // What the trade hit for, not what a max-HP cut trimmed (gate S3), and not the 1 HP the floor gave back.
    stats: { ...a.state.stats, damageTaken: a.state.stats.damageTaken + a.playerDamage - (hp - a.state.player.hp) },
  };
  return choice.rarePick ? makeOffer(s, ctx, 'rare') : advance(s, ctx);
}

/**
 * onTurnStart effects, then poison ticks on the enemy, then venom bites the player. Poison goes
 * first so a poison that finishes the enemy ends the fight before the venom bites.
 */
function turnStart(state: RunState, ctx: EngineContext, report: TurnReport): RunState {
  const effects = collectEffects('onTurnStart', state.player.items, ctx.content, conditionCtx(state, ctx), state.cell, state.player.traits);
  const a = applyEffects(state, effects, ctx);
  let s: RunState = {
    ...a.state,
    lastTurn: {
      ...report,
      healed: report.healed + a.healed,
      damage: report.damage + a.enemyDamage,
      redrawn: [...report.redrawn, ...a.redrawn],
    },
    // Count onTurnStart player damage as damage taken: a curse's damagePlayer, and the boons symbiont
    // (1) and apex (3) which already cost HP each turn. damageTaken is a HUD-only stat that nothing
    // reads, so counting self-damage here is gameplay-neutral and every replay outcome is byte-identical.
    stats: { ...a.state.stats, damageDealt: a.state.stats.damageDealt + a.enemyDamage, damageTaken: a.state.stats.damageTaken + a.playerDamage },
  };
  if (s.encounter && s.encounter.enemy.hp <= 0) return endEncounter(s, ctx);
  // A turn-start effect can leave a grid with no word: a redraw (step 5, an Endless run with several
  // redraw organelles), or a curse's lock or scramble (step 6). Guard on the grid itself, not on
  // whether a redraw happened. Safe for existing content: entering turnStart the grid is always live
  // (endTurn's guard) and no shipped onTurnStart effect removes playable tiles, so this scrambles
  // only in the new curse cases and leaves every existing replay byte-identical.
  if (s.encounter && isDead(s.encounter.grid, ctx.solver)) {
    s = scramble(s, ctx);
    s = { ...s, lastTurn: { ...(s.lastTurn ?? EMPTY_REPORT), scrambled: true, used: Array.from({ length: GRID_SIZE }, (_, i) => i) } };
  }
  s = enemyTraitsTick(s, ctx);
  s = poisonTick(s);
  if (s.encounter && s.encounter.enemy.hp <= 0) return endEncounter(s, ctx);
  s = venomBite(s, ctx.content.tuning.venomMax);
  if (s.player.hp <= 0) return { ...s, phase: 'summary', outcome: 'lost', encounter: null, offer: null };
  return s;
}

/**
 * Regen heals the enemy (never above max) and hunger grows its damage, both at its turn start from
 * turn 2 on; past tuning.enrageAfter every enemy's damage grows by tuning.enragePerTurn as well, so
 * no fight can stall: past the clock a stun no longer stops the attack either (step 5, tracker #8 closed).
 * Runs after the onTurnStart effects and their death check: an enemy they killed stays dead.
 */
function enemyTraitsTick(state: RunState, ctx: EngineContext): RunState {
  const enc = state.encounter;
  if (!enc || enc.turn <= 1) return state;
  const t = enemyDefOf(ctx, enc.enemy.id).traits;
  const tuning = ctx.content.tuning;
  const enrage = enc.turn > tuning.enrageAfter ? tuning.enragePerTurn : 0;
  const grow = (t?.hunger ?? 0) + enrage;
  if (!t?.regen && grow === 0) return state;
  const hp = t?.regen ? Math.min(enc.enemy.maxHp, enc.enemy.hp + t.regen) : enc.enemy.hp;
  return { ...state, encounter: { ...enc, enemy: { ...enc.enemy, hp, damage: enc.enemy.damage + grow } } };
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
  const effects = collectEffects('onEncounterEnd', state.player.items, ctx.content, conditionCtx(state, ctx), state.cell, state.player.traits);
  const a = applyEffects(state, effects, ctx);
  const s: RunState = {
    ...a.state,
    lastTurn: { ...(a.state.lastTurn ?? EMPTY_REPORT), enemyDefeated: true, healed: (a.state.lastTurn?.healed ?? 0) + a.healed },
  };
  // Normal ends with the last content slot; Endless never ends on a win (step 5).
  if (endsAt(s, ctx.content, s.encounterIndex)) return { ...s, phase: 'summary', outcome: 'won', encounter: null, offer: null };
  // A boss falls: evolve (variety wave step 3), then the item pick as after any fight.
  if (encounterDefFor(ctx.content, s.encounterIndex).boss) return makeEvolve(s, ctx);
  // An elite's offer carries a guaranteed rare (variety wave step 2) and is NOT cursable; a plain
  // fight's offer is cursable (variety wave step 6).
  const elite = kindAt(s, s.encounterIndex) === 'elite';
  return makeOffer(s, ctx, elite ? 'rare' : undefined, !elite);
}

/**
 * Evolution (variety wave step 3): three traits the player does not hold, drawn without
 * replacement (one draw each); with fewer than one left, straight to the item offer.
 */
function makeEvolve(state: RunState, ctx: EngineContext): RunState {
  const owned = new Set(state.player.traits);
  let pool = ctx.content.traits.filter((t) => !owned.has(t.id));
  const offer: string[] = [];
  let rng = state.rng;
  while (offer.length < OFFER_SIZE && pool.length > 0) {
    let chosen: TraitDef;
    [chosen, rng] = pick(rng, pool);
    offer.push(chosen.id);
    pool = pool.filter((t) => t.id !== chosen.id);
  }
  const s = withRng(state, rng);
  // The post-boss offer is cursable (variety wave step 6), whether it comes from this no-traits
  // fallback or from pickTrait after a trait is chosen.
  if (offer.length === 0) return makeOffer({ ...s, encounter: null }, ctx, undefined, true);
  return { ...s, phase: 'evolve', offer, curses: null, encounter: null };
}

/** The trait joins player.traits (pick order), then the item offer the boss win owes. */
function pickTrait(state: RunState, index: number, ctx: EngineContext): RunState {
  if (state.phase !== 'evolve' || !state.offer) return reject(state, 'not evolving');
  const id = state.offer[index];
  if (id === undefined) return reject(state, 'bad trait index');
  traitDef(ctx.content, id); // throws on an unknown id
  const s: RunState = { ...state, rejected: null, player: { ...state.player, traits: [...state.player.traits, id] }, offer: null };
  // The post-boss offer is cursable (variety wave step 6).
  return makeOffer(s, ctx, undefined, true);
}

/** An offer holds at most this many commons (Dean, 2026-09-08, question 2): a pick always has something in it. */
export const MAX_COMMONS_PER_OFFER = 2;

const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };

/**
 * Draw an offer of up to OFFER_SIZE unowned items by rarity weight, at most two commons. With
 * `guaranteed` (an elite's or an event's offer), the first slot is drawn from items of at least
 * that rarity when any are left; the rest draw as usual.
 */
function drawOffer(state: RunState, ctx: EngineContext, guaranteed?: Rarity): [string[], Rng] {
  const owned = new Set(state.player.items);
  // Curses (variety wave step 6) are never a normal boon: they are drawn only as the cost attached
  // to a boon in a cursed offer (drawCurses). The filter covers the guaranteed-rare path too, which
  // derives its floor from this same pool.
  let pool = ctx.content.items.filter((i) => !owned.has(i.id) && !i.curse);
  const offer: string[] = [];
  let commons = 0;
  let rng = state.rng;
  while (offer.length < OFFER_SIZE && pool.length > 0) {
    const floor = guaranteed !== undefined && offer.length === 0 ? pool.filter((i) => RARITY_RANK[i.rarity] >= RARITY_RANK[guaranteed]) : [];
    const base = floor.length > 0 ? floor : pool;
    const eligible = commons >= MAX_COMMONS_PER_OFFER && base.some((i) => i.rarity !== 'common') ? base.filter((i) => i.rarity !== 'common') : base;
    let chosen;
    [chosen, rng] = weightedPick(
      rng,
      eligible.map((item) => ({ item, weight: RARITY_WEIGHT[item.rarity] })),
    );
    if (chosen.rarity === 'common') commons++;
    offer.push(chosen.id);
    pool = pool.filter((i) => i.id !== chosen.id);
  }
  return [offer, rng];
}

/** One cursed offer in this many, once eligible (variety wave step 6). One RNG draw when eligible. */
export const CURSE_CHANCE = 5;

/**
 * The curses attached to a cursed offer: one per boon slot, drawn without replacement (uniform)
 * from the curse pool and aligned by index with the offer. With the shipped ten curses this always
 * fills an offer of at most three; a caller that can't fill (a tiny curse pool) drops the curse.
 */
function drawCurses(rng: Rng, ctx: EngineContext, count: number): [string[], Rng] {
  let pool = ctx.content.items.filter((i) => i.curse);
  const curses: string[] = [];
  for (let n = 0; n < count && pool.length > 0; n++) {
    let chosen;
    [chosen, rng] = pick(rng, pool);
    curses.push(chosen.id);
    pool = pool.filter((i) => i.id !== chosen.id);
  }
  return [curses, rng];
}

/**
 * `cursable` (variety wave step 6) is true only for the normal post-fight offer (endEncounter, not
 * an elite) and the post-boss offer (pickTrait / makeEvolve). A cursed offer is possible only after
 * act 1 (act >= 2) and only when the content carries curses; then one RNG draw rolls the 1-in-five
 * chance. Non-cursable and act-1 offers draw nothing extra, so their RNG stream is unchanged. When
 * cursed, one curse is drawn per boon slot and aligned into state.curses; otherwise curses is null.
 */
function makeOffer(state: RunState, ctx: EngineContext, guaranteed?: Rarity, cursable = false): RunState {
  const cursePool = ctx.content.items.filter((i) => i.curse);
  const act = encounterDefFor(ctx.content, state.encounterIndex).act;
  const eligible = cursable && act >= 2 && cursePool.length > 0;
  let rng = state.rng;
  let cursed = false;
  if (eligible) {
    let roll: number;
    [roll, rng] = nextInt(rng, CURSE_CHANCE);
    cursed = roll === 0;
  }
  const [offer, rngAfterOffer] = drawOffer(withRng(state, rng), ctx, guaranteed);
  rng = rngAfterOffer;
  let curses: readonly string[] | null = null;
  if (cursed && offer.length > 0 && cursePool.length >= offer.length) {
    const [drawn, rng2] = drawCurses(rng, ctx, offer.length);
    // Only attach when we could fill every slot: state.curses must align 1:1 with offer.
    if (drawn.length === offer.length) {
      curses = drawn;
      rng = rng2;
    }
  }
  const s = withRng(state, rng);
  if (offer.length === 0) return advance({ ...s, curses: null, encounter: null }, ctx);
  return { ...s, phase: 'pick', offer, curses, encounter: null };
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

  // Player attack: the word's score, plus the gold on the tiles played (step 4), then armour.
  const effects = collectEffects('onWordScored', state.player.items, ctx.content, conditionCtx(state, ctx, word), state.cell, state.player.traits);
  const score = scoreWord(word, effects, ctx.content.tuning);
  const gold = selectionGold(enc);
  // Armour (variety wave): a word shorter than the enemy's armour deals half, floored. The preview
  // (candidates.ts, scoreSelection) applies the same rules, so the number it shows is the number
  // that lands; the best/worst word stats record the word's own score, as they did with overkill.
  const landed = armourHit(word, score.damage + gold, enemyDefOf(ctx, enc.enemy.id).traits?.armour ?? 0);
  const enemyHp = Math.max(0, enc.enemy.hp - landed);
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
      // The worst word is the lowest-damage word played that did any damage; the first sets it, a
      // weaker one replaces it, a tie keeps the first. Zero-damage words (a multiplier stack at 0)
      // count for neither best nor worst, so the two stats agree on what a word is (stats HUD, 2026-09-09).
      worstWord: score.damage > 0 && (state.stats.worstWord === '' || score.damage < state.stats.worstWordDamage) ? word : state.stats.worstWord,
      worstWordDamage: score.damage > 0 && (state.stats.worstWord === '' || score.damage < state.stats.worstWordDamage) ? score.damage : state.stats.worstWordDamage,
    },
  };
  const extras = applyEffects(s, effects, ctx, enc.enemy.hp - enemyHp);
  s = extras.state;
  const report: TurnReport = {
    ...EMPTY_REPORT,
    word,
    gold,
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

export function enemyDefOf(ctx: EngineContext, id: string): EnemyDef {
  const def = [...ctx.content.enemies, ...ctx.content.bosses].find((e) => e.id === id);
  if (!def) throw new Error(`unknown enemy ${id}`);
  return def;
}

/** What a word's score does to an armoured enemy: half, floored, when the word is shorter than the armour. */
export function armourHit(word: string, damage: number, armour: number): number {
  return word.length < armour ? Math.floor(damage / 2) : damage;
}

/** The gold on the selected tiles (step 4): added to the hit after the multiplier, before armour. */
export function selectionGold(enc: Encounter): number {
  return enc.selection.reduce((sum, i) => sum + (enc.grid[i]?.gold ?? 0), 0);
}

/**
 * The exact hit the current selection would land, or null when it is not a word: the same
 * scoring, gold and armour path submitWord takes, for the word line and the Attack button
 * (the number shown is the number that lands).
 */
export function scoreSelection(state: RunState, ctx: EngineContext): number | null {
  const enc = state.encounter;
  if (!enc) return null;
  const word = selectedWord(state);
  if (!ctx.dictionary.has(word)) return null;
  const effects = collectEffects('onWordScored', state.player.items, ctx.content, conditionCtx(state, ctx, word), state.cell, state.player.traits);
  const score = scoreWord(word, effects, ctx.content.tuning);
  return armourHit(word, score.damage + selectionGold(enc), enemyDefOf(ctx, enc.enemy.id).traits?.armour ?? 0);
}

/** Enraged from the turn after tuning.enrageAfter: damage grows each turn and a stun no longer stops the attack. */
export function enraged(enc: Encounter, ctx: EngineContext): boolean {
  return enc.turn > ctx.content.tuning.enrageAfter;
}

/** The hit range an enemy rolls in: [round(d*(1-v)), round(d*(1+v))], inclusive. Shared with the intent line. */
export function hitRange(damage: number, variance: number): readonly [number, number] {
  const lo = Math.max(0, Math.round(damage * (1 - variance)));
  const hi = Math.max(lo, Math.round(damage * (1 + variance)));
  return [lo, hi];
}

/**
 * The enemy's half of a turn: attack on its cadence (reduced by onDamageTaken items),
 * then its special. Returns the summary state on a kill so callers stop there.
 */
function enemyTurn(state: RunState, ctx: EngineContext, report: TurnReport): { state: RunState; report: TurnReport } {
  let s = state;
  const enc2 = s.encounter as Encounter;
  const enemyDef = enemyDefOf(ctx, enc2.enemy.id);
  let enemyDamage = 0;
  if (enc2.turn % enemyDef.attackEvery === 0) {
    if (enc2.enemy.stunned > 0 && !enraged(enc2, ctx)) {
      // A stun eats the attack. The special below still fires: a stun is not a silence.
      s = { ...s, encounter: { ...enc2, enemy: { ...enc2.enemy, stunned: enc2.enemy.stunned - 1 } } };
      report = { ...report, stunned: true };
    } else {
      // Past the enrage clock rage breaks through a stun (step 5): two stun organelles on the same
      // beat locked an enemy forever (tracker #8) and an Endless run never ended; now every fight
      // in which the player keeps stunning still ends, because the enemy attacks anyway from
      // turn enrageAfter + 1 on. The stun count is left alone: it is simply not honoured.
      if (enc2.enemy.stunned > 0) s = { ...s, encounter: { ...enc2, enemy: { ...enc2.enemy, stunned: enc2.enemy.stunned - 1 } } };
      const taken = collectEffects('onDamageTaken', s.player.items, ctx.content, conditionCtx(s, ctx), s.cell, s.player.traits);
      // The roll (variety wave): one RNG draw inside the range, threaded like every other draw.
      const [lo, hi] = hitRange(enc2.enemy.damage, enemyDef.variance);
      let dmg = lo;
      if (hi > lo) {
        let roll: number;
        [roll, s] = ((): [number, RunState] => {
          const [r, rng] = nextInt(s.rng, hi - lo + 1);
          return [r, withRng(s, rng)];
        })();
        dmg = lo + roll;
      }
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
      // A hit that leaves 0 HP is death before anything an on-hit organelle would do (step 5): a
      // "heal when hit" item stood a player back up from 0 every turn, and an Endless run never ended.
      if (hp <= 0) return { state: { ...s, phase: 'summary', outcome: 'lost', encounter: null, offer: null, lastTurn: { ...report, enemyDamage, shielded } }, report: { ...report, enemyDamage, shielded } };
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
  const ticked = settled.map((t) => (t.lockedTurns > 0 ? { ...t, lockedTurns: t.lockedTurns - 1 } : t));
  // Cracked tiles (step 4): the count ticks; a tile that reaches zero crumbles, is refilled and settles like a played one.
  const crumbling = ticked.map((t, i) => (t.cracked === 1 ? i : -1)).filter((i) => i >= 0);
  const aged = ticked.map((t) => (t.cracked > 1 ? { ...t, cracked: t.cracked - 1 } : t));
  const [regrown, rng2] = crumbling.length > 0 ? refill(rng, aged, crumbling, letterBias(s, ctx)) : [aged, rng];
  const grid = crumbling.length > 0 ? settle(regrown, crumbling) : regrown;
  report = { ...report, crumbled: crumbling.length };
  s = { ...s, rng: rng2, encounter: { ...enc3, grid, selection: [], turn: enc3.turn + 1 } };
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
  // A rest's offer is picked the same way (variety wave step 2); taking it forgoes the heal. An
  // evolve offer holds traits, not items: pickItem there is rejected (pickTrait takes it).
  if ((state.phase !== 'pick' && state.phase !== 'rest') || !state.offer) return reject(state, 'not picking');
  const id = state.offer[index];
  if (id === undefined) return reject(state, 'bad offer index');
  itemDef(ctx.content, id); // throws on unknown id
  // A cursed offer (variety wave step 6): the boon comes with the curse aligned to its slot. Both
  // join player.items, boon first then curse, and both fire onPick in that order.
  const curseId = state.curses ? state.curses[index] : undefined;
  const picked = curseId !== undefined ? [id, curseId] : [id];
  for (const pid of picked) itemDef(ctx.content, pid); // throws on unknown id
  let s: RunState = {
    ...state,
    rejected: null,
    player: { ...state.player, items: [...state.player.items, ...picked] },
    offer: null,
    curses: null,
  };
  // onPick (effects wave): each picked item's own once-only effects. No encounter exists here, so
  // enemy and grid effects are no-ops; heal, maxHp (the curse's negative max HP included), shield
  // and freeShuffle land.
  for (const pid of picked) {
    const onPick = resolveEffects(itemDef(ctx.content, pid).hooks.onPick ?? [], conditionCtx(s, ctx));
    if (onPick.length > 0) {
      const a = applyEffects(s, onPick, ctx);
      s = { ...a.state, lastTurn: { ...(a.state.lastTurn ?? EMPTY_REPORT), healed: (a.state.lastTurn?.healed ?? 0) + a.healed } };
    }
  }
  return advance(s, ctx);
}

/**
 * Leave a cursed offer entirely (variety wave step 6): valid only in the pick phase with a curse
 * attached (curses non-null). It forgoes the whole offer and advances, as a skipped pick. A normal
 * offer is mandatory, so skipOffer is rejected there.
 */
function skipOffer(state: RunState, ctx: EngineContext): RunState {
  if (state.phase !== 'pick' || state.curses === null) return reject(state, 'no cursed offer to leave');
  return advance({ ...state, rejected: null, offer: null, curses: null }, ctx);
}
