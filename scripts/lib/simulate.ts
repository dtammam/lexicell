/** Run N seeded games with a bot and summarise. Pure over (bot, ctx, seeds); no printing here. */
import { newRun, reduce, type EngineContext } from '../../src/engine/reducer';
import type { RunState } from '../../src/engine/types';
import { makeBot, nextAction, type BotName } from './bots';

export interface RunResult {
  readonly seed: number;
  readonly won: boolean;
  /** 1-based encounter the run ended in (9 for a win). */
  readonly encounterReached: number;
  readonly hpAtEncounterStart: readonly number[];
  readonly turns: number;
  readonly scrambles: number;
  readonly finalHp: number;
  readonly items: readonly string[];
}

export function simulateRun(botName: BotName, seed: number, ctx: EngineContext): RunResult {
  const bot = makeBot(botName, seed);
  let state: RunState = newRun(seed, ctx);
  let scrambles = 0;
  for (let guard = 0; guard < 5000; guard++) {
    const actions = nextAction(bot, state, ctx);
    if (!actions) break;
    for (const a of actions) state = reduce(state, a, ctx);
    if (state.rejected) throw new Error(`seed ${seed}: bot action rejected: ${state.rejected}`);
    if (state.lastTurn?.scrambled) scrambles++;
  }
  if (state.phase !== 'summary') throw new Error(`seed ${seed}: run did not terminate`);
  return {
    seed,
    won: state.outcome === 'won',
    encounterReached: state.encounterIndex + 1,
    hpAtEncounterStart: state.stats.hpAtEncounterStart,
    turns: state.stats.turns,
    scrambles,
    finalHp: state.player.hp,
    items: state.player.items,
  };
}

export interface Summary {
  readonly bot: BotName;
  readonly runs: number;
  readonly winRate: number;
  readonly medianEncounter: number;
  /** Mean HP at the start of encounter i over runs that reached it. */
  readonly meanHpPerEncounter: readonly number[];
  readonly reachedPerEncounter: readonly number[];
  readonly meanTurns: number;
  readonly totalScrambles: number;
}

export function summarise(bot: BotName, results: readonly RunResult[]): Summary {
  const n = results.length;
  const wins = results.filter((r) => r.won).length;
  const reached = results.map((r) => r.encounterReached).sort((a, b) => a - b);
  const median = n === 0 ? 0 : n % 2 ? (reached[(n - 1) / 2] as number) : ((reached[n / 2 - 1] as number) + (reached[n / 2] as number)) / 2;
  const encounters = 9;
  const hpSum = new Array<number>(encounters).fill(0);
  const hpCount = new Array<number>(encounters).fill(0);
  for (const r of results) {
    r.hpAtEncounterStart.forEach((hp, i) => {
      hpSum[i] = (hpSum[i] ?? 0) + hp;
      hpCount[i] = (hpCount[i] ?? 0) + 1;
    });
  }
  return {
    bot,
    runs: n,
    winRate: n === 0 ? 0 : wins / n,
    medianEncounter: median,
    meanHpPerEncounter: hpSum.map((s, i) => ((hpCount[i] ?? 0) === 0 ? 0 : s / (hpCount[i] as number))),
    reachedPerEncounter: hpCount,
    meanTurns: n === 0 ? 0 : results.reduce((a, r) => a + r.turns, 0) / n,
    totalScrambles: results.reduce((a, r) => a + r.scrambles, 0),
  };
}

export function simulate(bot: BotName, ctx: EngineContext, runs: number, seedBase = 0): Summary {
  const results: RunResult[] = [];
  for (let i = 0; i < runs; i++) results.push(simulateRun(bot, seedBase + i, ctx));
  return summarise(bot, results);
}
