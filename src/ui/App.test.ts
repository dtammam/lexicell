// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { candidateIndices, candidateWords } from '../engine/candidates';
import { CONTENT } from '../content/index';
import { RELEASE_NOTES } from './release-notes';
import type { RunState } from '../engine/types';
import { newRun } from '../engine/reducer';
import { LETTER_VALUE } from '../engine/scoring';
import { tilesForWord } from '../engine/solver';
import { tick } from 'svelte';
import App from './App.svelte';
import { SAVE_KEY } from './persist';
import { cleanup, click, findByText, getButton, getByText, queryButton, queryByText, render } from './test-utils';
import { dailySeed } from './daily';

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

/**
 * Play one fight turn through the engine's own candidates, read from the saved state. Unlike
 * attackOnce (which solves the visible DOM letters) this is wild-aware (v11): a run that took the
 * wildcard carries a '?' tile the DOM solver cannot read, and candidateIndices maps a wild word.
 */
async function playTurnViaEngine(): Promise<void> {
  const state = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
  const best = candidateWords(state, ctx).sort((a, b) => b.damage - a.damage)[0];
  if (!best) throw new Error('no candidate word for the fight');
  const idx = candidateIndices(state, best.word);
  if (!idx) throw new Error(`cannot map ${best.word}`);
  for (const i of idx) await click(tiles()[i] ?? null);
  await click(attackButton());
}

/** From a fresh render: title screen, New run, the intro, starting pick, then the first fight. */
/** Title: New run opens the cell picker; the first cell is the balanced Amoeba. */
async function pickCell() {
  await findByText('Choose your cell', 15000);
  await click(document.querySelector('button.cell'));
}

async function startRun() {
  render(App);
  await click(await findByText('New run', 15000));
  await pickCell();
  await click(await findByText('Divide and conquer'));
  await findByText('Choose a starting item', 15000);
  const offers = document.querySelectorAll('button.offer');
  expect(offers).toHaveLength(3);
  const offered = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { offer: string[] }).offer;
  offers.forEach((o, i) => { expect(o.querySelector('img.icon')?.getAttribute('src')).toBe(`/sprites/items/${offered[i]}.png`); });
  await click(document.querySelector('button.offer'));
  expect(await findByText('Enc 1/9')).toBeTruthy();
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
    // The title shows the latest release note's build (so it matches the Release notes page and is
    // identical on Docker and Pages), not the CI env var; the sha is still __BUILD_SHA__ ('test' here).
    expect(getByText(`build ${RELEASE_NOTES[0]?.build} · test`)).toBeTruthy();
    const wotd = await findByText('Word of the day');
    expect(wotd).toBeTruthy();
    const word = document.querySelector('.wotd .word')?.textContent ?? '';
    expect(word.length).toBeGreaterThanOrEqual(5);
    expect(word.length).toBeLessThanOrEqual(8);
    expect(ctx.dictionary.has(word)).toBe(true);
    expect((document.querySelector('.wotd .gloss')?.textContent ?? '').length).toBeGreaterThan(0);
    await click(play);
    // New run opens the cell picker first: five cells, all available, the balanced Amoeba first.
    await findByText('Choose your cell', 15000);
    expect(document.querySelectorAll('button.cell')).toHaveLength(5);
    expect(document.querySelector('button.cell .name')?.textContent).toContain('Amoeba');
    await click(document.querySelector('button.cell'));
    expect(await findByText('You are a cell.')).toBeTruthy();
    // Six beats: auto-play, and a tap on the scene skips ahead; the button never waits for them.
    // Beat 0: the calm pond, no predator yet.
    expect(getByText('Pond quiet. Pond safe. Always.')).toBeTruthy();
    expect(document.querySelector('.pond .you')).not.toBeNull();
    expect(document.querySelector('.pond .predator')).toBeNull();
    expect(document.querySelector('.pond .bubble')).not.toBeNull();
    await click(document.querySelector('.scene'));
    // Beat 1: the predator dominates the frame; the pond scene is gone.
    expect(getByText('Big thing come. Pond gone.')).toBeTruthy();
    expect(document.querySelector('.attack .predator')?.getAttribute('src')).toBe('/sprites/amoeba.png');
    await click(document.querySelector('.scene'));
    // Beat 2: the drifting symbols scene.
    expect(getByText(/Shapes rise in dark/)).toBeTruthy();
    expect(document.querySelector('.symbols')).not.toBeNull();
    await click(document.querySelector('.scene'));
    // Beat 3: the portal.
    expect(getByText(/Ring of marks/)).toBeTruthy();
    expect(document.querySelector('.portal .ring')).not.toBeNull();
    await click(document.querySelector('.scene'));
    // Beat 4: the scattered chips; the arrival grid is not here yet.
    expect(getByText(/Tiles all around me/)).toBeTruthy();
    expect(document.querySelector('.scatter .chip')).not.toBeNull();
    expect(document.querySelector('.arrival')).toBeNull();
    await click(document.querySelector('.scene'));
    // Beat 5: the lesson, on the same arrival grid.
    expect(getByText(/Long word hit hard\./)).toBeTruthy();
    const arrival = Array.from(document.querySelectorAll('.arrival .tile')).map((t) => t.textContent).join('');
    expect(arrival).toBe('LONGWORDHITSHARD');
    // Rows of four must each be a word: the grid reads row by row on the screen.
    expect(arrival.match(/.{4}/g)).toEqual(['LONG', 'WORD', 'HITS', 'HARD']);
    await click(getButton('Divide and conquer'));
    await findByText('Choose a starting item', 15000);
    expect(getByText(/Tap one\. You keep it/)).toBeTruthy();
    await click(document.querySelector('button.offer'));
    await findByText('Enc 1/9');
    expect(tiles()).toHaveLength(16);
    expect(getByText('Turn 1')).toBeTruthy();
    expect(attackButton().disabled).toBe(true);
    expect(getButton('Clear').disabled).toBe(true);
  }, 20000);

  it('Compendium on the title switches between its five sections and Back returns', async () => {
    const draftable = ctx.content.items.filter((i) => !i.curse);
    const curses = ctx.content.items.filter((i) => i.curse);
    render(App);
    await findByText('New run', 15000);
    await click(getButton('Compendium'));
    // Opens on Mutations: the draftable items by rarity (curses excluded), each with its icon.
    expect(document.querySelectorAll('.compendium .entry')).toHaveLength(draftable.length);
    expect(document.querySelectorAll('.compendium img.icon')).toHaveLength(draftable.length);
    for (const item of draftable) expect(getByText(item.name)).toBeTruthy();
    // Four rarity groups on the mutations section.
    expect(document.querySelectorAll('.compendium h3')).toHaveLength(4);
    // Defects: the curse-flagged items.
    await click(getButton('Defects'));
    expect(document.querySelectorAll('.compendium .entry')).toHaveLength(curses.length);
    for (const item of curses) expect(getByText(item.name)).toBeTruthy();
    // Bestiary: every enemy and boss, each with a sprite; bosses marked.
    await click(getButton('Bestiary'));
    expect(document.querySelectorAll('.compendium .entry.creature')).toHaveLength(ctx.content.enemies.length + ctx.content.bosses.length);
    expect(document.querySelectorAll('.compendium .entry.creature.boss')).toHaveLength(ctx.content.bosses.length);
    for (const boss of ctx.content.bosses) expect(getByText(boss.name)).toBeTruthy();
    // Traits and Capabilities list their content.
    await click(getButton('Traits'));
    expect(document.querySelectorAll('.compendium .entry')).toHaveLength(ctx.content.traits.length);
    await click(getButton('Capabilities'));
    expect(document.querySelectorAll('.compendium .entry')).toHaveLength(ctx.content.capabilities.length);
    await click(getButton('Back'));
    expect(getButton('New run')).toBeTruthy();
  });

  it('a solver word lands: the report shows the hit and the enemy bar drops, or the enemy dies into a pick', async () => {
    await startRun();
    const before = document.querySelector('.bar.enemy .fill')?.getAttribute('style') ?? '';
    const word = await attackOnce('short');
    if (queryByText('Choose an item')) {
      expect(document.querySelectorAll('button.offer').length).toBeGreaterThan(0);
    } else {
      expect(getByText(new RegExp(`^${word.toUpperCase()} \\d+$`))).toBeTruthy();
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
    // Each selected tile carries its position in the word, whatever order the tiles sit in on the grid.
    idx.forEach((i, n) => { expect(tiles()[i]?.querySelector('.order')?.textContent, `tile ${i}`).toBe(String(n + 1)); });
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
    expect(getByText(new RegExp(`^${word.toUpperCase()} ${expected}$`))).toBeTruthy();
  });

  it('after a word, the best word that was on that grid AND is now gone is revealed, or the play is praised as the best', async () => {
    await startRun();
    const before = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const word = await attackOnce('short');
    if (queryByText('Choose an item')) return;
    const after = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    // A word still spellable on the new grid is never revealed: that would be a hint, not a lesson.
    const stillHere = new Set(candidateWords(after, ctx).map((c) => c.word));
    let best = { word: '', damage: 0 };
    for (const c of candidateWords(before, ctx)) if (!stillHere.has(c.word) && c.damage > best.damage) best = c;
    const played = after.lastTurn?.damage ?? 0;
    const el = document.querySelector('.missed');
    if (best.word !== '') expect(stillHere.has(best.word)).toBe(false);
    if (best.damage > played && best.word !== word) {
      expect(el?.textContent).toBe(`Best: ${best.word.toUpperCase()} ${best.damage}`);
    } else {
      expect(el?.textContent).toBe('Best word there.');
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
    await findByText(/Enc \d\/9|Choose an item/);
    expect(queryByText('Choose a starting item')).toBeNull();
    expect(mainHtml()).toBe(snapshot);
  });

  it('tapping a later offer picks that item, and a turn-start item reports "Turn start"', async () => {
    // Gate W2 and S1 for Phase 1. Spores deals 6 at turn start (raised 2026-09-08), so the fight opens
    // on the turn-start report with no word played yet.
    // The pool grew on 2026-09-08, so the seed is searched for: the first from 20260918 whose
    // starting offer holds Spores somewhere other than slot 0, and that slot is tapped.
    let seed = 20260918;
    let at = -1;
    for (; at < 1; seed++) at = newRun(seed, ctx).offer?.indexOf('spores') ?? -1;
    seed--;
    vi.spyOn(Date, 'now').mockReturnValue(seed);
    render(App);
    await click(await findByText('New run', 15000));
    await pickCell();
    await click(await findByText('Divide and conquer'));
    await findByText('Choose a starting item', 15000);
    const offered = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { offer: string[] }).offer;
    expect(offered).toHaveLength(3);
    expect(offered[at]).toBe('spores');
    await click(document.querySelectorAll('button.offer')[at] ?? null);
    await findByText('Enc 1/9');
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { player: { items: string[] } };
    expect(saved.player.items).toEqual(['spores']);
    expect(getByText('Turn start: 6 damage')).toBeTruthy();
    expect(queryByText(/^[A-Z]{3,} \d+$/)).toBeNull(); // no word was scored
  });

  it('a save that passes the shape check but breaks a screen is dropped and a new run starts', async () => {
    // Tiles with every mark typed but a letter that is not a string: persist cannot tell (it types the marks,
    // not the letter), Fight throws on tile.letter.toUpperCase.
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { encounter: { grid: unknown[] } };
    blob.encounter.grid = Array.from({ length: 16 }, () => ({ letter: 7, lockedTurns: 0, venom: 0, gold: 0, cracked: 0 }));
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
    expect(await findByText('Enc 1/9')).toBeTruthy();
    await click(getButton('Menu'));
    await click(getButton('New run'));
    expect(getByText('Abandon the current run and start over?')).toBeTruthy();
    expect(queryButton('Continue')).toBeNull(); // no third option while asking (a tester read it as "continue to a new game")
    expect(queryButton('New run')).toBeNull();
    await click(getButton('Keep my run'));
    expect(getButton('New run')).toBeTruthy();
    expect(queryButton('Keep my run')).toBeNull();
    expect(getButton('Continue')).toBeTruthy();
    await click(getButton('New run'));
    vi.spyOn(Date, 'now').mockReturnValue(SEED + 1);
    await click(getButton('Yes, start over'));
    await pickCell();
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
    await click(getButton('Yes, start over'));
    await pickCell();
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
    expect(getButton('Costs a turn')).toBeTruthy();
    await click(attackButton());
    expect(document.querySelector('.rejected')).not.toBeNull();
    expect(getButton('Shuffle')).toBeTruthy();
  });

  it('effects wave: the shield rides the HP bar, poison and stun badge the enemy, and a free shuffle costs nothing', async () => {
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const enc = blob.encounter as NonNullable<RunState['encounter']>;
    const seeded: RunState = {
      ...blob,
      player: { ...blob.player, shield: 12, freeShuffles: 1 },
      encounter: { ...enc, enemy: { ...enc.enemy, poison: 4, stunned: 1 } },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(seeded));
    render(App);
    await click(await findByText('Continue', 15000));
    expect(await findByText('Enc 1/9')).toBeTruthy();
    expect(getByText('+12')).toBeTruthy();
    expect(document.querySelector('.fill.shield')).not.toBeNull();
    expect(getByText('\u26234')).toBeTruthy();
    expect(getByText('\u27491')).toBeTruthy();
    const before = seeded.encounter as NonNullable<RunState['encounter']>;
    await click(getButton('Free x1'));
    const after = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    expect(after.player.freeShuffles).toBe(0);
    expect(after.encounter?.turn).toBe(before.turn);
    expect(after.player.hp).toBe(seeded.player.hp);
    expect(after.stats.turns).toBe(seeded.stats.turns);
    expect(getButton('Shuffle')).toBeTruthy();
    expect(queryButton('Free x1')).toBeNull();
  });

  it('keyboard play: letters select matching tiles, Backspace undoes, Escape clears, Enter attacks', async () => {
    await startRun();
    const state = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const enc = state.encounter as NonNullable<RunState['encounter']>;
    const letters = enc.grid.map((t) => t.letter);
    const word = ctx.solver.solve(letters).filter((w) => w.length <= 7).sort((a, b) => b.length - a.length)[0] as string;
    const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    for (const ch of word) {
      press(ch);
      await tick();
    }
    expect(getByText(word.toUpperCase())).toBeTruthy();
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(word.length);
    press('Backspace');
    await tick();
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(word.length - 1);
    press('Escape');
    await tick();
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(0);
    // A letter that is not on the grid does nothing; a modifier chord is ignored.
    const missing = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => !letters.includes(c));
    if (missing) {
      press(missing);
      await tick();
      expect(document.querySelectorAll('.tile.selected')).toHaveLength(0);
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: word[0] as string, ctrlKey: true, bubbles: true }));
    await tick();
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(0);
    for (const ch of word) {
      press(ch);
      await tick();
    }
    const turnsBefore = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState).stats.turns;
    press('Enter');
    await tick();
    const after = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    expect(after.stats.turns).toBe(turnsBefore + 1);
    expect(after.lastTurn?.word).toBe(word);
  });

  it('How to play opens from the title with the tile legend and no settings controls (moved to Settings)', async () => {
    render(App);
    await click(await findByText('How to play', 15000));
    expect(getByText('How to play')).toBeTruthy();
    expect(getByText(/Rare letter, worth the most: K 5, J 6, X 6, Q 8, Z 8/)).toBeTruthy();
    expect(getByText(/Tiles do not need to touch/)).toBeTruthy();
    expect(document.querySelectorAll('.legend .tile')).toHaveLength(8);
    // Reading, sound and the bug report moved to Settings; Help holds none of their controls now.
    expect(queryButton('Readable type: off')).toBeNull();
    expect(queryButton('Sound effects: on')).toBeNull();
    expect(queryByText(/gear at the top/)).toBeTruthy();
    await click(getButton('Back'));
    expect(await findByText('New run')).toBeTruthy();
  });

  it('Settings opens from the top-bar gear, shows the four controls plus a bug report, toggles Readable and persists the five-field blob', async () => {
    render(App);
    await findByText('New run', 15000);
    // The gear is in the persistent top bar on the title (and every screen).
    const gear = document.querySelector<HTMLButtonElement>('[aria-label="Settings"]');
    expect(gear).not.toBeNull();
    await click(gear);
    expect(getByText('Settings')).toBeTruthy();
    // Sound effects mute + volume, music mute + volume, legible text, submit a bug.
    expect(getButton('Sound effects: on')).toBeTruthy();
    expect(getButton('Music: on')).toBeTruthy();
    expect(getButton('Readable type: off')).toBeTruthy();
    expect(document.querySelectorAll('input[type="range"]')).toHaveLength(2);
    const bug = document.querySelector('a[href^="mailto:dean@tamm.am"]');
    expect(bug).not.toBeNull();
    expect(bug?.getAttribute('href')).toContain('subject=Lexicell%20bug');
    // The mailto stamps the build the title shows and the build sha ('test' here).
    expect(bug?.getAttribute('href')).toContain(`build%20${RELEASE_NOTES[0]?.build}`);
    // Readable flips the whole app and persists in the new five-field shape.
    expect(document.querySelector('main')?.hasAttribute('data-readable')).toBe(false);
    await click(getButton('Readable type: off'));
    expect(document.querySelector('main')?.hasAttribute('data-readable')).toBe(true);
    expect(JSON.parse(localStorage.getItem('lexicell.settings') ?? 'null')).toEqual({ readable: true, sfxMuted: false, sfxVolume: 0.7, musicMuted: false, musicVolume: 0.7 });
    // Muting sound effects flips the label and persists on its own field.
    await click(getButton('Sound effects: on'));
    expect(getButton('Sound effects: off')).toBeTruthy();
    expect((JSON.parse(localStorage.getItem('lexicell.settings') ?? 'null') as { sfxMuted: boolean }).sfxMuted).toBe(true);
    // Back returns to where it opened (the title); the readable choice survives a reload.
    await click(getButton('Back'));
    expect(await findByText('New run')).toBeTruthy();
    expect(document.querySelector('main')?.hasAttribute('data-readable')).toBe(true);
    cleanup();
    render(App);
    await findByText('New run', 15000);
    expect(document.querySelector('main')?.hasAttribute('data-readable')).toBe(true);
  });

  it('the Settings gear is reachable during a fight and Back returns to the run', async () => {
    await startRun();
    const gear = document.querySelector<HTMLButtonElement>('[aria-label="Settings"]');
    expect(gear).not.toBeNull();
    await click(gear);
    expect(getByText('Settings')).toBeTruthy();
    await click(getButton('Back'));
    expect(await findByText('Enc 1/9')).toBeTruthy();
  });

  it('the first fight shows the two tile signals in the report line', async () => {
    await startRun();
    expect(getByText(/Tiles need not touch. Yellow: vowel. Pink edge: rare./)).toBeTruthy();
    expect(document.querySelector('.tile[data-tier="mid"]')).toBeNull();
  });

  it('run history: a finished run is recorded once with its outcome, an abandoned run as abandoned, and History lists them newest first', async () => {
    await startRun();
    cleanup();
    // Put the save at the last encounter with a one-HP enemy: the next word wins the run.
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const enc = blob.encounter as NonNullable<RunState['encounter']>;
    const nearEnd: RunState = { ...blob, encounterIndex: 8, encounter: { ...enc, enemy: { ...enc.enemy, hp: 1 } } };
    localStorage.setItem(SAVE_KEY, JSON.stringify(nearEnd));
    render(App);
    await click(await findByText('Continue', 15000));
    await attackOnce('short');
    expect(await findByText('You won')).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem('lexicell.history') ?? 'null') as { v: number; runs: { seed: number; outcome: string; encounterReached: number }[] };
    expect(stored.v).toBe(2);
    expect(stored.runs).toHaveLength(1);
    expect(stored.runs[0]).toMatchObject({ seed: nearEnd.rng.seed, outcome: 'won', encounterReached: 9 });
    // Summary links to History; the row shows the win.
    await click(getButton('History'));
    expect(getByText('1 run on this device, newest first. Tap one for its build.')).toBeTruthy();
    expect(getByText('WON')).toBeTruthy();
    await click(getButton('Back')); // back to the summary it was opened from
    expect(getByText('You won')).toBeTruthy();
    await click(getButton('Menu'));
    // New run from the title after a finished run records nothing extra (it was recorded at the win).
    await click(await findByText('New run', 15000));
    await pickCell();
    await click(await findByText('Divide and conquer'));
    await findByText('Choose a starting item', 15000);
    expect((JSON.parse(localStorage.getItem('lexicell.history') ?? 'null') as { runs: unknown[] }).runs).toHaveLength(1);
    // Abandoning the live run from the menu records it as abandoned, newest first in the list.
    await click(document.querySelector('button.offer'));
    await findByText('Enc 1/9');
    await click(getButton('Menu'));
    await click(getButton('New run'));
    await click(getButton('Yes, start over'));
    await pickCell();
    await click(await findByText('Divide and conquer'));
    const after = JSON.parse(localStorage.getItem('lexicell.history') ?? 'null') as { runs: { outcome: string }[] };
    expect(after.runs.map((r) => r.outcome)).toEqual(['won', 'abandoned']);
    await click(getButton('Menu'));
    await click(getButton('History'));
    expect(getByText('2 runs on this device, newest first. Tap one for its build.')).toBeTruthy();
    const outcomes = Array.from(document.querySelectorAll('.list .outcome')).map((e) => e.textContent);
    expect(outcomes).toEqual(['LEFT', 'WON']);
    // Clear is two-step and empties the key.
    await click(getButton('Clear'));
    await click(getButton('Delete all history?'));
    expect(localStorage.getItem('lexicell.history')).toBeNull();
    expect(getByText('No finished runs on this device yet.')).toBeTruthy();
  }, 30000);

  it('run history: the start time survives a reload and Continue, and abandoning a disk save on a fresh load records it once (gate W1, W3)', async () => {
    await startRun();
    const started = JSON.parse(localStorage.getItem('lexicell.run.started') ?? 'null') as { seed: number; startedAt: string };
    expect(typeof started.startedAt).toBe('string');
    cleanup();
    // An hour later, on a fresh page, Continue must not move the start time.
    vi.spyOn(Date, 'now').mockReturnValue(SEED + 3_600_000);
    render(App);
    await click(await findByText('Continue', 15000));
    await findByText('Enc 1/9');
    expect(JSON.parse(localStorage.getItem('lexicell.run.started') ?? 'null')).toEqual(started);
    cleanup();
    // A fresh load with an unfinished save on disk: New run asks, Yes records the disk save as abandoned, once, with its start time.
    render(App);
    await click(await findByText('New run', 15000));
    await click(getButton('Yes, start over'));
    await pickCell();
    await click(await findByText('Divide and conquer'));
    const runs = (JSON.parse(localStorage.getItem('lexicell.history') ?? 'null') as { runs: { outcome: string; seed: number; startedAt: string | null; encounterReached: number }[] }).runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ outcome: 'abandoned', seed: started.seed, startedAt: started.startedAt, encounterReached: 1 });
  }, 30000);

  it('History opened from the summary goes back to the summary', async () => {
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const enc = blob.encounter as NonNullable<RunState['encounter']>;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...blob, encounterIndex: 8, encounter: { ...enc, enemy: { ...enc.enemy, hp: 1 } } }));
    render(App);
    await click(await findByText('Continue', 15000));
    await attackOnce('short');
    await findByText('You won');
    await click(getButton('History'));
    await click(getButton('Back'));
    expect(getByText('You won')).toBeTruthy();
  }, 30000);

  it("daily challenge: the title offers today's seed, starting it locks the control for the day across a reload, and an abandoned daily is still recorded daily (step 8)", async () => {
    const daySeed = dailySeed(new Date(Date.now()));
    render(App);
    await findByText('New run', 15000);
    // The daily control is offered with today's seed.
    expect(getByText("Today's challenge")).toBeTruthy();
    expect(getByText(`Seed ${daySeed}`)).toBeTruthy();
    // Starting it (no save yet, so no confirm) launches a run on the daily seed with the default cell.
    // The click lands on the label span; it bubbles to the button (its own text also carries the seed).
    await click(getByText("Today's challenge"));
    await click(await findByText('Divide and conquer'));
    await findByText('Choose a starting item', 15000);
    const started = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    expect(started.rng.seed).toBe(daySeed);
    expect(started.cell).toBe('balanced');
    expect(started.mode).toBe('normal');
    expect(localStorage.getItem('lexicell.daily')).toBe(String(Math.floor(Date.now() / 86_400_000)));
    // A fresh load the same day shows the done state, not the offer, and keeps Continue.
    cleanup();
    render(App);
    await findByText('Continue', 15000);
    expect(queryByText("Today's challenge")).toBeNull();
    expect(getByText("Today's challenge played")).toBeTruthy();
    // Abandoning the on-disk daily for a new run records it as abandoned AND daily.
    await click(getButton('New run'));
    await click(getButton('Yes, start over'));
    await pickCell();
    await click(await findByText('Divide and conquer'));
    const runs = (JSON.parse(localStorage.getItem('lexicell.history') ?? 'null') as { v: number; runs: { outcome: string; seed: number; daily: boolean }[] });
    expect(runs.v).toBe(2);
    expect(runs.runs).toHaveLength(1);
    expect(runs.runs[0]).toMatchObject({ outcome: 'abandoned', seed: daySeed, daily: true });
  }, 30000);

  it('clarity: the enemy shows its next move, names appear once, the backdrop has a veil, and mutations light up for a word they fire on', async () => {
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const enc = blob.encounter as NonNullable<RunState['encounter']>;
    // An every-turn attacker with an unconditional +damage mutation carried.
    const seeded: RunState = { ...blob, player: { ...blob.player, items: ['sharp-pen'] }, encounter: { ...enc, turn: 1, enemy: { ...enc.enemy, id: 'amoeba', damage: 7 } } };
    localStorage.setItem(SAVE_KEY, JSON.stringify(seeded));
    render(App);
    await click(await findByText('Continue', 15000));
    await findByText('Enc 1/9');
    expect(getByText(/^Next: hits 5-9/)).toBeTruthy(); // 7 (a hungry Amoeba, not its base 6) with 30% variance rolls 5 to 9: the line reads the fight's damage
    expect(document.querySelectorAll('figcaption')).toHaveLength(0);
    expect(document.querySelectorAll('.arena .bar-label strong')).toHaveLength(2);
    expect(document.querySelector('.arena .veil')).not.toBeNull();
    // Nothing selected: the graft is quiet. Three letters selected: Flagellum (+8 on every word) lights up.
    expect(document.querySelector('.graft.live')).toBeNull();
    const letters = enc.grid.map((t) => t.letter);
    const word = ctx.solver.solve(letters).filter((w) => w.length >= 3)[0] as string;
    const idx = tilesForWord(word, letters, letters.map((_, i) => i)) ?? [];
    for (const i of idx) await click(tiles()[i] ?? null);
    expect(document.querySelector('.graft.live')).not.toBeNull();
    // A stunned enemy announces that it will not attack.
    cleanup();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...seeded, encounter: { ...seeded.encounter, enemy: { ...enc.enemy, id: 'amoeba', damage: 6, stunned: 1 } } }));
    render(App);
    await click(await findByText('Continue', 15000));
    expect(await findByText('Next: stunned')).toBeTruthy();
  }, 30000);

  it('the stats row shows the best and worst word after a word, and a migrated save shows a dash for the worst (gate S5, W2)', async () => {
    await startRun();
    expect(document.querySelector('.row.stats')).toBeNull();
    const word = await attackOnce('short');
    if (queryByText('Choose an item')) return;
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const row = Array.from(document.querySelectorAll('.row.stats')).map((r) => r.textContent?.replace(/\s+/g, ' ').trim()).join(' ');
    expect(row).toContain(`BEST ${word.toUpperCase()} ${saved.stats.bestWordDamage}`);
    expect(row).toContain(`WORST ${word.toUpperCase()} ${saved.stats.worstWordDamage}`);
    // A save from before the stat: best known, worst not yet.
    cleanup();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...saved, stats: { ...saved.stats, worstWord: '', worstWordDamage: 0 } }));
    render(App);
    await click(await findByText('Continue', 15000));
    await findByText('Enc 1/9');
    expect(Array.from(document.querySelectorAll('.row.stats .worst')).map((e) => e.textContent).join(' ')).toBe('WORST -');
  }, 30000);

  it('encounter types: a rest offers a heal beside three mutations, an event shows its trade, an elite is labelled (step 2)', async () => {
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const offer = ['sharp-pen', 'flagellum', 'thick-wall'].filter((id) => CONTENT.items.some((i) => i.id === id));
    const three = offer.length === 3 ? offer : CONTENT.items.slice(0, 3).map((i) => i.id);
    // A rest at slot 2 with 40 of 100 HP: the heal line says 30.
    const rest: RunState = { ...blob, phase: 'rest', encounter: null, offer: three, encounterIndex: 1, kinds: ['fight', 'rest', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight'], player: { ...blob.player, hp: 40, maxHp: 100, items: [] } };
    localStorage.setItem(SAVE_KEY, JSON.stringify(rest));
    render(App);
    await click(await findByText('Continue', 15000));
    expect(await findByText('A quiet pool')).toBeTruthy();
    expect(document.querySelectorAll('button.offer')).toHaveLength(4);
    expect(getByText(/Heal 30 HP \(40 to 70 of 100\)/)).toBeTruthy();
    await click(document.querySelector('button.offer.heal'));
    expect(await findByText('Enc 3/9')).toBeTruthy();
    expect(getByText('70 / 100')).toBeTruthy();
    // An event: the trade's label and the walk-away; the trade lands on the HP bar of the next fight.
    cleanup();
    const event: RunState = { ...rest, phase: 'event', offer: null, event: 'thermal-vent', kinds: ['fight', 'event', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight'] };
    localStorage.setItem(SAVE_KEY, JSON.stringify(event));
    render(App);
    await click(await findByText('Continue', 15000));
    expect(await findByText('Thermal Vent')).toBeTruthy();
    expect(getByText('You: 40 / 100 HP')).toBeTruthy();
    expect(getButton('Back away').classList.contains('pass')).toBe(true);
    await click(getButton('Brave it: max HP +20, take 30'));
    expect(await findByText('Enc 3/9')).toBeTruthy();
    expect(getByText('30 / 120')).toBeTruthy();
    // A save on an event content no longer has (gate W1): one "Move on" button, and it moves on.
    cleanup();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...event, event: 'gone-event' }));
    render(App);
    await click(await findByText('Continue', 15000));
    expect(await findByText('Something in the water')).toBeTruthy();
    expect(document.querySelectorAll('button.choice')).toHaveLength(1);
    await click(getButton('Move on'));
    expect(await findByText('Enc 3/9')).toBeTruthy();
    expect(getByText('40 / 100')).toBeTruthy();
    // An elite slot labels the enemy.
    cleanup();
    const elite: RunState = { ...blob, kinds: ['elite', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight'] };
    localStorage.setItem(SAVE_KEY, JSON.stringify(elite));
    render(App);
    await click(await findByText('Continue', 15000));
    await findByText('Enc 1/9');
    expect(document.querySelector('.arena .bar-label:nth-of-type(3) strong')?.textContent ?? document.querySelectorAll('.arena .bar-label strong')[1]?.textContent).toMatch(/^Elite /);
  }, 30000);

  it('Release notes opens from the title, lists every build newest first with a PR link, and Back returns', async () => {
    render(App);
    await click(await findByText('Release notes', 15000));
    expect(await findByText(/Every build since the first commit/, 15000)).toBeTruthy(); // 80+ entries render slowly on a loaded machine
    const items = document.querySelectorAll('.notes li');
    expect(items.length).toBe(RELEASE_NOTES.length);
    expect(items[0]?.querySelector('.stamp')?.textContent).toBe(`build\u00a0${RELEASE_NOTES[0]?.build} · PR\u00a0#${RELEASE_NOTES[0]?.pr}`);
    expect(items[0]?.querySelector('.date')?.textContent).toBe(RELEASE_NOTES[0]?.date);
    expect(items[0]?.querySelector('.stamp a')?.getAttribute('href')).toBe(`https://github.com/dtammam/lexicell/pull/${RELEASE_NOTES[0]?.pr}`);
    expect(items[items.length - 1]?.querySelector('h3')?.textContent).toBe('First commit');
    expect(items[items.length - 1]?.querySelector('.stamp a')).toBeNull();
    await click(getButton('Back'));
    expect(await findByText('New run')).toBeTruthy();
  }, 20000); // the list grows with every merge

  it('evolution: after a boss the evolve screen offers three traits, the pick lands on the items strip and the summary (step 3)', async () => {
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const evolve: RunState = { ...blob, phase: 'evolve', encounter: null, offer: ['thick-membrane', 'predatory', 'venom-glands'], encounterIndex: 2, kinds: ['fight', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight', 'fight'], player: { ...blob.player, items: [] } };
    localStorage.setItem(SAVE_KEY, JSON.stringify(evolve));
    render(App);
    await click(await findByText('Continue', 15000));
    expect(await findByText('Evolve')).toBeTruthy();
    expect(document.querySelectorAll('.evolve button.offer')).toHaveLength(3);
    expect(getByText('Predatory')).toBeTruthy();
    expect(getByText('+15% damage on every word.')).toBeTruthy();
    await click(document.querySelectorAll('.evolve button.offer')[1] ?? null);
    // v11: the capability offer follows the trait pick and is mandatory. Take one (a non-wildcard,
    // index 1, so no wild tile appears on the next grid); the item pick then follows.
    expect(document.querySelectorAll('.evolve button.offer').length).toBe(3);
    await click(document.querySelectorAll('.evolve button.offer')[1] ?? null);
    // The item pick the boss win owes, then the next fight with the trait on the strip.
    expect(await findByText('Choose an item')).toBeTruthy();
    await click(document.querySelector('button.offer'));
    expect(await findByText('Enc 4/9')).toBeTruthy();
    expect(getByText(/Traits: Predatory\./)).toBeTruthy();
  }, 30000);

  it('evolution capabilities (v11): the fight shows a wild ? tile and the transmute, bank and spend actions', async () => {
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const enc = blob.encounter as NonNullable<RunState['encounter']>;
    const plain = (letter: string) => ({ letter, lockedTurns: 0, venom: 0, gold: 0, cracked: 0 });
    // A controlled grid: a wild at 0, then c a t e r, then e fillers; enemy tough and harmless.
    const lead = ['z', 'c', 'a', 't', 'e', 'r'];
    const grid = Array.from({ length: 16 }, (_, i) => (i === 0 ? { ...plain('z'), wild: true as const } : plain(lead[i] ?? 'e')));
    const seeded: RunState = {
      ...blob,
      evolution: { caps: ['wildcard', 'transmute', 'letter-bank'], transmuteUsed: false, bankedLetter: null },
      player: { ...blob.player, items: [] },
      encounter: { ...enc, grid, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000, damage: 0 }, selection: [] },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(seeded));
    render(App);
    await click(await findByText('Continue', 15000));
    await findByText('Enc 1/9');
    // The wild tile reads as a '?' and is marked.
    expect(tiles()[0]?.classList.contains('wild')).toBe(true);
    expect(tiles()[0]?.querySelector('.letter')?.textContent).toBe('?');
    // Bank the letter of tile 1 (c): arm Bank, tap the tile; a Spend control then appears.
    expect(getButton('Bank')).toBeTruthy();
    await click(getButton('Bank'));
    await click(tiles()[1] ?? null);
    expect((JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState).evolution.bankedLetter).toBe('c');
    expect(await findByText(/^Spend /)).toBeTruthy();
    // Transmute tile 2 (a): arm Transmute, tap the tile; it becomes a rare letter and the charge is spent.
    await click(getButton('Transmute'));
    await click(tiles()[2] ?? null);
    const after = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    expect(after.evolution.transmuteUsed).toBe(true);
    expect('kjxqz'.includes((after.encounter as NonNullable<RunState['encounter']>).grid[2]?.letter ?? '')).toBe(true);
  }, 30000);

  it('grid rules: a gold tile and a cracked tile carry their badges, the legend lists them, and the preview counts the gold (step 4)', async () => {
    await startRun();
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const enc = blob.encounter as NonNullable<RunState['encounter']>;
    const letters = enc.grid.map((t) => t.letter);
    const word = ctx.solver.solve(letters).filter((w) => w.length >= 4)[0] as string;
    const idx = tilesForWord(word, letters, letters.map((_, i) => i)) ?? [];
    const goldAt = idx[0] as number;
    const crackAt = letters.findIndex((_, i) => !idx.includes(i));
    const grid = enc.grid.map((t, i) => (i === goldAt ? { ...t, gold: 5 } : i === crackAt ? { ...t, cracked: 2 } : t));
    const seeded: RunState = { ...blob, player: { ...blob.player, items: [] }, encounter: { ...enc, grid, enemy: { ...enc.enemy, id: 'amoeba', damage: 0, hp: 100000, maxHp: 100000 } } };
    localStorage.setItem(SAVE_KEY, JSON.stringify(seeded));
    render(App);
    await click(await findByText('Continue', 15000));
    await findByText('Enc 1/9');
    expect(tiles()[goldAt]?.classList.contains('gold')).toBe(true);
    expect(tiles()[goldAt]?.querySelector('.value')?.textContent).toBe('+5');
    expect(tiles()[crackAt]?.classList.contains('cracked')).toBe(true);
    expect(tiles()[crackAt]?.querySelector('.value')?.textContent).toBe('\u23F32');
    const plain = candidateWords({ ...seeded, encounter: { ...enc, grid: enc.grid, enemy: { ...enc.enemy, id: 'amoeba', damage: 0, hp: 100000, maxHp: 100000 } } }, ctx).find((c) => c.word === word)?.damage ?? -1;
    for (const i of idx) await click(tiles()[i] ?? null);
    expect(document.querySelector('.preview')?.textContent).toBe(String(plain + 5));
    await click(attackButton());
    expect(await findByText('gold +5')).toBeTruthy();
    // The cracked tile ticked to 1 (it was not played).
    expect(document.querySelectorAll('button.tile.cracked')).toHaveLength(1);
    expect(document.querySelector('button.tile.cracked .value')?.textContent).toBe('\u23F31');
    // The legend on the How to play card names both.
    cleanup();
    render(App);
    await click(await findByText('How to play', 15000));
    expect(getByText(/^Gold: adds that much damage/)).toBeTruthy();
    expect(getByText(/^Cracked: crumbles/)).toBeTruthy();
  }, 30000);

  it('modes: the cell picker offers Normal and Endless, an endless run shows Enc without /9 and its summary says how deep (step 5)', async () => {
    render(App);
    await click(await findByText('New run', 15000));
    await findByText('Choose your cell', 15000);
    const modes = () => Array.from(document.querySelectorAll('.modes .mode'));
    expect(modes()).toHaveLength(2);
    expect(modes()[0]?.getAttribute('aria-checked')).toBe('true');
    await click(modes()[1] ?? null);
    expect(modes()[1]?.getAttribute('aria-checked')).toBe('true');
    expect(modes()[0]?.getAttribute('aria-checked')).toBe('false');
    await click(document.querySelector('button.cell'));
    await click(await findByText('Divide and conquer'));
    await findByText('Choose a starting item', 15000);
    await click(document.querySelector('button.offer'));
    expect(await findByText('Enc 1')).toBeTruthy();
    expect(queryByText('Enc 1/9')).toBeNull();
    expect((JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState).mode).toBe('endless');
    // Deep in the run at 1 HP against a killer: the next hit ends it, and the summary says how deep.
    cleanup();
    const blob = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState;
    const enc = blob.encounter as NonNullable<RunState['encounter']>;
    const deep: RunState = { ...blob, encounterIndex: 13, player: { ...blob.player, hp: 1, items: [] }, encounter: { ...enc, enemy: { ...enc.enemy, id: 'lamprey', damage: 500, hp: 100000, maxHp: 100000 } }, stats: { ...blob.stats, hpAtEncounterStart: Array.from({ length: 14 }, () => 50) } };
    localStorage.setItem(SAVE_KEY, JSON.stringify(deep));
    render(App);
    await click(await findByText('Continue', 15000));
    expect(await findByText('Enc 14')).toBeTruthy();
    await attackOnce('short');
    expect(await findByText('The deep took you', 15000)).toBeTruthy();
    // The share card names the encounter reached; Endless has no "/ 9" total.
    expect(getByText('Encounter 14')).toBeTruthy();
    expect(queryByText('Encounter 14 / 9')).toBeNull();
  }, 30000);

  it('a finished run does not offer Continue on the title', async () => {
    await startRun();
    // This run takes capabilities (the loop clicks the first .offer on the capability screen too),
    // so from act 2 the grid carries a wild '?' tile. Drive fights through the engine's own
    // wild-aware candidates read from the saved state, rather than the DOM letter solver.
    for (let guard = 0; guard < 400 && !queryButton('New run'); guard++) {
      const offer = document.querySelector('button.offer, button.choice');
      if (offer) {
        await click(offer);
        continue;
      }
      await playTurnViaEngine();
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
    expect(document.querySelector<HTMLImageElement>('.fighter.you img')?.getAttribute('src')).toBe('/sprites/cell-balanced-1.png');
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
    const patterns: Record<string, string> = { amoeba: 'dots', flagellate: 'stripes', polyp: 'cells', rotifer: 'rings', colony: 'rings' };
    const bg = document.querySelector<HTMLElement>('.arena .bg');
    expect(bg?.dataset.pattern).toBe(patterns[saved.encounter.enemy.id]);
    expect(bg?.querySelectorAll('.layer')).toHaveLength(3);
    expect(document.querySelector<HTMLElement>('.arena')?.dataset.pattern).toBe(patterns[saved.encounter.enemy.id]);
    expect(document.querySelector('.arena')?.classList.contains('act-1')).toBe(true);
  });

  it('every carried mutation is grafted onto your body in the arena', async () => {
    await startRun();
    const items = (JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { player: { items: string[] } }).player.items;
    const grafts = document.querySelectorAll('.fighter.you .graft img.icon');
    expect(grafts).toHaveLength(items.length);
    expect(grafts[0]?.getAttribute('src')).toBe(`/sprites/items/${items[0]}.png`);
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
    expect(getButton('Costs a turn')).toBeTruthy();
    await click(tiles()[0] ?? null); // any other action disarms
    expect(getButton('Shuffle')).toBeTruthy();
    await click(getButton('Clear'));
    await click(getButton('Shuffle'));
    await click(getButton('Costs a turn'));
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
    // A few tiles shiver each turn, never all of them.
    const shivering = document.querySelectorAll('button.tile.shiver').length;
    expect(shivering).toBeGreaterThan(0);
    expect(shivering).toBeLessThan(6);
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

  it('every tile carries a tier that matches its letter: vowel, common, or rare', async () => {
    await startRun();
    const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
    for (const b of tiles()) {
      const letter = b.querySelector('.letter')?.textContent?.toLowerCase() ?? '';
      const v = LETTER_VALUE[letter] ?? 1;
      const expected = vowels.has(letter) ? 'vowel' : v >= 5 ? 'rare' : 'common';
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
    await findByText('Enc 1/9');
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
      const offer = document.querySelector('button.offer, button.choice');
      if (offer) {
        await click(offer);
        continue;
      }
      await playTurnViaEngine();
    }
    expect(getByText(/^You (won|died)$/)).toBeTruthy();
    // The share card (step 7): the encounter reached and the seed, with Share / Replay / Copy controls.
    expect(getByText(/^Encounter \d+ \/ 9$/)).toBeTruthy();
    expect(getByText(String(SEED))).toBeTruthy();
    expect(getButton('Share')).toBeTruthy();
    expect(getButton('Replay this seed')).toBeTruthy();
    await click(getButton('New run'));
    // A new run from the summary skips the intro: the player has just finished one.
    expect(await findByText('Choose a starting item')).toBeTruthy();
    expect(queryByText('You are a cell.')).toBeNull();
  }, 60000);
});
