/**
 * Builds src/content/dictionary/definitions.txt from a WordNet 3.1 database directory:
 * one `word<TAB>gloss` line per ENABLE word that WordNet can define, sorted.
 *
 *   npm run defs:build -- --wordnet /path/to/wordnet/dict
 *
 * WordNet is not committed; download wn3.1.dict.tar.gz from wordnetcode.princeton.edu
 * and point --wordnet at the extracted dict/ folder. The WordNet licence (permissive,
 * attribution required) is reproduced in src/content/dictionary/WORDNET-LICENSE.txt.
 *
 * Sense choice: index.sense carries a tag count per sense from the semantic
 * concordance; the most-tagged sense wins, ties go noun, verb, adjective, adverb. The
 * gloss is cut to its first clause and stripped of example sentences. ENABLE is full of
 * inflected forms WordNet lists only as lemmas, so a morphology pass (WordNet's own
 * exception lists plus its detachment rules) maps plurals, tenses and comparatives back
 * to a defined base form and reuses its gloss.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Pos = 'noun' | 'verb' | 'adj' | 'adv';
const POS_ORDER: readonly Pos[] = ['noun', 'verb', 'adj', 'adv'];
const SS_TYPE_TO_POS: Readonly<Record<string, Pos>> = { '1': 'noun', '2': 'verb', '3': 'adj', '4': 'adv', '5': 'adj' };

export interface Sense {
  readonly lemma: string;
  readonly pos: Pos;
  readonly offset: string;
  readonly tagCount: number;
}

/** index.sense lines: `lemma%ss_type:lex_filenum:lex_id:head:head_id offset sense_number tag_cnt`. */
export function parseIndexSense(text: string): Sense[] {
  const out: Sense[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [key, offset, , tag] = line.split(' ');
    if (!key || !offset || tag === undefined) continue;
    const pct = key.indexOf('%');
    const lemma = key.slice(0, pct);
    const ssType = key.slice(pct + 1, pct + 2);
    const pos = SS_TYPE_TO_POS[ssType];
    if (!pos || lemma.includes('_') || !/^[a-z]+$/.test(lemma)) continue;
    out.push({ lemma, pos, offset, tagCount: Number(tag) });
  }
  return out;
}

/** data.<pos> lines: `offset lex_filenum ss_type ... | gloss`. Returns offset -> first clause of the gloss. */
export function parseDataGlosses(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const bar = line.indexOf('|');
    if (bar < 0) continue;
    const offset = line.slice(0, 8);
    const gloss = firstClause(line.slice(bar + 1));
    if (gloss) out.set(offset, gloss);
  }
  return out;
}

/** The definition proper: before any example sentence, first semicolon-separated clause, trimmed. */
export function firstClause(gloss: string): string {
  let g = gloss.trim();
  const quote = g.indexOf('"');
  if (quote >= 0) g = g.slice(0, quote);
  g = g.split(';')[0] ?? '';
  g = g.replace(/\s+/g, ' ').trim();
  g = g.replace(/[\s,:]+$/, '');
  if (g.length > 120) g = `${g.slice(0, 117).replace(/\s+\S*$/, '')}...`;
  return g;
}

/** Best sense per lemma: highest tag count, then part-of-speech order. */
export function bestSenses(senses: readonly Sense[]): Map<string, Sense> {
  const best = new Map<string, Sense>();
  for (const s of senses) {
    const cur = best.get(s.lemma);
    if (!cur || s.tagCount > cur.tagCount || (s.tagCount === cur.tagCount && POS_ORDER.indexOf(s.pos) < POS_ORDER.indexOf(cur.pos))) {
      best.set(s.lemma, s);
    }
  }
  return best;
}

/** WordNet's detachment rules (morphy), per part of speech: [suffix, replacement]. */
const RULES: Readonly<Record<Pos, readonly (readonly [string, string])[]>> = {
  noun: [
    ['s', ''],
    ['ses', 's'],
    ['xes', 'x'],
    ['zes', 'z'],
    ['ches', 'ch'],
    ['shes', 'sh'],
    ['men', 'man'],
    ['ies', 'y'],
  ],
  verb: [
    ['s', ''],
    ['ies', 'y'],
    ['es', 'e'],
    ['es', ''],
    ['ed', 'e'],
    ['ed', ''],
    ['ing', 'e'],
    ['ing', ''],
  ],
  adj: [
    ['er', ''],
    ['est', ''],
    ['er', 'e'],
    ['est', 'e'],
  ],
  adv: [],
};

/** `.exc` files: `inflected base [base...]`. */
export function parseExceptions(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    const [infl, base] = line.split(' ');
    if (infl && base && !infl.includes('_') && !base.includes('_')) out.set(infl, base);
  }
  return out;
}

/** Candidate base forms for a word under a part of speech, exceptions first, then rules. Never the word itself. */
export function baseForms(word: string, pos: Pos, exceptions: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  const exc = exceptions.get(word);
  if (exc) out.push(exc);
  for (const [suffix, repl] of RULES[pos]) {
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
      const base = word.slice(0, -suffix.length) + repl;
      if (base !== word && !out.includes(base)) out.push(base);
    }
  }
  return out;
}

export interface Definitions {
  readonly lines: readonly string[];
  readonly direct: number;
  readonly inflected: number;
  readonly total: number;
}

export function buildDefinitions(
  words: readonly string[],
  senses: readonly Sense[],
  glosses: Readonly<Record<Pos, ReadonlyMap<string, string>>>,
  exceptions: Readonly<Record<Pos, ReadonlyMap<string, string>>>,
): Definitions {
  const best = bestSenses(senses);
  const byPos = new Map<string, Map<Pos, Sense>>();
  for (const s of senses) {
    let m = byPos.get(s.lemma);
    if (!m) byPos.set(s.lemma, (m = new Map<Pos, Sense>()));
    const cur = m.get(s.pos);
    if (!cur || s.tagCount > cur.tagCount) m.set(s.pos, s);
  }
  const glossOf = (s: Sense) => glosses[s.pos].get(s.offset);
  const lines: string[] = [];
  let direct = 0;
  let inflected = 0;
  for (const w of words) {
    const own = best.get(w);
    const ownGloss = own ? glossOf(own) : undefined;
    if (ownGloss) {
      lines.push(`${w}\t${ownGloss}`);
      direct++;
      continue;
    }
    let found: string | undefined;
    for (const pos of POS_ORDER) {
      for (const base of baseForms(w, pos, exceptions[pos])) {
        const sense = byPos.get(base)?.get(pos);
        const g = sense ? glossOf(sense) : undefined;
        if (g) {
          found = g;
          break;
        }
      }
      if (found) break;
    }
    if (found) {
      lines.push(`${w}\t${found}`);
      inflected++;
    }
  }
  return { lines, direct, inflected, total: words.length };
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--wordnet');
  const wordnet = at >= 0 ? args[at + 1] : undefined;
  if (!wordnet) throw new Error('usage: build-definitions --wordnet <path to WordNet dict/>');
  const here = fileURLToPath(new URL('.', import.meta.url));
  const dictDir = join(here, '..', 'src', 'content', 'dictionary');
  const words = readFileSync(join(dictDir, 'words.txt'), 'utf8').split('\n').filter(Boolean);
  const read = (f: string) => readFileSync(join(wordnet, f), 'utf8');
  const senses = parseIndexSense(read('index.sense'));
  const glosses: Record<Pos, Map<string, string>> = {
    noun: parseDataGlosses(read('data.noun')),
    verb: parseDataGlosses(read('data.verb')),
    adj: parseDataGlosses(read('data.adj')),
    adv: parseDataGlosses(read('data.adv')),
  };
  const exceptions: Record<Pos, Map<string, string>> = {
    noun: parseExceptions(read('noun.exc')),
    verb: parseExceptions(read('verb.exc')),
    adj: parseExceptions(read('adj.exc')),
    adv: parseExceptions(read('adv.exc')),
  };
  const defs = buildDefinitions(words, senses, glosses, exceptions);
  const out = join(dictDir, 'definitions.txt');
  writeFileSync(out, `${defs.lines.join('\n')}\n`);
  const pct = (n: number) => `${((100 * n) / defs.total).toFixed(1)}%`;
  console.log(`definitions: ${defs.lines.length} of ${defs.total} words (${pct(defs.lines.length)}): ${defs.direct} direct (${pct(defs.direct)}), ${defs.inflected} via morphology (${pct(defs.inflected)}) -> ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
