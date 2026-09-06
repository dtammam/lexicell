/**
 * Builds src/content/dictionary/words.txt from ENABLE.
 *
 * Source: ENABLE (Enhanced North American Benchmark Lexicon), public domain.
 *   https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
 * The raw file is not vendored; its sha256 is pinned below so a rebuild is
 * reproducible or fails loudly.
 *
 * Usage: npm run dict:build [-- --from <local enable1.txt>]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from '../src/engine/dictionary';

const SOURCE_URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';
const SOURCE_SHA256 = '3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89';

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

export function filterWords(raw: string, blocklistText: string): string[] {
  const blocked = new Set(
    blocklistText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  );
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const w = line.trim();
    if (w.length < MIN_WORD_LENGTH || w.length > MAX_WORD_LENGTH) continue;
    if (!/^[a-z]+$/.test(w)) continue;
    if (blocked.has(w)) continue;
    out.push(w);
  }
  out.sort();
  return out;
}

async function main() {
  const raw = await fetchSource();
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== SOURCE_SHA256) {
    throw new Error(`ENABLE source hash mismatch.\n  expected ${SOURCE_SHA256}\n  got      ${sha}`);
  }
  const blocklist = readFileSync(join(contentDir, 'blocklist.txt'), 'utf8');
  const words = filterWords(raw, blocklist);
  const outPath = join(contentDir, 'words.txt');
  writeFileSync(outPath, words.join('\n') + '\n');
  console.log(`ENABLE ${raw.split('\n').filter(Boolean).length} -> ${words.length} words (len ${MIN_WORD_LENGTH}-${MAX_WORD_LENGTH}, blocklist applied) -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
