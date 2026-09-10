/**
 * Bot policies for the sim. A bot sees the state and the candidate list and
 * returns the next action. Bot randomness uses its own RNG, seeded from the
 * run seed, so it never touches game state and stays reproducible.
 */
import { candidateIndices, candidateWords, type Candidate } from '../../src/engine/candidates';
import type { Action, EngineContext } from '../../src/engine/reducer';
import { createRng, nextInt, type Rng } from '../../src/engine/rng';
import type { Condition, Effect } from '../../src/engine/effects';
import type { EventChoice, ItemDef, Rarity, RunState } from '../../src/engine/types';

export type BotName = 'greedy' | 'mediocre' | 'solver';
export const BOT_NAMES: readonly BotName[] = ['greedy', 'mediocre', 'solver'];

/**
 * Dean's ruling (2026-09-06): the greedy bot models a strong HUMAN, not a
 * solver. Sixteen unconstrained letters routinely contain a 10-letter word;
 * a person finds 6-7. So greedy plays the best word of at most this length.
 * The uncapped `solver` bot is still run and reported as an upper bound, but
 * it is not an exit criterion.
 */
export const GREEDY_MAX_LENGTH = 7;

export interface Bot {
  readonly name: BotName;
  /** Choose the word to play. Returns null if there are no candidates (should never happen). */
  chooseWord(state: RunState, candidates: readonly Candidate[]): Candidate | null;
  /** Index into state.offer. */
  choosePick(state: RunState, ctx: EngineContext): number;
}

/**
 * Venom (2026-09-08): any human spends a venomed tile as soon as a word allows it, so the bots
 * do too. When the grid holds venom, the candidate pool narrows to words that use at least one
 * venomed tile, if any exist; otherwise it is unchanged. Only computed when venom is present,
 * since mapping every candidate to tiles is the sim's hot spot.
 */
export function spendingVenom(state: RunState, candidates: readonly Candidate[]): readonly Candidate[] {
  const enc = state.encounter;
  if (!enc || !enc.grid.some((t) => t.venom > 0)) return candidates;
  const venomed = new Set(enc.grid.map((t, i) => (t.venom > 0 ? i : -1)).filter((i) => i >= 0));
  const through = candidates.filter((c) => (candidateIndices(state, c.word) ?? []).some((i) => venomed.has(i)));
  return through.length > 0 ? through : candidates;
}

function best(candidates: readonly Candidate[]): Candidate | null {
  let top: Candidate | null = null;
  for (const c of candidates) if (!top || c.damage > top.damage) top = c;
  return top;
}

/** Plays the highest-damage word of at most GREEDY_MAX_LENGTH letters; falls back to the best available if none. */
export function greedyBot(seed: number): Bot {
  let rng = createRng(seed ^ 0x9e3779b9);
  return {
    name: 'greedy',
    chooseWord: (s, candidates) => {
      const pool = spendingVenom(s, candidates);
      return best(pool.filter((c) => c.word.length <= GREEDY_MAX_LENGTH)) ?? best(pool);
    },
    choosePick: (state) => {
      let i: number;
      [i, rng] = nextInt(rng, state.offer?.length ?? 1);
      return i;
    },
  };
}

/** Plays the highest-damage word available, any length. Upper bound; not a criterion. */
export function solverBot(seed: number): Bot {
  let rng = createRng(seed ^ 0x9e3779b9);
  return {
    name: 'solver',
    chooseWord: (s, candidates) => best(spendingVenom(s, candidates)),
    choosePick: (state) => {
      let i: number;
      [i, rng] = nextInt(rng, state.offer?.length ?? 1);
      return i;
    },
  };
}

/** Plays a random 4-5 letter word if one exists, else the best available. */
/**
 * A casual human reads the offer. The mediocre bot models that (2026-09-08, after the pool
 * grew to 24): it scores each offered item by how often its effects will apply to the 4-5
 * letter words it plays, and takes the best; ties break by its RNG. Unconditional effects
 * count double, conditions it can meet count once, conditions it never meets (6+ letters)
 * count nothing.
 */
const RARITY_TIEBREAK: Readonly<Record<Rarity, number>> = { common: 0, uncommon: 0.1, rare: 0.2, mythic: 0.3 };

/** True when the mediocre bot, playing 4-5 letter words, can expect to meet the condition. */
function usableCondition(w: Condition): boolean {
  switch (w.kind) {
    case 'minLength':
      return w.value <= 5;
    case 'containsLetter':
    case 'startsWith':
    case 'endsWith':
      if (w.letters.length >= 3) return true;
      for (const l of w.letters) if ('aeioulnrst'.includes(l)) return true;
      return false;
    case 'minVowels':
      return w.value <= 2;
    case 'maxLength':
    case 'hpBelow':
    case 'turnEvery':
    case 'uniqueLetters':
    case 'repeatLetter':
    case 'enemyHpBelow':
    case 'firstTurn':
      return true;
  }
}

/** How often a set of hooks will matter to the mediocre bot's 4-5 letter words; shared by items and traits. */
export function hooksScore(hooks: ItemDef['hooks']): number {
  let score = 0;
  const walk = (effects: readonly Effect[]) => {
    for (const e of effects) {
      if (e.type === 'condition') {
        if (usableCondition(e.when)) score += 1;
      } else if (e.type === 'perUnit') {
        // Scales with something the bot always has some of; counts like an unconditional effect.
        score += 2;
      } else {
        score += e.type === 'damagePlayer' ? -2 : 2;
      }
    }
  };
  for (const effects of Object.values(hooks)) walk(effects ?? []);
  return score;
}

export function offerScore(item: ItemDef): number {
  // Rarity breaks ties (tracker #6): a rare that scores like a common is still the rarer pull.
  return hooksScore(item.hooks) + RARITY_TIEBREAK[item.rarity];
}

/**
 * How bad a curse looks (variety wave step 6): read the SIGN of each effect, in the same 2-per-effect
 * units as hooksScore, so a boon's offerScore and a curse's cost compare directly. A cost the curse
 * only pays under a condition (long words, every third turn) is half-weighted, since it does not
 * always fire. Reading signs is the whole heuristic; the bots decide with it below.
 */
export function curseCost(item: ItemDef): number {
  let cost = 0;
  const walk = (effects: readonly Effect[], weight: number) => {
    for (const e of effects) {
      if (e.type === 'condition') {
        walk(e.then, weight * 0.5);
        continue;
      }
      if (e.type === 'perUnit') {
        walk(e.then, weight);
        continue;
      }
      switch (e.type) {
        case 'addFlat':
        case 'addMult':
        case 'maxHp':
          if (e.value < 0) cost += 2 * weight;
          break;
        case 'vowelWeight':
          if (e.value < 1) cost += 2 * weight;
          break;
        // The compounding curses (extra damage every hit, HP drain / a lock / venom every turn) are
        // weighted heavier: they fire for the length of the fight, so a bot that plays long games
        // suffers them far more than the raw sign suggests. Steering every bot off these keeps them
        // from dragging the slow, weak player out of its win-rate band.
        case 'reduceDamage':
          if (e.value < 0) cost += 4 * weight;
          break;
        case 'damagePlayer':
          cost += 5 * weight;
          break;
        case 'lockTiles':
        case 'venomTiles':
          cost += 4 * weight;
          break;
        case 'scramble':
          cost += 3 * weight;
          break;
        default:
          break;
      }
    }
  };
  for (const effects of Object.values(item.hooks)) walk(effects ?? [], 1);
  return cost;
}

/** A boon strong enough that the greedy bot takes it with its curse (variety wave step 6). */
export const GREEDY_CURSE_BAR = 4;
/**
 * The margin by which a boon must beat its curse for the mediocre bot to take the pair. It is
 * NEGATIVE on purpose, a finding that overrides the first bot spec ("mediocre skips more readily"):
 * a cursed offer REPLACES a normal offer, so leaving one forfeits the boon entirely, and for the
 * slow, weak player that hurts MORE than eating the curse. Measured on the balanced cell: at margin
 * +5 (skips a lot) mediocre wins 18.4%, at +2 it wins 19.4% (both out of the 20-40 band); at -3
 * (takes the boon unless its curse clearly outweighs it, skipping only the worst) it wins 23.4%, in
 * band and near the 24.4% no-curse baseline. So the mediocre model is "grab the organelle, wear the
 * curse", skipping only a dreadful pair. Greedy and solver stay selective, so pickup is still
 * sometimes-not-always across the bots and the win-rate delta stays negative.
 */
export const MEDIOCRE_CURSE_MARGIN = -3;

/**
 * A cursed offer (variety wave step 6): choose a boon+curse slot to take, or null to leave the whole
 * offer. Greedy takes the strongest boon when it clears the bar, curse and all; the solver takes the
 * best net-positive slot; the mediocre bot takes the best slot down to a negative margin (grab the
 * organelle, wear the curse), leaving only a pair whose curse clearly outweighs its boon.
 */
export function chooseCursed(name: BotName, state: RunState, ctx: EngineContext): number | null {
  const offer = state.offer ?? [];
  const curses = state.curses ?? [];
  const item = (id: string): ItemDef => ctx.content.items.find((i) => i.id === id) as ItemDef;
  const boon = (i: number): number => offerScore(item(offer[i] as string));
  const cost = (i: number): number => curseCost(item(curses[i] as string));
  if (offer.length === 0) return null;
  if (name === 'greedy') {
    let bestI = 0;
    for (let i = 1; i < offer.length; i++) if (boon(i) > boon(bestI)) bestI = i;
    return boon(bestI) >= GREEDY_CURSE_BAR ? bestI : null;
  }
  const margin = name === 'mediocre' ? MEDIOCRE_CURSE_MARGIN : 0;
  let bestI = -1;
  let bestNet = margin;
  for (let i = 0; i < offer.length; i++) {
    const net = boon(i) - cost(i);
    if (net > bestNet) {
      bestNet = net;
      bestI = i;
    }
  }
  return bestI >= 0 ? bestI : null;
}

/** Every bot takes the trait whose hooks score highest; ties keep the first offered. */
export function chooseTrait(state: RunState, ctx: EngineContext): number {
  const scores = (state.offer ?? []).map((id) => hooksScore(ctx.content.traits.find((t) => t.id === id)?.hooks ?? {}));
  let best = 0;
  scores.forEach((sc, i) => {
    if (sc > (scores[best] ?? -Infinity)) best = i;
  });
  return best;
}

export function mediocreBot(seed: number): Bot {
  let rng: Rng = createRng(seed ^ 0x9e3779b9);
  return {
    name: 'mediocre',
    chooseWord: (s, candidates) => {
      const pool = spendingVenom(s, candidates);
      const mid = pool.filter((c) => c.word.length >= 4 && c.word.length <= 5);
      if (mid.length === 0) return best(pool);
      let i: number;
      [i, rng] = nextInt(rng, mid.length);
      return mid[i] ?? null;
    },
    choosePick: (state, ctx) => {
      const offer = state.offer ?? [];
      const scores = offer.map((id) => offerScore(ctx.content.items.find((it) => it.id === id) as ItemDef));
      const best = Math.max(...scores);
      const tied = scores.map((sc, i) => (sc === best ? i : -1)).filter((i) => i >= 0);
      let k: number;
      [k, rng] = nextInt(rng, tied.length);
      return tied[k] ?? 0;
    },
  };
}

export function makeBot(name: BotName, seed: number): Bot {
  switch (name) {
    case 'greedy':
      return greedyBot(seed);
    case 'mediocre':
      return mediocreBot(seed);
    case 'solver':
      return solverBot(seed);
  }
}

/** Next action for the bot given the current state, or null when the run is over. */
/**
 * A best word this short is not worth the turn when a free shuffle is in hand. Five never fired
 * (the gate measured 0 shuffles in full runs holding 500 charges: sixteen letters nearly always
 * hold a five); six fires on the grids a strong player would actually reroll.
 */
export const FREE_SHUFFLE_BELOW = 6;

/**
 * Encounter types (variety wave step 2): at a rest every bot heals below this fraction of max HP
 * and picks otherwise; at an event the strong bots take the trade when its HP cost leaves them
 * above the same fraction, the mediocre bot takes every trade.
 */
export const REST_HEAL_BELOW = 0.6;

/** The HP an event choice costs outright: its damagePlayer values plus any max HP it removes. */
export function tradeCost(choice: EventChoice): number {
  let cost = 0;
  for (const e of choice.effects) {
    if (e.type === 'damagePlayer') cost += e.value;
    if (e.type === 'maxHp' && e.value < 0) cost += -e.value;
  }
  return cost;
}

export function nextAction(bot: Bot, state: RunState, ctx: EngineContext): Action[] | null {
  if (state.phase === 'summary') return null;
  if (state.phase === 'pick') {
    // A cursed offer (variety wave step 6): take a boon+curse pair or leave the whole offer.
    if (state.curses !== null) {
      const choice = chooseCursed(bot.name, state, ctx);
      return choice === null ? [{ type: 'skipOffer' }] : [{ type: 'pickItem', index: choice }];
    }
    return [{ type: 'pickItem', index: bot.choosePick(state, ctx) }];
  }
  if (state.phase === 'evolve') return [{ type: 'pickTrait', index: chooseTrait(state, ctx) }];
  if (state.phase === 'rest') {
    const low = state.player.hp < state.player.maxHp * REST_HEAL_BELOW;
    return low || !state.offer ? [{ type: 'restHeal' }] : [{ type: 'pickItem', index: bot.choosePick(state, ctx) }];
  }
  if (state.phase === 'event') {
    const def = ctx.content.events.find((e) => e.id === state.event);
    const trade = def?.choices[0];
    const last = Math.max(0, (def?.choices.length ?? 1) - 1);
    if (!trade) return [{ type: 'eventChoice', index: last }];
    const afford = bot.name === 'mediocre' || state.player.hp - tradeCost(trade) >= state.player.maxHp * REST_HEAL_BELOW;
    return [{ type: 'eventChoice', index: afford ? 0 : last }];
  }
  const candidates = candidateWords(state, ctx);
  const choice = bot.chooseWord(state, candidates);
  if (!choice) throw new Error('bot has no playable word: dead grid reached the player');
  // Effects wave: the strong bots spend a free shuffle rather than play a short word; the mediocre
  // bot spends one only when its 4-5 letter range is empty (it plays what it sees otherwise).
  if (state.player.freeShuffles > 0) {
    const shortBest = bot.name !== 'mediocre' && choice.word.length < FREE_SHUFFLE_BELOW;
    const noMid = bot.name === 'mediocre' && !candidates.some((c) => c.word.length >= 4 && c.word.length <= 5);
    if (shortBest || noMid) return [{ type: 'shuffle' }];
  }
  const indices = candidateIndices(state, choice.word);
  if (!indices) throw new Error(`candidate ${choice.word} cannot be mapped to tiles`);
  return [...indices.map((index): Action => ({ type: 'toggleTile', index })), { type: 'submitWord' }];
}
