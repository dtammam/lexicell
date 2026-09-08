/**
 * Per-item impact table: run every seed once per bot and bucket runs by the items held at the
 * end. Win rate with an item is compared against the whole population's rate. Noise is about
 * plus or minus 10 points when an item is held in ~100 runs, so read the table for degenerate
 * items (near 100%) and never-picked items before reading it for two-point differences: for
 * those, `--runs 10000`.
 *
 *   npx tsx scripts/item-impact.ts                 # 1500 runs per bot, mediocre and greedy
 *   npx tsx scripts/item-impact.ts --runs 10000
 *   npx tsx scripts/item-impact.ts --bot greedy
 */
import { fileURLToPath } from 'node:url';
import { CONTENT } from '../src/content/index';
import { nodeContext } from './lib/context';
import { BOT_NAMES, type BotName } from './lib/bots';
import { simulateRun } from './lib/simulate';

export interface ImpactRow {
  readonly id: string;
  readonly rarity: string;
  readonly picked: number;
  readonly winRate: number | null;
  readonly meanEncounters: number | null;
}

export function impact(bot: BotName, runs: number, ctx = nodeContext()): { base: number; rows: ImpactRow[] } {
  const withItem = new Map<string, { n: number; wins: number; enc: number }>();
  let totalWins = 0;
  for (let seed = 0; seed < runs; seed++) {
    const r = simulateRun(bot, seed, ctx);
    if (r.won) totalWins++;
    for (const id of new Set(r.items)) {
      const e = withItem.get(id) ?? { n: 0, wins: 0, enc: 0 };
      e.n++;
      if (r.won) e.wins++;
      e.enc += r.hpAtEncounterStart.length;
      withItem.set(id, e);
    }
  }
  const rows = ctx.content.items.map((item): ImpactRow => {
    const e = withItem.get(item.id);
    return { id: item.id, rarity: item.rarity, picked: e?.n ?? 0, winRate: e ? e.wins / e.n : null, meanEncounters: e ? e.enc / e.n : null };
  });
  return { base: runs === 0 ? 0 : totalWins / runs, rows };
}

export function renderImpact(bot: BotName, runs: number, result: { base: number; rows: ImpactRow[] }): string {
  const out = [`\n${bot}: ${runs} runs, base win ${(100 * result.base).toFixed(1)}%`, '| item | picked in | win rate with | mean encounters reached with |', '|---|---|---|---|'];
  for (const r of result.rows) {
    if (r.picked === 0) out.push(`| ${r.id} (${r.rarity}) | 0 | | |`);
    else out.push(`| ${r.id} (${r.rarity}) | ${r.picked} | ${(100 * (r.winRate ?? 0)).toFixed(0)}% | ${(r.meanEncounters ?? 0).toFixed(1)} |`);
  }
  return out.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  let runs = 1500;
  let bots: BotName[] = ['mediocre', 'greedy'];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--runs' && v) {
      runs = Number(v);
      i++;
    } else if (a === '--bot' && v) {
      if (!BOT_NAMES.includes(v as BotName)) throw new Error(`unknown bot ${v}`);
      bots = [v as BotName];
      i++;
    } else {
      throw new Error(`unknown argument ${a ?? ''}`);
    }
  }
  if (!Number.isInteger(runs) || runs <= 0) throw new Error('--runs must be a positive integer');
  const ctx = nodeContext();
  console.log(`Lexicell item impact: ${runs} runs per bot, ${CONTENT.items.length} items.`);
  for (const bot of bots) console.log(renderImpact(bot, runs, impact(bot, runs, ctx)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
