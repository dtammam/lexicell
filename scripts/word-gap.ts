/**
 * Diagnostic: the damage gap between bot policies on a fresh grid at turn 1.
 * Reproduces the "structural finding" table in the Phase 0 exec plan.
 *
 *   npm run diag:words [-- --seeds N]
 */
import { fileURLToPath } from 'node:url';
import { candidateWords } from '../src/engine/candidates';
import { newRun } from '../src/engine/reducer';
import { lengthBonus } from '../src/engine/scoring';
import { BOT_NAMES, makeBot, type BotName } from './lib/bots';
import { nodeContext } from './lib/context';

interface Row {
  readonly bot: BotName;
  readonly meanLength: number;
  readonly meanDamage: number;
  readonly meanLetterSum: number;
  readonly letterSumPerTile: number;
}

export function wordGap(seeds: number): Row[] {
  const ctx = nodeContext();
  return BOT_NAMES.map((name) => {
    let len = 0;
    let dmg = 0;
    let letters = 0;
    for (let seed = 0; seed < seeds; seed++) {
      const s = newRun(seed, ctx);
      const chosen = makeBot(name, seed).chooseWord(s, candidateWords(s, ctx));
      if (!chosen) throw new Error(`seed ${seed}: no word`);
      len += chosen.word.length;
      dmg += chosen.damage;
      letters += chosen.damage / lengthBonus(chosen.word.length, ctx.content.tuning);
    }
    return { bot: name, meanLength: len / seeds, meanDamage: dmg / seeds, meanLetterSum: letters / seeds, letterSumPerTile: letters / len };
  });
}

function main() {
  const i = process.argv.indexOf('--seeds');
  const seeds = i === -1 ? 300 : Number(process.argv[i + 1]);
  const rows = wordGap(seeds);
  console.log(`Fresh grid, turn 1, no items, ${seeds} seeds\n`);
  console.log('| bot | mean word length | mean damage | letter sum only | letter sum per tile |');
  console.log('|-----|------------------|-------------|-----------------|---------------------|');
  for (const r of rows) {
    console.log(`| ${r.bot} | ${r.meanLength.toFixed(1)} | ${r.meanDamage.toFixed(1)} | ${r.meanLetterSum.toFixed(1)} | ${r.letterSumPerTile.toFixed(2)} |`);
  }
  // Gap between the strongest policy and mediocre, whatever the strongest is called on this branch.
  const top = rows.reduce((a, b) => (b.meanDamage > a.meanDamage ? b : a));
  const m = rows.find((r) => r.bot === 'mediocre');
  if (m && top !== m) {
    console.log(`\n${top.bot}/mediocre damage ratio ${(top.meanDamage / m.meanDamage).toFixed(1)}x, letter-sum ratio ${(top.meanLetterSum / m.meanLetterSum).toFixed(1)}x`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
