// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { tilesForWord } from '../engine/solver';
import App from './App.svelte';
import { SAVE_KEY } from './persist';
import { cleanup, click, findByText, getButton, getByText, queryButton, queryByText, render } from './test-utils';

// The real App: real context (the ?raw dictionary), real store, real reducer, jsdom's localStorage.
// Date.now is the run seed, so it is pinned per test to keep every assertion reproducible.
const ctx = nodeContext();
const SEED = 20260908;

function tiles(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button.tile'));
}

function gridLetters(): string[] {
  return tiles().map((b) => b.querySelector('.letter')?.textContent?.toLowerCase() ?? '');
}

function mainHtml(): string {
  return document.querySelector('main')?.innerHTML ?? '';
}

/** Spell and submit a solver word from the visible grid: the longest of at most 7 letters, or the shortest. */
async function attackOnce(prefer: 'long' | 'short' = 'long'): Promise<string> {
  const all = gridLetters();
  const available = tiles()
    .map((b, i) => (b.disabled ? -1 : i))
    .filter((i) => i >= 0);
  const words = ctx.solver.solve(available.map((i) => all[i] ?? ''));
  const ranked = words.filter((w) => w.length <= 7).sort((a, b) => (prefer === 'long' ? b.length - a.length : a.length - b.length));
  const word = ranked[0];
  if (!word) throw new Error(`no word on grid ${all.join('')}`);
  const idx = tilesForWord(word, all, available);
  if (!idx) throw new Error(`cannot place ${word}`);
  for (const i of idx) await click(tiles()[i] ?? null);
  expect(getByText(word.toUpperCase())).toBeTruthy();
  await click(getButton('Attack'));
  return word;
}

async function startRun() {
  render(App);
  await findByText('Choose a starting item', 15000);
  expect(document.querySelectorAll('button.offer')).toHaveLength(3);
  await click(document.querySelector('button.offer'));
  expect(await findByText('Encounter 1 / 9')).toBeTruthy();
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(SEED);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('loads, opens on the starting pick, then shows the fight with 16 tiles and Attack disabled', async () => {
    render(App);
    expect(getByText('Loading words...')).toBeTruthy();
    await findByText('Choose a starting item', 15000);
    await click(document.querySelector('button.offer'));
    await findByText('Encounter 1 / 9');
    expect(tiles()).toHaveLength(16);
    expect(getByText('Turn 1')).toBeTruthy();
    expect(getButton('Attack').disabled).toBe(true);
    expect(getButton('Clear').disabled).toBe(true);
  });

  it('a solver word lands: the report shows the hit and the enemy bar drops, or the enemy dies into a pick', async () => {
    await startRun();
    const before = document.querySelector('.bar.enemy .fill')?.getAttribute('style') ?? '';
    const word = await attackOnce('short');
    if (queryByText('Choose an item')) {
      expect(document.querySelectorAll('button.offer').length).toBeGreaterThan(0);
    } else {
      expect(getByText(new RegExp(`^${word.toUpperCase()} hit for \\d+$`))).toBeTruthy();
      expect(document.querySelector('.bar.enemy .fill')?.getAttribute('style')).not.toBe(before);
      expect(getByText('Turn 2')).toBeTruthy();
    }
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { stats?: { turns?: number } } | null;
    expect(saved?.stats?.turns).toBe(1);
  });

  it('rejects a non-word without spending the turn, and Clear empties the selection', async () => {
    await startRun();
    const all = gridLetters();
    let triple: number[] | null = null;
    for (let a = 0; a < 16 && !triple; a++) {
      for (let b = 0; b < 16 && !triple; b++) {
        if (b === a) continue;
        for (let c = 0; c < 16 && !triple; c++) {
          if (c === a || c === b) continue;
          if (!ctx.dictionary.has(`${all[a]}${all[b]}${all[c]}`) && ![a, b, c].some((i) => tiles()[i]?.disabled)) triple = [a, b, c];
        }
      }
    }
    if (!triple) throw new Error('every triple is a word; impossible grid');
    for (const i of triple) await click(tiles()[i] ?? null);
    expect(document.querySelectorAll('button.tile.selected')).toHaveLength(3);
    await click(getButton('Attack'));
    expect(document.querySelector('.rejected')?.textContent).toMatch(/word/i);
    expect(getByText('Turn 1')).toBeTruthy();
    await click(getButton('Clear'));
    expect(document.querySelectorAll('button.tile.selected')).toHaveLength(0);
  });

  it('a reload resumes exactly where the save left off, never on the starting pick', async () => {
    await startRun();
    await attackOnce('short');
    const snapshot = mainHtml();
    cleanup();

    render(App);
    await findByText(/Encounter \d \/ 9|Choose an item/);
    expect(queryByText('Choose a starting item')).toBeNull();
    expect(mainHtml()).toBe(snapshot);
  });

  it('tapping the third offer picks the third item, and a turn-start item reports "Turn start" (seed 20260918)', async () => {
    // Gate W2 and S1 for Phase 1. At this seed the offer is long-fuse, sharp-pen, spores; spores deals
    // 4 at turn start, so the fight opens on the turn-start report with no word played yet.
    vi.spyOn(Date, 'now').mockReturnValue(20260918);
    render(App);
    await findByText('Choose a starting item', 15000);
    const offered = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { offer: string[] }).offer;
    expect(offered).toHaveLength(3);
    const third = document.querySelectorAll('button.offer')[2] ?? null;
    await click(third);
    await findByText('Encounter 1 / 9');
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { player: { items: string[] } };
    expect(saved.player.items).toEqual([offered[2]]);
    expect(offered[2]).toBe('spores');
    expect(getByText('Turn start: 4 damage')).toBeTruthy();
    expect(queryByText(/hit for/)).toBeNull();
  });

  it('a save that passes the shape check but breaks a screen is dropped and a new run starts', async () => {
    // Sixteen numbers where tiles should be: persist cannot tell, Fight throws on tile.letter.
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { encounter: { grid: unknown[] } };
    blob.encounter.grid = Array.from({ length: 16 }, () => 7);
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(App);
    expect(await findByText('Choose a starting item', 15000)).toBeTruthy();
    expect(quiet).toHaveBeenCalled();
    const after = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { phase: string; encounter: null };
    expect(after.phase).toBe('pick');
  });

  it('plays a whole run to the summary and can start a new one', async () => {
    await startRun();
    for (let guard = 0; guard < 400; guard++) {
      if (queryButton('New run')) break;
      const offer = document.querySelector('button.offer');
      if (offer) {
        await click(offer);
        continue;
      }
      await attackOnce();
    }
    expect(getByText(/^You (won|died)$/)).toBeTruthy();
    expect(getByText('Encounters reached')).toBeTruthy();
    expect(getByText(String(SEED))).toBeTruthy();
    await click(getButton('New run'));
    expect(await findByText('Choose a starting item')).toBeTruthy();
  }, 60000);
});
