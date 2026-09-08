/**
 * Bot policies for the sim. A bot sees the state and the candidate list and
 * returns the next action. Bot randomness uses its own RNG, seeded from the
 * run seed, so it never touches game state and stays reproducible.
 */
import { candidateIndices, candidateWords, type Candidate } from '../../src/engine/candidates';
import type { Action, EngineContext } from '../../src/engine/reducer';
import { createRng, nextInt, type Rng } from '../../src/engine/rng';
import type { Condition, Effect } from '../../src/engine/effects';
import type { ItemDef, Rarity, RunState } from '../../src/engine/types';

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

export function offerScore(item: ItemDef): number {
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
  for (const effects of Object.values(item.hooks)) walk(effects ?? []);
  // Rarity breaks ties (tracker #6): a rare that scores like a common is still the rarer pull.
  return score + RARITY_TIEBREAK[item.rarity];
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

export function nextAction(bot: Bot, state: RunState, ctx: EngineContext): Action[] | null {
  if (state.phase === 'summary') return null;
  if (state.phase === 'pick') return [{ type: 'pickItem', index: bot.choosePick(state, ctx) }];
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
