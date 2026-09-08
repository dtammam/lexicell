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
  /** Venom: bites the player for this much at the start of every turn and then grows by one. 0 = clean. Cured by playing the tile, a shuffle, or a scramble. */
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

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  /** Base HP before the encounter curve scales it. */
  readonly hp: number;
  /** Base damage per attack before the encounter curve scales it. */
  readonly damage: number;
  /** Attack on every Nth enemy turn (1 = every turn). */
  readonly attackEvery: number;
  /** Optional distinct mechanic (bosses). Fires on every Nth enemy turn, after the attack. */
  readonly special?: { readonly every: number; readonly effects: readonly Effect[] };
}

/** One slot in the 9-encounter run. Content supplies nine of these. */
export interface EncounterDef {
  readonly act: 1 | 2 | 3;
  readonly boss: boolean;
  readonly hpScale: number;
  readonly damageScale: number;
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
}

export interface Content {
  readonly items: readonly ItemDef[];
  readonly enemies: readonly EnemyDef[];
  readonly bosses: readonly EnemyDef[];
  readonly encounters: readonly EncounterDef[];
  readonly playerMaxHp: number;
  readonly tuning: Tuning;
}

export interface PlayerState {
  readonly hp: number;
  readonly maxHp: number;
  /** Item ids in acquisition order. Hooks apply in this order. */
  readonly items: readonly string[];
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

export type Phase = 'fight' | 'pick' | 'summary';
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
  /** Player HP at the start of each encounter reached, index = encounterIndex. */
  readonly hpAtEncounterStart: readonly number[];
}

export interface RunState {
  readonly v: 3;
  readonly rng: Rng;
  readonly phase: Phase;
  readonly encounterIndex: number;
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
