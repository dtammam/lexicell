import { describe, expect, it } from 'vitest';
import { RELEASE_NOTES } from './release-notes';

describe('release notes', () => {
  it('run newest first, one entry per merge, builds and PRs descending with no gaps, every note in plain words', () => {
    expect(RELEASE_NOTES.length).toBeGreaterThanOrEqual(81);
    const shas = new Set<string>();
    let lastBuild = Infinity;
    let lastPr = Infinity;
    let lastDate = '9999-99-99';
    for (const n of RELEASE_NOTES) {
      expect(shas.has(n.sha), n.sha).toBe(false);
      shas.add(n.sha);
      expect(n.sha === 'pending' || /^[0-9a-f]{7}$/.test(n.sha), n.sha).toBe(true);
      expect(n.date <= lastDate, `${n.sha} out of date order`).toBe(true);
      lastDate = n.date;
      if (n.build !== null) {
        expect(n.build, `${n.sha}: build ${n.build} after ${lastBuild}`).toBe(lastBuild === Infinity ? n.build : lastBuild - 1);
        lastBuild = n.build;
      }
      if (n.pr !== null) {
        expect(n.pr < lastPr, `${n.sha}: PR #${n.pr} after #${lastPr}`).toBe(true);
        lastPr = n.pr;
      }
      expect(n.title.length, n.sha).toBeGreaterThan(0);
      expect(n.notes.length, n.sha).toBeGreaterThan(20);
      expect(n.notes, n.sha).not.toMatch(/—/); // no em dashes
    }
    // The oldest entry is the first commit, with neither build nor PR; the newest has both.
    const first = RELEASE_NOTES[RELEASE_NOTES.length - 1];
    expect(first?.sha).toBe('134f4c5');
    expect(first?.build).toBeNull();
    expect(RELEASE_NOTES[0]?.build).not.toBeNull();
    expect(RELEASE_NOTES[0]?.pr).not.toBeNull();
    // Builds start at 1 (the walking skeleton) and PRs at 1 (the feel wave).
    expect(RELEASE_NOTES.find((n) => n.build === 1)?.sha).toBe('94a60d6');
    expect(RELEASE_NOTES.find((n) => n.pr === 1)?.sha).toBe('442ba11');
    // PR #40 was closed unmerged (its branch became #41): no entry claims it.
    expect(RELEASE_NOTES.some((n) => n.pr === 40)).toBe(false);
  });
});
