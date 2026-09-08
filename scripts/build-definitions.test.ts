import { describe, expect, it } from 'vitest';
import { baseForms, bestSenses, buildDefinitions, firstClause, parseDataGlosses, parseExceptions, parseIndexSense, type Pos } from './build-definitions';

const INDEX_SENSE = [
  'cell%1:03:00:: 00006484 1 5',
  'cell%1:06:00:: 03040376 2 12',
  'cell%2:32:00:: 01234567 1 0',
  'run%2:38:00:: 01926311 1 40',
  'run%1:04:00:: 00189565 3 9',
  'ice_cream%1:13:00:: 07610620 1 1',
  'a.m.%4:02:00:: 00100000 1 0',
].join('\n');

const DATA_NOUN = [
  '  1 This software and database is being provided',
  '00006484 03 n 01 cell 0 002 @ 00004258 n 0000 ~ 00006680 n 0000 | (biology) the basic structural and functional unit of all organisms; they may exist as independent units of life  ',
  '03040376 06 n 01 cell 0 001 @ 03050000 n 0000 | a room where a prisoner is kept  ',
  '00189565 04 n 01 run 0 001 @ 00189000 n 0000 | a score in baseball made by a runner touching all four bases safely; "the Yankees scored 3 runs"  ',
].join('\n');

const DATA_VERB = ['01926311 38 v 01 run 0 001 @ 01900000 v 0000 | move fast by using one\'s feet, with one foot off the ground at any given time; "Don\'t run--you\'ll be out of breath"  '].join('\n');

describe('build-definitions', () => {
  it('parses index.sense into single-word senses with a part of speech and tag count', () => {
    const senses = parseIndexSense(INDEX_SENSE);
    expect(senses.map((s) => `${s.lemma}/${s.pos}/${s.tagCount}`)).toEqual(['cell/noun/5', 'cell/noun/12', 'cell/verb/0', 'run/verb/40', 'run/noun/9']);
  });

  it('reads glosses by offset and keeps only the first clause without the example', () => {
    const g = parseDataGlosses(DATA_NOUN);
    expect(g.get('00006484')).toBe('(biology) the basic structural and functional unit of all organisms');
    expect(g.get('00189565')).toBe('a score in baseball made by a runner touching all four bases safely');
    expect(g.has('  1 This')).toBe(false);
  });

  it('firstClause trims examples, semicolons, trailing punctuation and very long glosses', () => {
    expect(firstClause(' a room; "the cell was cold" ')).toBe('a room');
    expect(firstClause('something, ')).toBe('something');
    const long = firstClause(`${'word '.repeat(40)}end`);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('...')).toBe(true);
  });

  it('the best sense is the most tagged one, ties broken noun before verb', () => {
    const best = bestSenses(parseIndexSense(INDEX_SENSE));
    expect(best.get('cell')?.offset).toBe('03040376');
    expect(best.get('run')?.pos).toBe('verb');
    const tie = bestSenses([
      { lemma: 'x', pos: 'verb', offset: '1', tagCount: 3 },
      { lemma: 'x', pos: 'noun', offset: '2', tagCount: 3 },
    ]);
    expect(tie.get('x')?.pos).toBe('noun');
  });

  it('baseForms: exceptions first, then the detachment rules, never the word itself', () => {
    const exc = parseExceptions('mice mouse\nfeet foot\nice_creams ice_cream');
    expect(baseForms('mice', 'noun', exc)).toEqual(['mouse']);
    expect(baseForms('cells', 'noun', new Map())).toEqual(['cell']);
    expect(baseForms('boxes', 'noun', new Map())).toEqual(['boxe', 'box']);
    expect(baseForms('running', 'verb', new Map())).toEqual(['runne', 'runn']);
    expect(baseForms('faster', 'adj', new Map())).toEqual(['fast', 'faste']);
    expect(baseForms('ss', 'noun', new Map())).toEqual([]);
    expect(exc.has('ice_creams')).toBe(false);
  });

  it('buildDefinitions defines direct lemmas, maps inflections onto them, skips the undefinable', () => {
    const senses = parseIndexSense(INDEX_SENSE);
    const glosses: Record<Pos, Map<string, string>> = {
      noun: parseDataGlosses(DATA_NOUN),
      verb: parseDataGlosses(DATA_VERB),
      adj: new Map(),
      adv: new Map(),
    };
    const exceptions: Record<Pos, Map<string, string>> = { noun: new Map(), verb: parseExceptions('ran run'), adj: new Map(), adv: new Map() };
    const d = buildDefinitions(['cell', 'cells', 'ran', 'runs', 'zzyzx'], senses, glosses, exceptions);
    expect(d.lines).toEqual([
      'cell\ta room where a prisoner is kept',
      'cells\ta room where a prisoner is kept',
      "ran\tmove fast by using one's feet, with one foot off the ground at any given time",
      'runs\ta score in baseball made by a runner touching all four bases safely',
    ]);
    expect(d).toMatchObject({ direct: 1, inflected: 3, total: 5 });
  });
});
