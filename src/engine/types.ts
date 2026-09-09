/**
 * Shared engine types. Everything that can appear in run state is plain JSON:
 * no classes, no Map/Set, no functions, no Date. Content definitions (items,
 * enemies) are referenced from state by id only.
 */
import type { Effect } from './effects';
import type { Rng } from './rng';

export interface Tile {
  readonly letter: string;
  /** Turns remaining locked. 0 = usable. Locked tiles cannot be selected and are invisible to the solver. */
  readonly lockedTurns: number;
  /** Venom: bites the player for this much at the start of every turn and then grows by one. 0 = clean. Cured by playing the tile, a shuffle, a scramble, or a redraw (redrawTiles). */
  readonly venom: number;
}

export const GRID_SIZE = 16;

/**
 * The moments at which items contribute effects. Fixed set; see hooks.ts for order.
 * onPick (effects wave) fires once, for the item just taken, with no encounter in play: only
 * player-side effects (heal, maxHp, shield, freeShuffle) do anything there.
 */
export type Hook = 'onTurnStart' | 'onTileDraw' | 'onWordScored' | 'onDamageTaken' | 'onEncounterEnd' | 'onPick';

/** mythic (2026-09-08): explicitly overpowered, weighted so about half of runs ever see one. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  /** What it does, in one sentence a player can act on. */
  readonly description: string;
  /** One line of voice (Dean, 2026-09-08). Never mechanics; the description carries those. */
  readonly flavor: string;
  readonly hooks: Partial<Record<Hook, readonly Effect[]>>;
}

/**
 * Enemy traits (variety wave, 2026-09-09). Stats that act on state the enemy already carries, so
 * they need no save change: armour halves short words, regen heals at its turn start, hunger
 * grows its damage every turn. Read from content by id; never copied into state.
 */
export interface EnemyTraits {
  /** Words shorter than this many letters deal half damage to it. */
  readonly armour?: number;
  /** HP it regains at the start of each turn, never above its max. */
  readonly regen?: number;
  /** Damage it gains at the start of each turn, without limit; kill it fast. */
  readonly hunger?: number;
}

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  /** Which act's pool it belongs to; startEncounter draws from the act's pool. */
  readonly act: 1 | 2 | 3;
  /** Base HP before the encounter curve scales it. */
  readonly hp: number;
  /** Base damage per attack before the encounter curve scales it. */
  readonly damage: number;
  /**
   * A hit rolls in [round(d*(1-v)), round(d*(1+v))] from the run RNG (variety wave): the same seed
   * still replays exactly, and the intent line shows the range. 0 = the flat hit.
   */
  readonly variance: number;
  /** Attack on every Nth enemy turn (1 = every turn). */
  readonly attackEvery: number;
  readonly traits?: EnemyTraits;
  /** Optional distinct mechanic (bosses). Fires on every Nth enemy turn, after the attack. */
  readonly special?: { readonly every: number; readonly effects: readonly Effect[] };
}

/**
 * A starting cell (Dean, 2026-09-08): stats plus an always-on set of hooks, applied as if the cell
 * were an item held before every other. No new effect types; a cell that needs a verb waits for
 * one. All cells are available from the first run; there are no unlocks (pack).
 */
export interface CellDef {
  readonly id: string;
  readonly name: string;
  /** What it changes, in one sentence a player can act on. */
  readonly description: string;
  readonly flavor: string;
  readonly maxHp: number;
  /** Item ids granted before the starting-kit pick, each firing its onPick once. No duplicates (content test). */
  readonly startingItems: readonly string[];
  /** Starting-kit picks on top of tuning.startingPicks. */
  readonly extraPicks: number;
  readonly traits: Partial<Record<Hook, readonly Effect[]>>;
}

/** One slot in the 9-encounter run. Content supplies nine of these. */
export interface EncounterDef {
  readonly act: 1 | 2 | 3;
  readonly boss: boolean;
  readonly hpScale: number;
  readonly damageScale: number;
}

/**
 * What a run's slot holds (variety wave step 2, Dean's answer 3). The curve (EncounterDef) is
 * static content; the kinds are placed per run by the seed: one elite, one rest and one event
 * among the non-boss slots after the first, the rest fights. Bosses stay on the def.
 */
export type EncounterKind = 'fight' | 'elite' | 'rest' | 'event';

/** A small forced trade (variety wave step 2): the first choice is the trade, the last walks away. */
export interface EventChoice {
  readonly label: string;
  /** Player-side effects (heal, damagePlayer, maxHp, shield, freeShuffle); enemy and grid verbs are no-ops here. */
  readonly effects: readonly Effect[];
  /** A pick of three follows, with a rare guaranteed in it. */
  readonly rarePick?: true;
}

/**
 * An evolution trait (variety wave step 3, Dean's answer 4): item hooks without a place in the
 * item pool. Three are offered after each boss but the last; the pick is permanent.
 */
export interface TraitDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly flavor: string;
  readonly hooks: Partial<Record<Hook, readonly Effect[]>>;
}

export interface EventDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly choices: readonly EventChoice[];
}

/** Formula numbers the sim tunes. Structure of the formula lives in scoring.ts; these are its knobs. */
export interface Tuning {
  /** Multiplier by word length; index = length. Lengths beyond the table use the last entry. */
  readonly lengthBonus: readonly number[];
  /** Item picks offered before the first encounter (a starting kit). 0 = none. */
  readonly startingPicks: number;
  /** Venom grows by one per turn up to this bite; a hazard should nudge, not execute. */
  readonly venomMax: number;
  /** Poison on the enemy is capped here; it ticks for its value then shrinks by one. */
  readonly poisonMax: number;
  /** The player's shield never holds more than this. */
  readonly shieldMax: number;
  /** A perUnit-scaled addMult never resolves above this multiplier (0.1 x 12 items would be x2.2 on everything). */
  readonly perUnitMultCap: number;
  /**
   * Enrage (variety wave): from this turn on, every enemy's damage grows by enragePerTurn each
   * turn, so no fight can stall (a regenerating enemy against a healing player stalemated the sim).
   */
  readonly enrageAfter: number;
  readonly enragePerTurn: number;
  /** A rest heals this fraction of max HP, rounded (variety wave step 2). */
  readonly restHeal: number;
  /**
   * An elite is drawn from the next act's pool at this slot's scale; in act 3 there is no next
   * act, so it is an act-3 enemy scaled by these two instead.
   */
  readonly eliteHpScale: number;
  readonly eliteDamageScale: number;
}

export interface Content {
  readonly items: readonly ItemDef[];
  /** Starting cells; the first is the default and the one the exit criteria are judged on. */
  readonly cells: readonly CellDef[];
  readonly enemies: readonly EnemyDef[];
  readonly bosses: readonly EnemyDef[];
  readonly encounters: readonly EncounterDef[];
  /** Events the event slot draws from (variety wave step 2). */
  readonly events: readonly EventDef[];
  /** Evolution traits offered after a boss (variety wave step 3). */
  readonly traits: readonly TraitDef[];
  readonly playerMaxHp: number;
  readonly tuning: Tuning;
}

export interface PlayerState {
  readonly hp: number;
  readonly maxHp: number;
  /** Item ids in acquisition order. Hooks apply in this order. */
  readonly items: readonly string[];
  /** Evolution trait ids (content.traits) in pick order (v7); gathered after the cell, before the items. */
  readonly traits: readonly string[];
  /** Absorbs enemy damage before HP. Persists across encounters until spent; capped by tuning.shieldMax. */
  readonly shield: number;
  /** Shuffles that do not hand the turn to the enemy. */
  readonly freeShuffles: number;
}

export interface EnemyState {
  readonly id: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly damage: number;
  /** Damage taken at the start of each turn; shrinks by one per tick (venom in reverse). */
  readonly poison: number;
  /** Attacks the enemy will skip. An attack turn consumes one; specials still fire. */
  readonly stunned: number;
}

export interface Encounter {
  readonly enemy: EnemyState;
  readonly grid: readonly Tile[];
  readonly selection: readonly number[];
  /** 1-based; increments after each enemy turn. */
  readonly turn: number;
  readonly playerHpAtStart: number;
}

/**
 * rest and event (variety wave step 2): screens between fights; the reducer's restHeal, pickItem and
 * eventChoice leave them. evolve (step 3): the trait pick after a boss, left by pickTrait.
 */
export type Phase = 'fight' | 'pick' | 'rest' | 'event' | 'evolve' | 'summary';
export type Outcome = 'won' | 'lost';

export interface TurnReport {
  readonly word: string;
  readonly base: number;
  readonly mult: number;
  readonly damage: number;
  readonly enemyDamage: number;
  readonly healed: number;
  readonly scrambled: boolean;
  readonly enemyDefeated: boolean;
  /** Damage the venomous tiles bit for at the start of this turn. */
  readonly venom: number;
  /** Tile indices consumed this turn, before the grid settled (gravity). The UI animates from it. */
  readonly used: readonly number[];
  /** Damage the enemy took from poison at the start of this turn. */
  readonly poison: number;
  /** True when the enemy's attack this turn was skipped by a stun. */
  readonly stunned: boolean;
  /** Enemy damage the shield absorbed this turn. */
  readonly shielded: number;
  /** Tile indices redrawn in place mid-turn (redrawTiles), not settled. */
  readonly redrawn: readonly number[];
}

export interface RunStats {
  readonly turns: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly bestWord: string;
  readonly bestWordDamage: number;
  /** The weakest damaging word played this run (lowest damage above 0; ties keep the first). Empty until one is played. v5. */
  readonly worstWord: string;
  readonly worstWordDamage: number;
  /** Player HP at the start of each encounter reached, index = encounterIndex. */
  readonly hpAtEncounterStart: readonly number[];
}

export interface RunState {
  readonly v: 7;
  readonly rng: Rng;
  /** The starting cell's id (content.cells). v4; v3 saves load as 'balanced'. */
  readonly cell: string;
  /**
   * The kind of each slot, index = encounterIndex, placed by the seed at newRun (v6). A slot past
   * the array's end is a fight, which is how a migrated v5 save finishes its run.
   */
  readonly kinds: readonly EncounterKind[];
  readonly phase: Phase;
  readonly encounterIndex: number;
  /** The event on screen while phase is 'event' (content.events id); null otherwise. */
  readonly event: string | null;
  readonly player: PlayerState;
  readonly encounter: Encounter | null;
  readonly offer: readonly string[] | null;
  readonly outcome: Outcome | null;
  readonly lastTurn: TurnReport | null;
  /** Why the last action was rejected, if it was. Cleared by the next accepted action. */
  readonly rejected: string | null;
  /** Starting-kit picks still owed before encounter 0 begins. */
  readonly pendingPicks: number;
  readonly stats: RunStats;
}
