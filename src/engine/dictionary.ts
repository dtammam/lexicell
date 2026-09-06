/**
 * Word validation. The dictionary is a resource passed *into* the engine
 * (reducer context), never part of run state — a Set is not JSON, and ~170k
 * strings do not belong in localStorage.
 *
 * Build words.txt with `npm run dict:build`; see scripts/build-dictionary.ts
 * for the ENABLE source URL, pinned hash, and filtering.
 */

export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 15;

export interface Dictionary {
  /** Every accepted word, lowercase, sorted. Read-only; the solver iterates this. */
  readonly words: readonly string[];
  readonly size: number;
  has(word: string): boolean;
}

/** Parse newline-separated words. Length cap is re-applied defensively. */
export function createDictionary(text: string): Dictionary {
  const set = new Set<string>();
  for (const line of text.split('\n')) {
    const w = line.trim();
    if (w.length >= MIN_WORD_LENGTH && w.length <= MAX_WORD_LENGTH) set.add(w);
  }
  const words = Array.from(set).sort();
  return {
    words,
    size: words.length,
    has: (word) => set.has(word.toLowerCase()),
  };
}
