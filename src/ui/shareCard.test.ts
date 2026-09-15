// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderShareBlob } from './shareCard';

describe('renderShareBlob', () => {
  it('returns null gracefully where a 2d canvas is unavailable (SSR / old WebView / jsdom)', async () => {
    // jsdom has no real 2d context, so getContext('2d') is null; the card must no-op (callers then
    // fall back to sharing text) rather than throw.
    const blob = await renderShareBlob({
      caption: 'Check out where I am in Lexicell',
      cellName: 'Amoeba',
      spriteUrl: '/sprites/cell-balanced-1.png',
      act: 1,
      mode: 'normal',
      status: 'Encounter 1 / 9',
      hp: 100,
      maxHp: 100,
      bestWord: '',
      bestWordDamage: 0,
      mutations: 0,
      seed: 1,
    });
    expect(blob).toBe(null);
  });
});
