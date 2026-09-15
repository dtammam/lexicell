/**
 * Power-scaling diagnostic (2026-09-14, phuzion's "one-shot 25+ enemies" report).
 *
 * The exit-criteria sim reports win rates; it never measured HOW HARD a bot hits relative to enemy
 * HP, which is the actual complaint. This drives the `stacker` bot (longwordmaxxing + greedy offense
 * drafting) and records, per fight, the first word's damage against the enemy's max HP. It prints:
 *   - one-shot rate: the share of fights the first word kills outright
 *   - overkill: first-word damage / enemy max HP (median), how many times over a single word covers
 *     the HP bar
 *   - words-to-kill (median)
 * bucketed by encounter number, so the "rich get richer" curve is visible.
 *
 * Usage: npm run power [-- --bot stacker] [--runs 300] [--seed 0] [--cell balanced]
 * Read-only: no content or engine change. Pair reruns before/after a tuning pass.
 */
import { fileURLToPath } from 'node:url';
import type { RunState } from '../src/engine/types';
import { candidateWords } from '../src/engine/candidates';
import { newRun, reduce } from '../src/engine/reducer';
import { makeBot, nextAction, type BotName } from './lib/bots';
import { nodeContext } from './lib/context';

interface Fight {
  readonly encounter: number; // 1-based
  readonly enemyMaxHp: number;
  readonly firstWordDamage: number;
  /** Best 4-5 letter word available on the first grid: a proxy for what a WEAK (mediocre) player hits. */
  readonly weakWordDamage: number;
  readonly wordsToKill: number;
  readonly oneShot: boolean;
}

function fightsForRun(botName: BotName, seed: number, mode: 'normal' | 'endless', maxDepth: number): { fights: Fight[]; depthReached: number } {
  const ctx = nodeContext();
  const bot = makeBot(botName, seed);
  let state: RunState = newRun(seed, ctx, undefined, mode);
  const fights: Fight[] = [];
  let cur: { encounter: number; enemyMaxHp: number; firstWordDamage: number; weakWordDamage: number; words: number } | null = null;
  for (let guard = 0; guard < 200000; guard++) {
    // Endless never ends on its own if the curve is too shallow; cap the measurement depth so a run
    // that out-scales the wall is bounded (it reads as "reached the cap", i.e. the curve is too soft).
    if (state.encounter && state.encounterIndex + 1 > maxDepth) break;
    const actions = nextAction(bot, state, ctx);
    if (!actions) break;
    // Raw word damage (the "8000-point word"): the best candidate's previewed damage, which applies
    // the same armour/resist the reducer does but is NOT clamped to the enemy's remaining HP the way
    // lastTurn.damage is. This is what makes overkill visible; the stacker plays exactly this word.
    let pre: { encounter: number; enemyMaxHp: number; rawDamage: number; weakDamage: number } | null = null;
    if (state.phase === 'fight' && state.encounter && actions.some((a) => a.type === 'submitWord')) {
      const cands = candidateWords(state, ctx);
      pre = {
        encounter: state.encounterIndex + 1,
        enemyMaxHp: state.encounter.enemy.maxHp,
        rawDamage: Math.max(0, ...cands.map((c) => c.damage)),
        weakDamage: Math.max(0, ...cands.filter((c) => c.word.length >= 4 && c.word.length <= 5).map((c) => c.damage)),
      };
    }
    for (const a of actions) state = reduce(state, a, ctx);
    if (state.rejected) throw new Error(`seed ${seed}: ${state.rejected}`);
    if (pre) {
      const killed = state.phase !== 'fight'; // a word that kills ends the fight (reward phase / summary)
      if (!cur) cur = { encounter: pre.encounter, enemyMaxHp: pre.enemyMaxHp, firstWordDamage: pre.rawDamage, weakWordDamage: pre.weakDamage, words: 0 };
      cur.words++;
      if (killed) {
        fights.push({ encounter: cur.encounter, enemyMaxHp: cur.enemyMaxHp, firstWordDamage: cur.firstWordDamage, weakWordDamage: cur.weakWordDamage, wordsToKill: cur.words, oneShot: cur.words === 1 });
        cur = null;
      }
    }
  }
  const depthReached = state.phase === 'summary' ? state.encounterIndex + 1 : maxDepth;
  return { fights, depthReached };
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i] as number;
}
const median = (xs: number[]) => quantile(xs, 0.5);

function main() {
  const argv = process.argv.slice(2);
  const arg = (flag: string, def: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? (argv[i + 1] ?? def) : def;
  };
  const bot = arg('--bot', 'stacker') as BotName;
  const runs = Number(arg('--runs', '300'));
  const seedBase = Number(arg('--seed', '0'));
  const mode: 'normal' | 'endless' = arg('--mode', 'normal') === 'endless' ? 'endless' : 'normal';
  const maxDepth = Number(arg('--maxdepth', mode === 'endless' ? '60' : '9'));

  const all: Fight[] = [];
  const depths: number[] = [];
  for (let i = 0; i < runs; i++) {
    const r = fightsForRun(bot, seedBase + i, mode, maxDepth);
    all.push(...r.fights);
    depths.push(r.depthReached);
  }

  console.log(`Power-scaling: bot ${bot}, mode ${mode}, ${runs} runs, seeds ${seedBase}..${seedBase + runs - 1}, ${all.length} fights.`);
  if (mode === 'endless') {
    const capped = depths.filter((d) => d >= maxDepth).length;
    console.log(`Endless depth reached (slot the run ended on): median ${median(depths)}, p90 ${quantile(depths, 0.9)}, max ${Math.max(...depths)}, min ${Math.min(...depths)}. ${capped}/${runs} hit the ${maxDepth} measurement cap (curve too soft to end them).`);
  }
  console.log('');
  console.log('| enc | fights | one-shot % | overkill x (med) | overkill x (p90) | enemy HP | strong word | weak word | strong/weak |');
  console.log('|-----|--------|------------|------------------|------------------|----------|-------------|-----------|-------------|');
  const maxEnc = Math.max(1, ...all.map((f) => f.encounter));
  for (let e = 1; e <= maxEnc; e++) {
    const fs = all.filter((f) => f.encounter === e);
    if (fs.length === 0) continue;
    const oneShots = fs.filter((f) => f.oneShot).length;
    const ratios = fs.map((f) => f.firstWordDamage / f.enemyMaxHp);
    const hp = median(fs.map((f) => f.enemyMaxHp));
    const strong = median(fs.map((f) => f.firstWordDamage));
    const weak = median(fs.map((f) => f.weakWordDamage));
    console.log(
      `| ${String(e).padStart(3)} | ${String(fs.length).padStart(6)} | ${((100 * oneShots) / fs.length).toFixed(1).padStart(10)} | ${median(ratios).toFixed(1).padStart(16)} | ${quantile(ratios, 0.9).toFixed(1).padStart(16)} | ${hp.toFixed(0).padStart(8)} | ${strong.toFixed(0).padStart(11)} | ${weak.toFixed(0).padStart(9)} | ${(weak > 0 ? strong / weak : 0).toFixed(1).padStart(11)} |`,
    );
  }
  const totalOneShot = all.filter((f) => f.oneShot).length;
  const allRatios = all.map((f) => f.firstWordDamage / f.enemyMaxHp);
  console.log(`\nOverall one-shot rate: ${((100 * totalOneShot) / all.length).toFixed(1)}% of ${all.length} fights.`);
  console.log(`Overall overkill: median ${median(allRatios).toFixed(1)}x, p90 ${quantile(allRatios, 0.9).toFixed(1)}x, max ${Math.max(...allRatios).toFixed(1)}x the enemy's HP on the first word.`);
  console.log(`Median words-to-kill: ${median(all.map((f) => f.wordsToKill)).toFixed(1)}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
