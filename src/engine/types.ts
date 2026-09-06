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
}

export const GRID_SIZE = 16;

/** The moments at which items contribute effects. Fixed set; see hooks.ts for order. */
export type Hook = 'onTurnStart' | 'onTileDraw' | 'onWordScored' | 'onDamageTaken' | 'onEncounterEnd';

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly description: string;
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

export interface Content {
  readonly items: readonly ItemDef[];
  readonly enemies: readonly EnemyDef[];
  readonly bosses: readonly EnemyDef[];
  readonly encounters: readonly EncounterDef[];
  readonly playerMaxHp: number;
}

export interface PlayerState {
  readonly hp: number;
  readonly maxHp: number;
  /** Item ids in acquisition order. Hooks apply in this order. */
  readonly items: readonly string[];
}

export interface EnemyState {
  readonly id: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly damage: number;
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
  readonly v: 1;
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
  readonly stats: RunStats;
}
