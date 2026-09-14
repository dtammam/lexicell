import { describe, expect, it } from 'vitest';
import { filterSupplement } from './build-supplement';

const baseline = 'cat\ndog\nthe\n';
const blocklist = '# slurs\nbadword\n';

describe('filterSupplement', () => {
  it('keeps only new, in-length, a-z, non-blocked words and drops baseline duplicates', () => {
    const raw = [
      'cat', // already baseline -> dropped
      'brewmaster', // new -> kept
      'aa', // too short -> dropped
      'a'.repeat(16), // too long -> dropped
      "can't", // non a-z -> dropped
      'badword', // blocklisted -> dropped
      'DOG', // baseline (case-folded) -> dropped
      'zebra', // new -> kept
    ].join('\n');
    expect(filterSupplement(raw, baseline, blocklist)).toEqual(['brewmaster', 'zebra']);
  });

  it('is sorted and de-duplicated', () => {
    expect(filterSupplement('zebra\napple\napple\n', baseline, blocklist)).toEqual(['apple', 'zebra']);
  });

  it('returns nothing when every word is already in the baseline', () => {
    expect(filterSupplement('cat\ndog\nthe\n', baseline, blocklist)).toEqual([]);
  });
});
