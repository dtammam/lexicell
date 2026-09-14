import { describe, expect, it } from 'vitest';
import { loadDictionary, loadFullDictionary } from '../../scripts/lib/load-dictionary';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, createDictionary } from './dictionary';

describe('createDictionary', () => {
  it('accepts listed words and rejects others, case-insensitively', () => {
    const d = createDictionary('cat\ndog\nzymurgy\n');
    expect(d.has('cat')).toBe(true);
    expect(d.has('CAT')).toBe(true);
    expect(d.has('cats')).toBe(false);
    expect(d.has('')).toBe(false);
    expect(d.size).toBe(3);
  });

  it('re-applies the length cap even if the file has junk', () => {
    const d = createDictionary('aa\nabc\n' + 'a'.repeat(16) + '\n');
    expect(d.has('aa')).toBe(false);
    expect(d.has('abc')).toBe(true);
    expect(d.has('a'.repeat(16))).toBe(false);
  });

  it('exposes a sorted, de-duplicated word array', () => {
    const d = createDictionary('dog\ncat\ncat\n');
    expect(d.words).toEqual(['cat', 'dog']);
  });
});

describe('shipped ENABLE list', () => {
  const d = loadDictionary();

  it('has the expected size for ENABLE minus the length cap minus the blocklist', () => {
    // ENABLE: 172,823 entries. Dropped: 96 two-letter, 4,272 over 15 letters, 44 blocklisted.
    // Pinned so a silent change to the source, cap, or blocklist fails here.
    expect(d.size).toBe(172_823 - 96 - 4_272 - 44);
  });

  it('known words are in', () => {
    for (const w of ['cat', 'quiz', 'aardvark', 'zymurgy', 'qat', 'jazz', 'the', 'oxen']) {
      expect(d.has(w), w).toBe(true);
    }
  });

  it('known non-words are out', () => {
    for (const w of ['xyzzy', 'qzj', 'catt', 'lexicell', 'aa', 'oe']) {
      expect(d.has(w), w).toBe(false);
    }
  });

  it('blocklisted words are out', () => {
    for (const w of ['nigger', 'kike', 'faggot', 'wetback']) {
      expect(d.has(w), w).toBe(false);
    }
  });

  it('every word is lowercase a-z within the length cap', () => {
    for (const w of d.words) {
      if (!/^[a-z]+$/.test(w) || w.length < MIN_WORD_LENGTH || w.length > MAX_WORD_LENGTH) {
        throw new Error(`bad word in shipped list: ${JSON.stringify(w)}`);
      }
    }
  });
});

describe('full validation set (baseline + supplement)', () => {
  const base = loadDictionary();
  const full = loadFullDictionary();

  it('is the baseline unioned with the disjoint supplement', () => {
    // baseline 168,411 + supplement 211,566 (words_alpha minus ENABLE, len 3-15, blocklist).
    // Pinned so a silent change to the supplement source (sha in build-supplement.ts), cap, or
    // blocklist fails here. The supplement is disjoint from the baseline by construction.
    expect(full.size).toBe(168_411 + 211_566);
    expect(full.size).toBe(base.size + 211_566);
  });

  it('accepts words the baseline lacked (the ask: brewmaster and friends)', () => {
    for (const w of ['brewmaster', 'unfriend']) {
      expect(base.has(w), `baseline should lack ${w}`).toBe(false);
      expect(full.has(w), `full should have ${w}`).toBe(true);
    }
  });

  it('is a superset of the baseline', () => {
    for (const w of ['cat', 'quiz', 'aardvark', 'zymurgy', 'the']) expect(full.has(w), w).toBe(true);
  });

  it('still drops blocklisted words', () => {
    for (const w of ['nigger', 'kike', 'faggot', 'wetback']) expect(full.has(w), w).toBe(false);
  });

  it('every word is lowercase a-z within the length cap', () => {
    for (const w of full.words) {
      if (!/^[a-z]+$/.test(w) || w.length < MIN_WORD_LENGTH || w.length > MAX_WORD_LENGTH) {
        throw new Error(`bad word in full set: ${JSON.stringify(w)}`);
      }
    }
  });
});
