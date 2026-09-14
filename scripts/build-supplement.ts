/**
 * Builds src/content/dictionary/supplement.txt: the words a player may spell
 * that the ENABLE baseline (words.txt) does not already contain.
 *
 * Source: words_alpha from dwyl/english-words, public domain (Unlicense).
 *   https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt
 * The raw file is not vendored; its sha256 is pinned below so a rebuild is
 * reproducible or fails loudly.
 *
 * The supplement is used ONLY to validate a word a player played (and to
 * resolve a wild tile). It is never fed to the solver, so it never touches
 * grid generation, the "best there" reveal, word-of-the-day or the sim, and
 * seed reproducibility and balance are unaffected. See
 * docs/exec-plans/active/dictionary-expansion.md.
 *
 * Usage: npm run supp:build [-- --from <local words_alpha.txt>]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from '../src/engine/dictionary';

const SOURCE_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';
const SOURCE_SHA256 = '3ed0c94610d8bcf7c11bbb49c56aa49c7234d32b66824df91f554169e572da48';

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, '..', 'src', 'content', 'dictionary');

async function fetchSource(): Promise<string> {
  const fromIdx = process.argv.indexOf('--from');
  if (fromIdx !== -1) {
    const path = process.argv[fromIdx + 1];
    if (!path) throw new Error('--from needs a path');
    return readFileSync(path, 'utf8');
  }
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * The words_alpha entries that pass the same length/charset/blocklist filter as
 * the baseline and are not already in it. `baselineText` and `blocklistText` are
 * the shipped words.txt and blocklist.txt.
 */
export function filterSupplement(raw: string, baselineText: string, blocklistText: string): string[] {
  const blocked = new Set(
    blocklistText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  );
  const baseline = new Set(
    baselineText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const out = new Set<string>();
  for (const line of raw.split('\n')) {
    const w = line.trim().toLowerCase();
    if (w.length < MIN_WORD_LENGTH || w.length > MAX_WORD_LENGTH) continue;
    if (!/^[a-z]+$/.test(w)) continue;
    if (blocked.has(w)) continue;
    if (baseline.has(w)) continue;
    out.add(w);
  }
  return Array.from(out).sort();
}

async function main() {
  const raw = await fetchSource();
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== SOURCE_SHA256) {
    throw new Error(`words_alpha source hash mismatch.\n  expected ${SOURCE_SHA256}\n  got      ${sha}`);
  }
  const baseline = readFileSync(join(contentDir, 'words.txt'), 'utf8');
  const blocklist = readFileSync(join(contentDir, 'blocklist.txt'), 'utf8');
  const words = filterSupplement(raw, baseline, blocklist);
  const outPath = join(contentDir, 'supplement.txt');
  writeFileSync(outPath, words.join('\n') + '\n');
  const baseCount = baseline.split('\n').filter(Boolean).length;
  console.log(
    `words_alpha ${raw.split('\n').filter(Boolean).length} -> supplement ${words.length} (len ${MIN_WORD_LENGTH}-${MAX_WORD_LENGTH}, blocklist applied, minus ${baseCount} baseline) -> ${outPath}`,
  );
  console.log(`validation set will be ${baseCount + words.length} words`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
