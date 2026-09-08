// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { candidateWords } from '../engine/candidates';
import type { RunState } from '../engine/types';
import { newRun } from '../engine/reducer';
import { LETTER_VALUE } from '../engine/scoring';
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

/** Three unlocked tiles in grid order whose letters are not a word. */
function nonWordTriple(): number[] {
  const all = gridLetters();
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 16; b++) {
      if (b === a) continue;
      for (let c = 0; c < 16; c++) {
        if (c === a || c === b) continue;
        if (!ctx.dictionary.has(`${all[a]}${all[b]}${all[c]}`) && ![a, b, c].some((i) => tiles()[i]?.disabled)) return [a, b, c];
      }
    }
  }
  throw new Error('every triple is a word; impossible grid');
}

/** The Attack button, whatever its label says (it carries the damage preview when a word is valid). */
function attackButton(): HTMLButtonElement {
  const b = document.querySelector<HTMLButtonElement>('button.primary');
  if (!b) throw new Error('no Attack button');
  return b;
}

/** The screen's markup, minus the missed-word reveal: a resumed save cannot know the previous grid. */
function mainHtml(): string {
  const main = document.querySelector('main')?.cloneNode(true) as HTMLElement | null;
  main?.querySelectorAll('.missed').forEach((el) => { el.remove(); });
  return main?.innerHTML ?? '';
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
  await click(attackButton());
  return word;
}

/** From a fresh render: title screen, New run, the intro, starting pick, then the first fight. */
async function startRun() {
  render(App);
  await click(await findByText('New run', 15000));
  await click(await findByText('Divide and conquer'));
  await findByText('Choose a starting item', 15000);
  const offers = document.querySelectorAll('button.offer');
  expect(offers).toHaveLength(3);
  const offered = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { offer: string[] }).offer;
  offers.forEach((o, i) => { expect(o.querySelector('img.icon')?.getAttribute('src')).toBe(`/sprites/items/${offered[i]}.png`); });
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
    expect(getByText('build 0 · test')).toBeTruthy();
    const wotd = await findByText('Word of the day');
    expect(wotd).toBeTruthy();
    const word = document.querySelector('.wotd .word')?.textContent ?? '';
    expect(word.length).toBeGreaterThanOrEqual(5);
    expect(word.length).toBeLessThanOrEqual(8);
    expect(ctx.dictionary.has(word)).toBe(true);
    expect((document.querySelector('.wotd .gloss')?.textContent ?? '').length).toBeGreaterThan(0);
    await click(play);
    expect(await findByText('You are a cell.')).toBeTruthy();
    // Three beats: auto-play, and a tap on the scene skips ahead; the button never waits for them.
    expect(getByText('Something ate your pond.')).toBeTruthy();
    expect(document.querySelector('.pond .predator')?.getAttribute('src')).toBe('/sprites/amoeba.png');
    await click(document.querySelector('.scene'));
    expect(getByText(/a portal made of letters/)).toBeTruthy();
    expect(document.querySelector('.portal .ring')).not.toBeNull();
    await click(document.querySelector('.scene'));
    expect(getByText('In here, words are teeth.')).toBeTruthy();
    expect(document.querySelectorAll('.arrival .tile')).toHaveLength(16);
    await click(document.querySelector('.scene'));
    expect(getByText('In here, words are teeth.')).toBeTruthy();
    await click(getButton('Divide and conquer'));
    await findByText('Choose a starting item', 15000);
    expect(getByText(/Tap one\. You keep it/)).toBeTruthy();
    await click(document.querySelector('button.offer'));
    await findByText('Encounter 1 / 9');
    expect(tiles()).toHaveLength(16);
    expect(getByText('Turn 1')).toBeTruthy();
    expect(attackButton().disabled).toBe(true);
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
      expect(attackButton().classList.contains('ready'), prefix).toBe(green);
    }
    expect(document.querySelector('.word')?.classList.contains('valid')).toBe(true);
    expect(document.querySelectorAll('button.tile .order')).toHaveLength(idx.length);
    expect(Array.from(document.querySelectorAll('button.tile .order')).map((o) => o.textContent)).toEqual(idx.map((_, n) => String(n + 1)));
    // A 3+ letter non-word must stay yellow: this is what separates isWord from a length check.
    await click(getButton('Clear'));
    for (const i of nonWordTriple()) await click(tiles()[i] ?? null);
    expect(document.querySelectorAll('button.tile.selected')).toHaveLength(3);
    expect(document.querySelectorAll('button.tile.selected.valid')).toHaveLength(0);
    expect(attackButton().classList.contains('ready')).toBe(false);
    expect(document.querySelector('.word')?.classList.contains('valid')).toBe(false);
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

  it('a valid selection previews its damage on the word line and the Attack button, matching the engine', async () => {
    await startRun();
    const state = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const all = gridLetters();
    const available = tiles()
      .map((b, i) => (b.disabled ? -1 : i))
      .filter((i) => i >= 0);
    const word = ctx.solver.solve(available.map((i) => all[i] ?? '')).sort((a, b) => b.length - a.length)[0];
    if (!word) throw new Error('no word');
    const expected = candidateWords(state, ctx).find((c) => c.word === word)?.damage;
    expect(expected).toBeGreaterThan(0);
    expect(document.querySelector('.preview')).toBeNull();
    const idx = tilesForWord(word, all, available);
    if (!idx) throw new Error('cannot place');
    for (const i of idx) await click(tiles()[i] ?? null);
    expect(document.querySelector('.preview')?.textContent).toBe(String(expected));
    expect(getButton(`Attack for ${expected}`)).toBeTruthy();
    await click(getButton(`Attack for ${expected}`));
    if (queryByText('Choose an item')) return;
    expect(getByText(new RegExp(`^${word.toUpperCase()} hit for ${expected}$`))).toBeTruthy();
  });

  it('after a word, the best word that was on that grid is revealed, or the play is praised as the best', async () => {
    await startRun();
    const before = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    let best = { word: '', damage: 0 };
    for (const c of candidateWords(before, ctx)) if (c.damage > best.damage) best = c;
    const word = await attackOnce('short');
    if (queryByText('Choose an item')) return;
    const played = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState).lastTurn?.damage ?? 0;
    const el = document.querySelector('.missed');
    if (best.damage > played && best.word !== word) {
      expect(el?.textContent).toBe(`Best there: ${best.word.toUpperCase()} for ${best.damage}`);
    } else {
      expect(el?.textContent).toBe('Best word on that grid.');
    }
    // A later tap must not change the reveal: it belongs to the turn, not to the current selection.
    await click(tiles()[0] ?? null);
    expect(document.querySelector('.missed')?.textContent).toBe(el?.textContent);
  });

  it('rejects a non-word without spending the turn, and Clear empties the selection', async () => {
    await startRun();
    for (const i of nonWordTriple()) await click(tiles()[i] ?? null);
    expect(document.querySelectorAll('button.tile.selected')).toHaveLength(3);
    await click(attackButton());
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
    // The pool grew on 2026-09-08, so the seed is searched for: the first from 20260918 whose
    // starting offer holds Spores somewhere other than slot 0, and that slot is tapped.
    let seed = 20260918;
    let at = -1;
    for (; at < 1; seed++) at = newRun(seed, ctx).offer?.indexOf('spores') ?? -1;
    seed--;
    vi.spyOn(Date, 'now').mockReturnValue(seed);
    render(App);
    await click(await findByText('New run', 15000));
    await click(await findByText('Divide and conquer'));
    await findByText('Choose a starting item', 15000);
    const offered = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { offer: string[] }).offer;
    expect(offered).toHaveLength(3);
    expect(offered[at]).toBe('spores');
    await click(document.querySelectorAll('button.offer')[at] ?? null);
    await findByText('Encounter 1 / 9');
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { player: { items: string[] } };
    expect(saved.player.items).toEqual(['spores']);
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
    await click(await findByText('Divide and conquer'));
    expect(await findByText('Choose a starting item')).toBeTruthy();
    const after = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { rng: { seed: number }; player: { items: string[] } };
    expect(after.player.items).toEqual([]);
    expect(after.rng.seed).toBe(SEED + 1);
    expect(after.rng.seed).not.toBe(before.rng.seed);
  });

  it('a fresh page load with a save: New run asks, and confirming starts over instead of resuming the old save', async () => {
    // Gate W2: without persist.clear() in onPlay, openStore would load the old save and resume it.
    await startRun();
    await attackOnce('short');
    cleanup();
    render(App);
    expect(await findByText('Continue', 15000)).toBeTruthy();
    await click(getButton('New run'));
    vi.spyOn(Date, 'now').mockReturnValue(SEED + 7);
    await click(getButton('Abandon the current run and start over?'));
    await click(await findByText('Divide and conquer'));
    expect(await findByText('Choose a starting item')).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { stats: { turns: number }; rng: { seed: number } };
    expect(saved.stats.turns).toBe(0);
    expect(saved.rng.seed).toBe(SEED + 7);
  });

  it('a rejected Attack disarms Shuffle', async () => {
    await startRun();
    for (const i of nonWordTriple()) await click(tiles()[i] ?? null);
    await click(getButton('Shuffle'));
    expect(getButton('Shuffle? Costs a turn')).toBeTruthy();
    await click(attackButton());
    expect(document.querySelector('.rejected')).not.toBeNull();
    expect(getButton('Shuffle')).toBeTruthy();
  });

  it('a finished run does not offer Continue on the title', async () => {
    await startRun();
    for (let guard = 0; guard < 400 && !queryButton('New run'); guard++) {
      const offer = document.querySelector('button.offer');
      if (offer) await click(offer);
      else await attackOnce();
    }
    expect(getByText(/^You (won|died)$/)).toBeTruthy();
    cleanup();
    render(App);
    await findByText('New run', 15000);
    expect(queryButton('Continue')).toBeNull();
  }, 60000);

  it('the arena shows you and the enemy by sprite id, and replays hit and shake on a turn', async () => {
    await startRun();
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { encounter: { enemy: { id: string } } };
    const enemyImg = document.querySelector<HTMLImageElement>('.fighter.enemy img');
    expect(document.querySelector<HTMLImageElement>('.fighter.you img')?.getAttribute('src')).toBe('/sprites/player-1.png');
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

  it('the arena backdrop picks a pattern by enemy and carries the act', async () => {
    await startRun();
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { encounter: { enemy: { id: string } } };
    const patterns: Record<string, string> = { amoeba: 'dots', flagellate: 'stripes', polyp: 'cells', colony: 'rings' };
    const bg = document.querySelector<HTMLElement>('.arena .bg');
    expect(bg?.dataset.pattern).toBe(patterns[saved.encounter.enemy.id]);
    expect(bg?.querySelectorAll('.layer')).toHaveLength(3);
    expect(document.querySelector<HTMLElement>('.arena')?.dataset.pattern).toBe(patterns[saved.encounter.enemy.id]);
    expect(document.querySelector('.arena')?.classList.contains('act-1')).toBe(true);
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
    expect(getByText('Shuffled the grid')).toBeTruthy();
    expect(getButton('Shuffle')).toBeTruthy();
    const after = gridLetters();
    expect(after).not.toEqual(before);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { stats: { turns: number }; lastTurn: { word: string } };
    expect(saved.stats.turns).toBe(1);
    expect(saved.lastTurn.word).toBe('');
  });

  it('plain tiles carry no value badge; after a word the fresh tiles animate in and the count matches the word', async () => {
    await startRun();
    expect(document.querySelectorAll('button.tile .value')).toHaveLength(0);
    expect(document.querySelectorAll('button.tile.fresh')).toHaveLength(0);
    const word = await attackOnce('short');
    if (queryByText('Choose an item')) return;
    expect(document.querySelectorAll('button.tile.fresh')).toHaveLength(word.length);
    const usedNow = new Set((JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { lastTurn: { used: number[] } }).lastTurn.used);
    tiles().forEach((b, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const survivorRows = [0, 1, 2, 3].filter((r) => !usedNow.has(r * 4 + col));
      const expectedDy = row < survivorRows.length ? (survivorRows[row] ?? row) - row : 4 - row;
      const dy = b.style.getPropertyValue('--dy').trim();
      expect(b.classList.contains('fresh'), `tile ${i}`).toBe(row >= survivorRows.length);
      expect(dy === '' ? 0 : Number(dy), `tile ${i}`).toBe(expectedDy);
    });
    expect(document.querySelectorAll('button.tile .value')).toHaveLength(0);
  });

  it('every tile carries a tier that matches its letter: vowel, common, mid, or rare', async () => {
    await startRun();
    const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
    for (const b of tiles()) {
      const letter = b.querySelector('.letter')?.textContent?.toLowerCase() ?? '';
      const v = LETTER_VALUE[letter] ?? 1;
      const expected = vowels.has(letter) ? 'vowel' : v >= 5 ? 'rare' : v >= 3 ? 'mid' : 'common';
      expect(b.dataset.tier, letter).toBe(expected);
    }
  });

  it('a venomous tile shows its count, and the report says how much it bit for', async () => {
    await startRun();
    cleanup();
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState & { encounter: { grid: { letter: string; lockedTurns: number; venom: number }[] } };
    const t0 = save.encounter.grid[0];
    if (!t0) throw new Error('no tile');
    save.encounter.grid[0] = { ...t0, venom: 3 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    render(App);
    await click(await findByText('Continue', 15000));
    await findByText('Encounter 1 / 9');
    const badge = document.querySelector('button.tile.venomous .value.venom');
    expect(badge?.textContent).toBe('\u26233');
    // Play a word that does not use tile 0 so the venom survives and bites at the next turn start.
    const all = gridLetters();
    const available = tiles()
      .map((b, i) => (b.disabled || i === 0 ? -1 : i))
      .filter((i) => i >= 0);
    const word = ctx.solver.solve(available.map((i) => all[i] ?? '')).sort((a, b) => a.length - b.length)[0];
    if (!word) throw new Error('no word without tile 0');
    const idx = tilesForWord(word, all, available);
    if (!idx) throw new Error('cannot place');
    for (const i of idx) await click(tiles()[i] ?? null);
    await click(attackButton());
    if (queryByText('Choose an item')) return;
    expect(getByText('venom bit for 3')).toBeTruthy();
    expect(document.querySelector('button.tile.venomous .value.venom')?.textContent).toBe('\u26234');
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
    // A new run from the summary skips the intro: the player has just finished one.
    expect(await findByText('Choose a starting item')).toBeTruthy();
    expect(queryByText('You are a cell.')).toBeNull();
  }, 60000);
});
