/**
 * Shared engine types. Everything that can appear in run state is plain JSON:
 * no classes, no Map/Set, no functions, no Date. Content definitions (items,
 * enemies) are referenced from state by id only.
 */
import type { Condition, Effect } from './effects';
import type { Rng } from './rng';

export interface Tile {
  readonly letter: string;
  /** Turns remaining locked. 0 = usable. Locked tiles cannot be selected and are invisible to the solver. */
  readonly lockedTurns: number;
  /** Venom: bites the player for this much at the start of every turn and then grows by one. 0 = clean. Cured by playing the tile, a shuffle, a scramble, or a redraw (redrawTiles). */
  readonly venom: number;
  /** Gold (variety wave step 4): adds this much damage when the tile is played, after the multiplier and before armour. 0 = plain. Gone with the tile. */
  readonly gold: number;
  /** Cracked (variety wave step 4): turns left before the tile crumbles and is refilled. 0 = sound. Still playable while it lasts; a shuffle or scramble replaces it. */
  readonly cracked: number;
  /**
   * Wild (evolution track, v11): a wildcard tile. Present ONLY when the player holds the 'wildcard'
   * capability, where the reducer keeps exactly one playable wild tile on the grid at all times (see
   * withWild). A wild counts as ANY letter when forming a word, auto-resolved to the letter that makes
   * a valid, best-scoring word (solver.solveWithWild, submitWord). Optional and only ever true, so a
   * grid without the capability carries no `wild` key and is byte-identical to a pre-v11 grid.
   */
  readonly wild?: true;
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
  /**
   * Curse (variety wave step 6): a self-harm item that never appears as a normal boon. Curses
   * are drawn only as the attached cost in a cursed offer (see reducer.makeOffer / RunState.curses)
   * and are filtered out of drawOffer. A curse uses the same effect verbs as any item, inverted.
   */
  readonly curse?: true;
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
  /**
   * Resist (challenge wave, 2026-09-11): a word that FAILS `when` deals only `factor` of its damage
   * to this enemy (floored), so the enemy demands a word property (min length, a rare letter, a repeat...).
   * A word that passes takes full damage. Reuses the Condition grammar (effects.ts, evaluateCondition);
   * no new verb, no save change. Additive to armour: both apply if both are set. No shipped enemy uses it yet.
   */
  readonly resist?: { readonly when: Condition; readonly factor: number };
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

export type RunMode = 'normal' | 'endless';

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

/**
 * The evolution track (v11, marquee wave): capabilities the cell gains as it descends, each a new
 * verb of play (not a stat), offered after each boss alongside the trait. Their behaviour is
 * first-class engine logic keyed by these ids (like DEFAULT_CELL_ID); the display text is content.
 *   wildcard    the grid always carries one wild tile, playable as any letter (Tile.wild, solver)
 *   transmute   once per fight, turn a tile into the best rare letter (transmuteTile action)
 *   letter-bank a one-slot letter bank: store a tile's letter, spend it into a later word (bankLetter)
 */
export type Capability = 'wildcard' | 'transmute' | 'letter-bank';
export const CAPABILITIES: readonly Capability[] = ['wildcard', 'transmute', 'letter-bank'];

export interface CapabilityDef {
  readonly id: Capability;
  readonly name: string;
  readonly description: string;
  readonly flavor: string;
}

/**
 * Per-run evolution state (v11). JSON-plain: string ids, a boolean, a nullable letter; no class,
 * Map, function or Date. `caps` are the capabilities gained in pick order. `transmuteUsed` is the
 * only per-FIGHT field, reset to false at encounter start. `bankedLetter` is the one stored letter,
 * per RUN: it persists across turns and across fights until spent, null when the slot is empty.
 */
export interface Evolution {
  readonly caps: readonly Capability[];
  readonly transmuteUsed: boolean;
  readonly bankedLetter: string | null;
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
  /**
   * Endless (step 5): past the last content slot each generated slot's scales are the act-3
   * fight or boss scale times growth^(slots past the end), so the deep keeps getting deeper.
   */
  readonly endlessHpGrowth: number;
  readonly endlessDamageGrowth: number;
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
  /** Evolution capabilities offered after a boss alongside the trait (v11, marquee wave). */
  readonly capabilities: readonly CapabilityDef[];
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
 * eventChoice leave them. evolve (step 3): the trait pick after a boss, left by pickTrait. capability
 * (v11): the mandatory capability pick that follows the trait, left by pickCapability.
 */
export type Phase = 'fight' | 'pick' | 'rest' | 'event' | 'evolve' | 'capability' | 'summary';
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
  /** Gold the played tiles added to the hit (variety wave step 4). */
  readonly gold: number;
  /** Cracked tiles that crumbled at the end of this turn and were refilled. */
  readonly crumbled: number;
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
  readonly v: 11;
  readonly rng: Rng;
  /** The starting cell's id (content.cells). v4; v3 saves load as 'balanced'. */
  readonly cell: string;
  /**
   * Normal ends with the ninth encounter; Endless (variety wave step 5, Dean's answer 6) goes on
   * past it with act-3 creatures on a growing curve, a boss every third slot, until the player
   * falls. v9; earlier saves load as normal.
   */
  readonly mode: RunMode;
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
  /** The evolution track (v11): capabilities gained and the per-fight / per-run usage flags. JSON-plain. */
  readonly evolution: Evolution;
  readonly encounter: Encounter | null;
  readonly offer: readonly string[] | null;
  /**
   * A cursed offer (variety wave step 6, v10): the curse attached to each `offer` slot, aligned by
   * index. Non-null ONLY during a cursed `pick` phase, where its length equals `offer.length`; null
   * everywhere else. About one in five normal post-fight and post-boss offers after act 1 is cursed;
   * pickItem takes the boon AND its curse, skipOffer leaves the whole offer.
   */
  readonly curses: readonly string[] | null;
  readonly outcome: Outcome | null;
  readonly lastTurn: TurnReport | null;
  /** Why the last action was rejected, if it was. Cleared by the next accepted action. */
  readonly rejected: string | null;
  /** Starting-kit picks still owed before encounter 0 begins. */
  readonly pendingPicks: number;
  readonly stats: RunStats;
}
