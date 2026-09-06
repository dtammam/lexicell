/**
 * Bot policies for the sim. A bot sees the state and the candidate list and
 * returns the next action. Bot randomness uses its own RNG, seeded from the
 * run seed, so it never touches game state and stays reproducible.
 */
import { candidateIndices, candidateWords, type Candidate } from '../../src/engine/candidates';
import type { Action, EngineContext } from '../../src/engine/reducer';
import { createRng, nextInt, type Rng } from '../../src/engine/rng';
import type { RunState } from '../../src/engine/types';

export type BotName = 'greedy' | 'mediocre';
export const BOT_NAMES: readonly BotName[] = ['greedy', 'mediocre'];

export interface Bot {
  readonly name: BotName;
  /** Choose the word to play. Returns null if there are no candidates (should never happen). */
  chooseWord(state: RunState, candidates: readonly Candidate[]): Candidate | null;
  /** Index into state.offer. */
  choosePick(state: RunState): number;
}

function best(candidates: readonly Candidate[]): Candidate | null {
  let top: Candidate | null = null;
  for (const c of candidates) if (!top || c.damage > top.damage) top = c;
  return top;
}

/** Plays the highest-damage word available. */
export function greedyBot(seed: number): Bot {
  let rng = createRng(seed ^ 0x9e3779b9);
  return {
    name: 'greedy',
    chooseWord: (_s, candidates) => best(candidates),
    choosePick: (state) => {
      let i: number;
      [i, rng] = nextInt(rng, state.offer?.length ?? 1);
      return i;
    },
  };
}

/** Plays a random 4-5 letter word if one exists, else the best available. */
export function mediocreBot(seed: number): Bot {
  let rng: Rng = createRng(seed ^ 0x9e3779b9);
  return {
    name: 'mediocre',
    chooseWord: (_s, candidates) => {
      const mid = candidates.filter((c) => c.word.length >= 4 && c.word.length <= 5);
      if (mid.length === 0) return best(candidates);
      let i: number;
      [i, rng] = nextInt(rng, mid.length);
      return mid[i] ?? null;
    },
    choosePick: (state) => {
      let i: number;
      [i, rng] = nextInt(rng, state.offer?.length ?? 1);
      return i;
    },
  };
}

export function makeBot(name: BotName, seed: number): Bot {
  return name === 'greedy' ? greedyBot(seed) : mediocreBot(seed);
}

/** Next action for the bot given the current state, or null when the run is over. */
export function nextAction(bot: Bot, state: RunState, ctx: EngineContext): Action[] | null {
  if (state.phase === 'summary') return null;
  if (state.phase === 'pick') return [{ type: 'pickItem', index: bot.choosePick(state) }];
  const choice = bot.chooseWord(state, candidateWords(state, ctx));
  if (!choice) throw new Error('bot has no playable word: dead grid reached the player');
  const indices = candidateIndices(state, choice.word);
  if (!indices) throw new Error(`candidate ${choice.word} cannot be mapped to tiles`);
  return [...indices.map((index): Action => ({ type: 'toggleTile', index })), { type: 'submitWord' }];
}
