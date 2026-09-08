/**
 * Phase 0 sim harness. Drives the reducer with bot policies over seeded runs.
 *
 *   npm run sim                         # all bots, 500 runs, all items
 *   npm run sim -- --bot greedy         # one bot
 *   npm run sim -- --runs 200
 *   npm run sim -- --items none         # drop the item pool entirely
 *   npm run sim -- --items lens,leech   # restrict the pool
 *   npm run sim -- --seed 1000          # seed base
 *   npm run sim -- --json               # machine-readable output
 *   npm run sim -- --variant pre-act1   # a named content variant (scripts/lib/variants.ts)
 *   npm run sim -- --cell aggro         # a starting cell (src/content/cells.ts)
 */
import { fileURLToPath } from 'node:url';
import { CONTENT } from '../src/content/index';
import type { Content } from '../src/engine/types';
import { BOT_NAMES, GREEDY_MAX_LENGTH, type BotName } from './lib/bots';
import { nodeContext } from './lib/context';
import { simulate, type Summary } from './lib/simulate';
import { VARIANT_NAMES, applyVariant, type VariantName } from './lib/variants';

interface Options {
  runs: number;
  bots: BotName[];
  items: 'all' | 'none' | string[];
  seedBase: number;
  json: boolean;
  variant: VariantName;
  /** Starting cell id; the default is the balanced cell the criteria are judged on. */
  cell: string;
}

export function parseArgs(argv: readonly string[]): Options {
  const opts: Options = { runs: 500, bots: [...BOT_NAMES], items: 'all', seedBase: 0, json: false, variant: 'base', cell: 'balanced' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case '--runs':
        opts.runs = Number(v);
        i++;
        break;
      case '--bot':
        if (v !== 'all') {
          if (!BOT_NAMES.includes(v as BotName)) throw new Error(`unknown bot ${v ?? ''}`);
          opts.bots = [v as BotName];
        }
        i++;
        break;
      case '--items':
        opts.items = v === 'all' || v === 'none' ? v : (v ?? '').split(',').filter(Boolean);
        i++;
        break;
      case '--seed':
        opts.seedBase = Number(v);
        i++;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--cell':
        if (!v || !CONTENT.cells.some((c) => c.id === v)) throw new Error(`--cell needs one of ${CONTENT.cells.map((c) => c.id).join(', ')}`);
        opts.cell = v;
        i++;
        break;
      case '--variant':
        if (!VARIANT_NAMES.includes(v as VariantName)) throw new Error(`unknown variant ${v ?? ''}`);
        opts.variant = v as VariantName;
        i++;
        break;
      default:
        throw new Error(`unknown argument ${a ?? ''}`);
    }
  }
  if (!Number.isInteger(opts.runs) || opts.runs <= 0) throw new Error('--runs must be a positive integer');
  return opts;
}

export function contentFor(items: Options['items'], variant: VariantName = 'base'): Content {
  const base = applyVariant(variant, CONTENT);
  if (items === 'all') return base;
  if (items === 'none') return { ...base, items: [] };
  const keep = new Set(items);
  const filtered = base.items.filter((i) => keep.has(i.id));
  const missing = items.filter((id) => !base.items.some((i) => i.id === id));
  if (missing.length) throw new Error(`unknown item ids: ${missing.join(', ')}`);
  return { ...base, items: filtered };
}

export interface Criteria {
  readonly mediocreInBand: boolean | null;
  readonly greedyWinsButNotAlways: boolean | null;
  readonly noDeadGrids: boolean;
}

/**
 * The roadmap's exit criteria. `null` means the bot was not run. The
 * item-sensitivity criterion needs two runs and is judged by hand. The
 * `solver` bot is reported but never judged (Dean, 2026-09-06).
 */
export function exitCriteria(summaries: readonly Summary[]): Criteria {
  const m = summaries.find((s) => s.bot === 'mediocre');
  const g = summaries.find((s) => s.bot === 'greedy');
  return {
    mediocreInBand: m ? m.winRate >= 0.2 && m.winRate <= 0.4 : null,
    greedyWinsButNotAlways: g ? g.winRate > 0 && g.winRate < 0.9 : null,
    // Dead grids throw inside the sim rather than being counted, so reaching here means none occurred.
    noDeadGrids: true,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function renderTable(summaries: readonly Summary[]): string {
  const head = ['bot', 'runs', 'win rate', 'median enc.', 'mean turns', 'scrambles', 'shuffles', ...Array.from({ length: 9 }, (_, i) => `HP@E${i + 1}`)];
  const rows = summaries.map((s) => [
    s.bot,
    String(s.runs),
    pct(s.winRate),
    String(s.medianEncounter),
    s.meanTurns.toFixed(1),
    String(s.totalScrambles),
    String(s.totalShuffles),
    ...s.meanHpPerEncounter.map((hp, i) => ((s.reachedPerEncounter[i] ?? 0) === 0 ? '-' : hp.toFixed(0))),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padStart(widths[i] ?? 0)).join(' | ')} |`;
  return [line(head), `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`, ...rows.map(line)].join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = nodeContext(contentFor(opts.items, opts.variant));
  const t0 = performance.now();
  const summaries = opts.bots.map((bot) => simulate(bot, ctx, opts.runs, opts.seedBase, opts.cell));
  const elapsed = (performance.now() - t0) / 1000;
  const criteria = exitCriteria(summaries);
  if (opts.json) {
    console.log(JSON.stringify({ options: opts, summaries, criteria, elapsedSeconds: elapsed }, null, 2));
    return;
  }
  const itemsLabel = opts.items === 'all' ? `all ${CONTENT.items.length} items` : opts.items === 'none' ? 'no items' : opts.items.join(',');
  console.log(`Lexicell sim: ${opts.runs} runs per bot, seeds ${opts.seedBase}..${opts.seedBase + opts.runs - 1}, ${itemsLabel}, variant ${opts.variant}, cell ${opts.cell}. ${elapsed.toFixed(1)}s\n`);
  console.log(renderTable(summaries));
  console.log('\nExit criteria:');
  const mark = (v: boolean | null) => (v === null ? 'n/a ' : v ? 'PASS' : 'FAIL');
  console.log(`  ${mark(criteria.mediocreInBand)}  mediocre wins 20-40%`);
  console.log(`  ${mark(criteria.greedyWinsButNotAlways)}  greedy (best word of <= ${GREEDY_MAX_LENGTH} letters) wins, but < 90%`);
  console.log(`  ${mark(criteria.noDeadGrids)}  no run hit a grid with zero valid words`);
  console.log(`  ----  win rate moves with items: compare against --items none`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
