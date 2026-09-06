/** Node-side loader for the shipped word list. Tests and the sim use this; the browser will `?raw`-import instead. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDictionary, type Dictionary } from '../../src/engine/dictionary';

const here = dirname(fileURLToPath(import.meta.url));
export const WORDS_PATH = join(here, '..', '..', 'src', 'content', 'dictionary', 'words.txt');

let cached: Dictionary | undefined;

export function loadDictionary(): Dictionary {
  cached ??= createDictionary(readFileSync(WORDS_PATH, 'utf8'));
  return cached;
}
