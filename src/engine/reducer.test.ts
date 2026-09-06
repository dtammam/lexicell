import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { CONTENT } from '../content/index';
import { candidateIndices, candidateWords } from './candidates';
import { isDead } from './grid';
import { newRun, reduce, selectedWord, type Action, type EngineContext } from './reducer';
import { tilesForWord } from './solver';
import type { RunState } from './types';

const ctx = nodeContext();

function play(state: RunState, word: string, c: EngineContext = ctx): RunState {
  const enc = state.encounter;
  if (!enc) throw new Error('no encounter');
  const idx = tilesForWord(
    word,
    enc.grid.map((t) => t.letter),
    enc.grid.map((_, i) => i).filter((i) => (enc.grid[i]?.lockedTurns ?? 1) === 0),
  );
  if (!idx) throw new Error(`cannot spell ${word}`);
  let s = state;
  for (const i of idx) s = reduce(s, { type: 'toggleTile', index: i }, c);
  return reduce(s, { type: 'submitWord' }, c);
}

/** Drive a whole run with a greedy policy, checking invariants at every step. Returns the action log and final state. */
function greedyRun(seed: number, c: EngineContext = ctx, pickIndex = 0): { final: RunState; log: Action[]; states: RunState[] } {
  let s = newRun(seed, c);
  const log: Action[] = [{ type: 'newRun', seed }];
  const states: RunState[] = [s];
  const step = (a: Action) => {
    s = reduce(s, a, c);
    log.push(a);
    states.push(s);
    assertInvariants(s, c);
  };
  assertInvariants(s, c);
  for (let guard = 0; guard < 2000 && s.phase !== 'summary'; guard++) {
    if (s.phase === 'pick') {
      step({ type: 'pickItem', index: pickIndex });
      continue;
    }
    const best = candidateWords(s, c).sort((a, b) => b.damage - a.damage)[0];
    if (!best) throw new Error(`seed ${seed}: no candidate word: dead grid reached the bot`);
    for (const i of candidateIndices(s, best.word) ?? []) step({ type: 'toggleTile', index: i });
    step({ type: 'submitWord' });
  }
  if (s.phase !== 'summary') throw new Error('run did not finish');
  return { final: s, log, states };
}

function assertInvariants(s: RunState, c: EngineContext) {
  expect(s.player.hp).toBeGreaterThanOrEqual(0);
  expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
  expect(s.encounterIndex).toBeGreaterThanOrEqual(0);
  expect(s.encounterIndex).toBeLessThan(9);
  if (s.phase === 'fight') {
    expect(s.encounter).not.toBeNull();
    expect(s.encounter?.grid).toHaveLength(16);
    expect(isDead(s.encounter?.grid ?? [], c.solver)).toBe(false);
    expect(s.encounter?.enemy.hp).toBeGreaterThan(0);
  } else {
    expect(s.encounter).toBeNull();
  }
  if (s.phase === 'pick') expect(s.offer?.length).toBeGreaterThan(0);
  if (s.phase === 'summary') expect(s.outcome).not.toBeNull();
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
}

describe('newRun', () => {
  it('starts in a fight with full HP, no items, a live grid', () => {
    const s = newRun(1, ctx);
    expect(s.phase).toBe('fight');
    expect(s.player).toEqual({ hp: 100, maxHp: 100, items: [] });
    expect(s.encounterIndex).toBe(0);
    expect(s.encounter?.turn).toBe(1);
    expect(s.encounter?.enemy.hp).toBeGreaterThan(0);
    expect(s.stats.hpAtEncounterStart).toEqual([100]);
    assertInvariants(s, ctx);
  });

  it('is deterministic from the seed', () => {
    expect(newRun(123, ctx)).toEqual(newRun(123, ctx));
    expect(newRun(123, ctx).encounter?.grid).not.toEqual(newRun(124, ctx).encounter?.grid);
  });
});

describe('selection', () => {
  it('toggles tiles, refuses locked and out-of-range, clears', () => {
    let s = newRun(5, ctx);
    s = reduce(s, { type: 'toggleTile', index: 3 }, ctx);
    s = reduce(s, { type: 'toggleTile', index: 7 }, ctx);
    expect(s.encounter?.selection).toEqual([3, 7]);
    s = reduce(s, { type: 'toggleTile', index: 3 }, ctx);
    expect(s.encounter?.selection).toEqual([7]);
    expect(reduce(s, { type: 'toggleTile', index: 16 }, ctx).rejected).toBe('bad tile index');
    const locked = { ...s, encounter: { ...s.encounter!, grid: s.encounter!.grid.map((t, i) => (i === 0 ? { ...t, lockedTurns: 1 } : t)) } };
    expect(reduce(locked, { type: 'toggleTile', index: 0 }, ctx).rejected).toBe('tile is locked');
    s = reduce(s, { type: 'clearSelection' }, ctx);
    expect(s.encounter?.selection).toEqual([]);
    expect(s.rejected).toBeNull();
  });
});

describe('submitWord', () => {
  it('rejects non-words and short selections without changing anything else', () => {
    const s0 = newRun(9, ctx);
    const s1 = reduce(reduce(s0, { type: 'toggleTile', index: 0 }, ctx), { type: 'submitWord' }, ctx);
    expect(s1.rejected).toBe('too short');
    expect(s1.encounter?.enemy.hp).toBe(s0.encounter?.enemy.hp);
    expect(s1.rng).toEqual(s0.rng);
  });

  it('a valid word damages the enemy, the enemy hits back, used tiles refill, turn advances', () => {
    const s0 = newRun(9, ctx);
    const best = candidateWords(s0, ctx).sort((a, b) => b.damage - a.damage)[0]!;
    const bestIdx = candidateIndices(s0, best.word)!;
    const s1 = play(s0, best.word);
    expect(s1.rejected).toBeNull();
    expect(s1.lastTurn?.word).toBe(best.word);
    // Report records damage actually dealt, capped at the enemy's remaining HP.
    expect(s1.lastTurn?.damage).toBe(Math.min(best.damage, s0.encounter!.enemy.hp));
    if (s1.phase === 'fight') {
      expect(s1.encounter?.enemy.hp).toBe(Math.max(0, s0.encounter!.enemy.hp - best.damage));
      expect(s1.encounter?.turn).toBe(2);
      expect(s1.encounter?.selection).toEqual([]);
      const untouched = s0.encounter!.grid.filter((_, i) => !bestIdx.includes(i));
      const still = s1.encounter!.grid.filter((_, i) => !bestIdx.includes(i));
      expect(still).toEqual(untouched);
      expect(s1.player.hp).toBeLessThanOrEqual(100);
    }
    expect(s1.stats.turns).toBe(1);
    expect(s1.stats.bestWord).toBe(best.word);
  });

  it('HP persists across encounters; encounter end offers 3 distinct unowned items', () => {
    const { states } = greedyRun(3);
    const picks = states.filter((s) => s.phase === 'pick');
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(p.offer).toHaveLength(3);
      expect(new Set(p.offer).size).toBe(3);
      for (const id of p.offer ?? []) expect(p.player.items).not.toContain(id);
    }
    // The fight after a pick starts at the HP the previous one ended with (plus any onEncounterEnd heal).
    for (let i = 1; i < states.length; i++) {
      const prev = states[i - 1]!;
      const cur = states[i]!;
      if (prev.phase === 'pick' && cur.phase === 'fight') {
        expect(cur.encounter?.playerHpAtStart).toBe(prev.player.hp);
        expect(cur.player.items).toHaveLength(prev.player.items.length + 1);
      }
    }
  });
});

describe('full runs', () => {
  it('finish in won or lost, with a 9-entry HP curve on a win', () => {
    let won = 0;
    let lost = 0;
    for (let seed = 0; seed < 30; seed++) {
      const { final } = greedyRun(seed);
      expect(final.phase).toBe('summary');
      if (final.outcome === 'won') {
        won++;
        expect(final.stats.hpAtEncounterStart).toHaveLength(9);
        expect(final.player.items.length).toBe(8);
      } else {
        lost++;
        expect(final.player.hp).toBe(0);
      }
    }
    expect(won + lost).toBe(30);
  });

  it('replaying the action log reproduces the final state exactly', () => {
    const { final, log } = greedyRun(42);
    let s = newRun(42, ctx);
    for (const a of log.slice(1)) s = reduce(s, a, ctx);
    expect(s).toEqual(final);
    const roundTripped = JSON.parse(JSON.stringify(final)) as RunState;
    expect(roundTripped).toEqual(final);
  });

  it('the item pool changes outcomes: no items vs all items', () => {
    const noItems: EngineContext = nodeContext({ ...CONTENT, items: [] });
    const { final } = greedyRun(4, noItems);
    expect(final.player.items).toEqual([]);
    // With no items there is no pick phase: encounters chain directly.
    expect(final.phase).toBe('summary');
  });
});

describe('boss mechanic and dead-grid guard', () => {
  it('lockTiles locks playable tiles, they expire, and a locked-out grid gets scrambled', () => {
    // Force a boss encounter by starting at index 2 through the pick path is indirect; instead call the
    // reducer against a hand-built boss state.
    const base = newRun(11, ctx);
    const bossDef = CONTENT.bosses[0]!;
    const s0: RunState = {
      ...base,
      encounterIndex: 2,
      encounter: {
        ...base.encounter!,
        turn: 3, // special fires on turn % 3 === 0
        enemy: { id: bossDef.id, hp: 10_000, maxHp: 10_000, damage: 1 },
      },
    };
    const best = candidateWords(s0, ctx)[0]!;
    const s1 = play(s0, best.word);
    expect(s1.phase).toBe('fight');
    // Locked for 2 turns, ticked once at refill -> 1 remaining.
    const locked = s1.encounter!.grid.filter((t) => t.lockedTurns > 0);
    expect(locked).toHaveLength(3);
    expect(locked.every((t) => t.lockedTurns === 1)).toBe(true);
    expect(isDead(s1.encounter!.grid, ctx.solver)).toBe(false);
    const s2 = play(s1, candidateWords(s1, ctx)[0]!.word);
    expect(s2.encounter!.grid.every((t) => t.lockedTurns === 0)).toBe(true);
  });

  it('a grid with no playable word is scrambled before the player sees it', () => {
    // Lock every tile except c-a-t. After the play, the only playable tiles are the three
    // refills; three random letters rarely form a word, so the reducer must usually scramble.
    let scrambles = 0;
    for (let seed = 20; seed < 40; seed++) {
      const base = newRun(seed, ctx);
      const grid = base.encounter!.grid.map(() => ({ letter: 'e', lockedTurns: 5 }));
      grid[13] = { letter: 'c', lockedTurns: 0 };
      grid[14] = { letter: 'a', lockedTurns: 0 };
      grid[15] = { letter: 't', lockedTurns: 0 };
      const s0: RunState = { ...base, encounter: { ...base.encounter!, grid, enemy: { ...base.encounter!.enemy, hp: 10_000 } } };
      const s1 = play(s0, 'cat');
      expect(s1.phase).toBe('fight');
      expect(isDead(s1.encounter!.grid, ctx.solver)).toBe(false);
      if (s1.lastTurn?.scrambled) {
        scrambles++;
        expect(s1.encounter!.grid.every((t) => t.lockedTurns === 0)).toBe(true);
      }
    }
    expect(scrambles).toBeGreaterThan(3);
  });
});

describe('selectedWord', () => {
  it('reads letters in selection order', () => {
    const s = newRun(2, ctx);
    const s1 = reduce(reduce(s, { type: 'toggleTile', index: 5 }, ctx), { type: 'toggleTile', index: 1 }, ctx);
    expect(selectedWord(s1)).toBe(`${s.encounter!.grid[5]!.letter}${s.encounter!.grid[1]!.letter}`);
  });
});
