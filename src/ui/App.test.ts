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

/** From a fresh render: title screen, New run, starting pick, then the first fight. */
async function startRun() {
  render(App);
  await click(await findByText('New run', 15000));
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
  it('loads to the title with a word of the day, New run opens the starting pick, then the fight with 16 tiles and Attack disabled', async () => {
    render(App);
    expect(getByText('Loading words...')).toBeTruthy();
    const play = await findByText('New run', 15000);
    expect(queryButton('Continue')).toBeNull();
    const wotd = await findByText('Word of the day');
    expect(wotd).toBeTruthy();
    const word = document.querySelector('.wotd .word')?.textContent ?? '';
    expect(word.length).toBeGreaterThanOrEqual(5);
    expect(word.length).toBeLessThanOrEqual(8);
    expect(ctx.dictionary.has(word)).toBe(true);
    expect((document.querySelector('.wotd .gloss')?.textContent ?? '').length).toBeGreaterThan(0);
    await click(play);
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

  it('selected tiles and the word turn green only when the selection is a dictionary word', async () => {
    await startRun();
    const all = gridLetters();
    const available = tiles()
      .map((b, i) => (b.disabled ? -1 : i))
      .filter((i) => i >= 0);
    const word = ctx.solver.solve(available.map((i) => all[i] ?? '')).sort((a, b) => a.length - b.length)[0];
    if (!word) throw new Error('no word on grid');
    const idx = tilesForWord(word, all, available);
    if (!idx) throw new Error(`cannot place ${word}`);
    // Every prefix short of the full word: yellow, never green, and Attack not ready.
    for (let n = 0; n < idx.length; n++) {
      const i = idx[n] ?? -1;
      await click(tiles()[i] ?? null);
      const prefix = word.slice(0, n + 1);
      const green = prefix.length >= 3 && ctx.dictionary.has(prefix);
      expect(document.querySelectorAll('button.tile.selected')).toHaveLength(n + 1);
      expect(document.querySelectorAll('button.tile.selected.valid').length, prefix).toBe(green ? n + 1 : 0);
      expect(getButton('Attack').classList.contains('ready'), prefix).toBe(green);
    }
    expect(document.querySelector('.word')?.classList.contains('valid')).toBe(true);
    expect(document.querySelectorAll('button.tile .order')).toHaveLength(idx.length);
    expect(Array.from(document.querySelectorAll('button.tile .order')).map((o) => o.textContent)).toEqual(idx.map((_, n) => String(n + 1)));
  });

  it('a played word shows its definition under the report once the table loads', async () => {
    await startRun();
    const word = await attackOnce('short');
    const gloss = (await import('./definitions')).defineWord(word);
    const expected = await gloss;
    if (expected === null) return; // WordNet covers ~60% of ENABLE; an undefined word renders nothing, which is fine.
    if (queryByText('Choose an item')) return; // one-shot kill: the pick screen has no report line.
    const el = await findByText(new RegExp(`^${word}: `));
    expect(el.textContent).toContain(expected);
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
    await click(await findByText('Continue', 15000));
    await findByText(/Encounter \d \/ 9|Choose an item/);
    expect(queryByText('Choose a starting item')).toBeNull();
    expect(mainHtml()).toBe(snapshot);
  });

  it('tapping the third offer picks the third item, and a turn-start item reports "Turn start" (seed 20260918)', async () => {
    // Gate W2 and S1 for Phase 1. At this seed the offer is long-fuse, sharp-pen, spores; spores deals
    // 4 at turn start, so the fight opens on the turn-start report with no word played yet.
    vi.spyOn(Date, 'now').mockReturnValue(20260918);
    render(App);
    await click(await findByText('New run', 15000));
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
    await click(await findByText('Continue', 15000));
    expect(await findByText('Choose a starting item', 15000)).toBeTruthy();
    expect(quiet).toHaveBeenCalled();
    const after = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { phase: string; encounter: null };
    expect(after.phase).toBe('pick');
  });

  it('Menu returns to the title; Continue resumes in place; New run asks, then abandons and replaces the save', async () => {
    await startRun();
    const before = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { rng: { seed: number } };
    await click(getButton('Menu'));
    expect(getButton('Continue')).toBeTruthy();
    await click(getButton('Continue'));
    expect(await findByText('Encounter 1 / 9')).toBeTruthy();
    await click(getButton('Menu'));
    await click(getButton('New run'));
    expect(getButton('Abandon the current run and start over?')).toBeTruthy();
    await click(getButton('Keep it'));
    expect(getButton('New run')).toBeTruthy();
    expect(queryButton('Keep it')).toBeNull();
    await click(getButton('New run'));
    vi.spyOn(Date, 'now').mockReturnValue(SEED + 1);
    await click(getButton('Abandon the current run and start over?'));
    expect(await findByText('Choose a starting item')).toBeTruthy();
    const after = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { rng: { seed: number }; player: { items: string[] } };
    expect(after.player.items).toEqual([]);
    expect(after.rng.seed).toBe(SEED + 1);
    expect(after.rng.seed).not.toBe(before.rng.seed);
  });

  it('the arena shows you and the enemy by sprite id, and replays hit and shake on a turn', async () => {
    await startRun();
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { encounter: { enemy: { id: string } } };
    const enemyImg = document.querySelector<HTMLImageElement>('.fighter.enemy img');
    expect(document.querySelector<HTMLImageElement>('.fighter.you img')?.getAttribute('src')).toBe('/sprites/player.png');
    expect(enemyImg?.getAttribute('src')).toBe(`/sprites/${saved.encounter.enemy.id}.png`);
    expect(document.querySelector('.arena')?.getAttribute('data-act')).toBe('1');
    expect(document.querySelector('.fighter.enemy.hit')).toBeNull();
    await attackOnce('short');
    if (queryByText('Choose an item')) return; // one-shot kill: no arena to inspect
    expect(document.querySelector('.fighter.enemy.hit')).not.toBeNull();
    expect(document.querySelector('.float.dealt')?.textContent).toMatch(/^-\d+$/);
    const took = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { lastTurn: { enemyDamage: number } }).lastTurn.enemyDamage;
    expect(document.querySelector('.fighter.you.shake') !== null).toBe(took > 0);
  });

  it('a sprite that fails to load falls back to the unknown sprite', async () => {
    await startRun();
    const img = document.querySelector<HTMLImageElement>('.fighter.enemy img');
    if (!img) throw new Error('no enemy sprite');
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe('/sprites/unknown.png');
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe('/sprites/unknown.png');
  });

  it('Shuffle arms on the first tap, disarms on another action, and on the second tap redraws the grid and spends the turn', async () => {
    await startRun();
    const before = gridLetters();
    await click(getButton('Shuffle'));
    expect(getButton('Shuffle? Costs a turn')).toBeTruthy();
    await click(tiles()[0] ?? null); // any other action disarms
    expect(getButton('Shuffle')).toBeTruthy();
    await click(getButton('Clear'));
    await click(getButton('Shuffle'));
    await click(getButton('Shuffle? Costs a turn'));
    if (queryByText('Choose an item')) throw new Error('a shuffle deals no damage; the enemy cannot have died');
    expect(getByText('Turn 2')).toBeTruthy();
    expect(getByText('grid scrambled')).toBeTruthy();
    expect(getButton('Shuffle')).toBeTruthy();
    const after = gridLetters();
    expect(after).not.toEqual(before);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { stats: { turns: number }; lastTurn: { word: string } };
    expect(saved.stats.turns).toBe(1);
    expect(saved.lastTurn.word).toBe('');
  });

  it('the item strip opens a panel listing every carried item with its description', async () => {
    await startRun();
    const strip = getByText(/^Items \(1\): /);
    expect(document.querySelector('.sheet')).toBeNull();
    await click(strip);
    const rows = document.querySelectorAll('.sheet li');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.querySelector('.desc')?.textContent?.length ?? 0).toBeGreaterThan(0);
    await click(strip);
    expect(document.querySelector('.sheet')).toBeNull();
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
