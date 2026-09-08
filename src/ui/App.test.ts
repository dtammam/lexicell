// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { tilesForWord } from '../engine/solver';
import App from './App.svelte';
import { SAVE_KEY } from './persist';

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

async function click(el: Element | null) {
  if (!el) throw new Error('element missing');
  await fireEvent.click(el);
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
  expect(screen.getByText(word.toUpperCase())).toBeTruthy();
  await click(screen.getByRole('button', { name: 'Attack' }));
  return word;
}

async function startRun() {
  render(App);
  await screen.findByText('Choose a starting item', {}, { timeout: 15000 });
  expect(document.querySelectorAll('button.offer')).toHaveLength(3);
  await click(document.querySelector('button.offer'));
  expect(await screen.findByText('Encounter 1 / 9')).toBeTruthy();
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
    expect(screen.getByText('Loading words...')).toBeTruthy();
    await screen.findByText('Choose a starting item', {}, { timeout: 15000 });
    await click(document.querySelector('button.offer'));
    await screen.findByText('Encounter 1 / 9');
    expect(tiles()).toHaveLength(16);
    expect(screen.getByText('Turn 1')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Attack' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Clear' }).disabled).toBe(true);
  });

  it('a solver word lands: the report shows the hit and the enemy bar drops, or the enemy dies into a pick', async () => {
    await startRun();
    const before = document.querySelector('.bar.enemy .fill')?.getAttribute('style') ?? '';
    const word = await attackOnce('short');
    if (screen.queryByText('Choose an item')) {
      expect(document.querySelectorAll('button.offer').length).toBeGreaterThan(0);
    } else {
      expect(screen.getByText(new RegExp(`^${word.toUpperCase()} hit for \\d+$`))).toBeTruthy();
      expect(document.querySelector('.bar.enemy .fill')?.getAttribute('style')).not.toBe(before);
      expect(screen.getByText('Turn 2')).toBeTruthy();
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
    await click(screen.getByRole('button', { name: 'Attack' }));
    expect(document.querySelector('.rejected')?.textContent).toMatch(/word/i);
    expect(screen.getByText('Turn 1')).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Clear' }));
    expect(document.querySelectorAll('button.tile.selected')).toHaveLength(0);
  });

  it('a reload resumes exactly where the save left off, never on the starting pick', async () => {
    await startRun();
    await attackOnce('short');
    const snapshot = mainHtml();
    cleanup();

    render(App);
    await screen.findByText(/Encounter \d \/ 9|Choose an item/);
    expect(screen.queryByText('Choose a starting item')).toBeNull();
    expect(mainHtml()).toBe(snapshot);
  });

  it('plays a whole run to the summary and can start a new one', async () => {
    await startRun();
    for (let guard = 0; guard < 400; guard++) {
      if (screen.queryByRole('button', { name: 'New run' })) break;
      const offer = document.querySelector('button.offer');
      if (offer) {
        await click(offer);
        continue;
      }
      await attackOnce();
    }
    expect(screen.getByText(/^You (won|died)$/)).toBeTruthy();
    expect(screen.getByText('Encounters reached')).toBeTruthy();
    expect(screen.getByText(String(SEED))).toBeTruthy();
    await click(screen.getByRole('button', { name: 'New run' }));
    expect(await screen.findByText('Choose a starting item')).toBeTruthy();
  }, 60000);
});
