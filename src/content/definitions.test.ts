import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORDS_PATH } from '../../scripts/lib/load-dictionary';

const DEFS_PATH = WORDS_PATH.replace(/words\.txt$/, 'definitions.txt');

describe('definitions.txt', () => {
  const lines = readFileSync(DEFS_PATH, 'utf8').split('\n').filter(Boolean);
  const words = new Set(readFileSync(WORDS_PATH, 'utf8').split('\n').filter(Boolean));

  it('is word<TAB>gloss, one tab, no empty side, sorted, and every word is a playable word', () => {
    expect(lines.length).toBeGreaterThan(50_000);
    // One pass, violations collected: an expect per line takes ten seconds over 100k lines.
    const bad: string[] = [];
    let prev = '';
    for (const line of lines) {
      const tab = line.indexOf('\t');
      const w = line.slice(0, tab);
      const g = line.slice(tab + 1);
      if (tab <= 0 || g.includes('\t')) bad.push(`tabs: ${line}`);
      else if (!(w > prev)) bad.push(`order: ${prev} then ${w}`);
      else if (!words.has(w)) bad.push(`not playable: ${w}`);
      else if (g.length === 0 || g.length > 120) bad.push(`gloss length: ${w}`);
      else if (g.includes('"')) bad.push(`example leaked: ${w}`);
      prev = w;
      if (bad.length > 20) break;
    }
    expect(bad).toEqual([]);
  });

  it('covers the words the placeholder content leans on', () => {
    const defined = new Set(lines.map((l) => l.split('\t')[0]));
    for (const w of ['cell', 'cells', 'amoeba', 'grow', 'word', 'words']) expect(defined.has(w), w).toBe(true);
  });
});
