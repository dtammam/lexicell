/** Node-side loader for the shipped word list. Tests and the sim use this; the browser will `?raw`-import instead. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDictionary, type Dictionary } from '../../src/engine/dictionary';

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, '..', '..', 'src', 'content', 'dictionary');
export const WORDS_PATH = join(contentDir, 'words.txt');
export const SUPPLEMENT_PATH = join(contentDir, 'supplement.txt');

let cachedBaseline: Dictionary | undefined;
let cachedFull: Dictionary | undefined;

/**
 * The BASELINE (ENABLE) list. This is the solver's list everywhere: grid
 * generation, isDead, the "best there" reveal, word-of-the-day and the sim all
 * read the solver, so keeping this fixed keeps seeds reproducible and balance
 * stable. Do not build a solver from anything else.
 */
export function loadDictionary(): Dictionary {
  cachedBaseline ??= createDictionary(readFileSync(WORDS_PATH, 'utf8'));
  return cachedBaseline;
}

/**
 * The FULL validation set: the baseline unioned with supplement.txt (words_alpha
 * minus ENABLE). Used only to validate a word a player played (ctx.dictionary),
 * never to build a solver. See docs/exec-plans/active/dictionary-expansion.md.
 */
export function loadFullDictionary(): Dictionary {
  cachedFull ??= createDictionary(readFileSync(WORDS_PATH, 'utf8') + '\n' + readFileSync(SUPPLEMENT_PATH, 'utf8'));
  return cachedFull;
}
