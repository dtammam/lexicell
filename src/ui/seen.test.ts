import { describe, expect, it } from 'vitest';
import type { StorageLike } from './persist';
import { loadSeenBuild, SEEN_BUILD_KEY, saveSeenBuild, shouldShowReleaseNotes } from './seen';

function fake(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('seen build storage', () => {
  it('round-trips an integer build and reads null when absent or junk', () => {
    const s = fake();
    expect(loadSeenBuild(s)).toBe(null);
    saveSeenBuild(s, 111);
    expect(s.data.get(SEEN_BUILD_KEY)).toBe('111');
    expect(loadSeenBuild(s)).toBe(111);
    expect(loadSeenBuild(fake({ [SEEN_BUILD_KEY]: 'nope' }))).toBe(null);
  });
});

describe('shouldShowReleaseNotes', () => {
  const P = (seen: number | null, current: number | null, hasPlayed: boolean) => shouldShowReleaseNotes({ seen, current, hasPlayed });

  it('shows a returning player the notes once per newer build', () => {
    expect(P(null, 111, true)).toBe(true); // played before this feature: catch them up once
    expect(P(110, 111, true)).toBe(true); // a newer build shipped
    expect(P(111, 111, true)).toBe(false); // already seen this build
    expect(P(112, 111, true)).toBe(false); // never go backwards (defensive)
  });

  it('never interrupts a brand-new player or when there is no build', () => {
    expect(P(null, 111, false)).toBe(false); // brand-new: no prior play
    expect(P(110, null, true)).toBe(false); // no build number yet
  });
});
