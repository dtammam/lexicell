import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { CONTENT } from '../content/index';
import { candidateIndices, candidateWords } from './candidates';
import { isDead, refill } from './grid';
import { newRun, reduce, selectedWord, type Action, type EngineContext } from './reducer';
import { tilesForWord } from './solver';
import type { Encounter, RunState } from './types';

/** Shipped content opens on a starting-kit pick; most tests here want the first fight directly. */
const ctx = nodeContext({ ...CONTENT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });

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
  }, 30_000);

  it('replaying the action log reproduces the final state exactly', () => {
    const { final, log } = greedyRun(42);
    let s = newRun(42, ctx);
    for (const a of log.slice(1)) s = reduce(s, a, ctx);
    expect(s).toEqual(final);
    const roundTripped = JSON.parse(JSON.stringify(final)) as RunState;
    expect(roundTripped).toEqual(final);
  }, 30_000);

  it('the item pool changes outcomes: no items vs all items', () => {
    const noItems: EngineContext = nodeContext({ ...CONTENT, items: [], tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    const { final } = greedyRun(4, noItems);
    expect(final.player.items).toEqual([]);
    // With no items there is no pick phase: encounters chain directly.
    expect(final.phase).toBe('summary');
  });
});

describe('starting kit (tuning.startingPicks)', () => {
  const kit: EngineContext = nodeContext({ ...CONTENT, tuning: { ...CONTENT.tuning, startingPicks: 1 } });

  it('opens on a pick, then starts encounter 0 with the chosen item and no index skip', () => {
    const s0 = newRun(5, kit);
    expect(s0.phase).toBe('pick');
    expect(s0.offer).toHaveLength(3);
    expect(s0.encounter).toBeNull();
    expect(s0.pendingPicks).toBe(1);
    expect(s0.stats.hpAtEncounterStart).toEqual([]);
    const s1 = reduce(s0, { type: 'pickItem', index: 1 }, kit);
    expect(s1.phase).toBe('fight');
    expect(s1.encounterIndex).toBe(0);
    expect(s1.pendingPicks).toBe(0);
    expect(s1.player.items).toEqual([s0.offer?.[1]]);
    expect(s1.stats.hpAtEncounterStart).toEqual([100]);
    assertInvariants(s1, kit);
  });

  it('two starting picks chain two offers before the first fight', () => {
    const kit2: EngineContext = nodeContext({ ...CONTENT, tuning: { ...CONTENT.tuning, startingPicks: 2 } });
    let s = newRun(6, kit2);
    s = reduce(s, { type: 'pickItem', index: 0 }, kit2);
    expect(s.phase).toBe('pick');
    expect(s.pendingPicks).toBe(1);
    s = reduce(s, { type: 'pickItem', index: 0 }, kit2);
    expect(s.phase).toBe('fight');
    expect(s.encounterIndex).toBe(0);
    expect(s.player.items).toHaveLength(2);
    expect(new Set(s.player.items).size).toBe(2);
  });

  it('a full run with a kit still ends with exactly 9 encounters and 9 items on a win', () => {
    const { final } = greedyRun(7, kit);
    expect(final.phase).toBe('summary');
    if (final.outcome === 'won') {
      expect(final.stats.hpAtEncounterStart).toHaveLength(9);
      expect(final.player.items).toHaveLength(9);
    }
  });

  it('a kit with an empty item pool skips the offer and still starts encounter 0', () => {
    // Binds makeOffer's empty-offer path to advance(): before the kit, it bumped encounterIndex directly,
    // which with a pick pending would skip encounter 0 and leave pendingPicks stuck at 1 for the whole run.
    const bare: EngineContext = nodeContext({ ...CONTENT, items: [], tuning: { ...CONTENT.tuning, startingPicks: 1 } });
    const s0 = newRun(5, bare);
    expect(s0.phase).toBe('fight');
    expect(s0.encounterIndex).toBe(0);
    expect(s0.pendingPicks).toBe(0);
    expect(s0.player.items).toEqual([]);
    expect(s0.stats.hpAtEncounterStart).toEqual([100]);
    const { final } = greedyRun(5, bare);
    expect(final.pendingPicks).toBe(0);
    expect(final.stats.hpAtEncounterStart).toHaveLength(final.encounterIndex + 1);
  });

  it('three picks against a two-item pool: the pool runs out mid-kit and encounter 0 still starts', () => {
    const two = CONTENT.items.slice(0, 2);
    const kit3: EngineContext = nodeContext({ ...CONTENT, items: two, tuning: { ...CONTENT.tuning, startingPicks: 3 } });
    let s = newRun(8, kit3);
    expect(s.phase).toBe('pick');
    expect(s.pendingPicks).toBe(3);
    s = reduce(s, { type: 'pickItem', index: 0 }, kit3);
    expect(s.phase).toBe('pick');
    expect(s.offer).toHaveLength(1);
    expect(s.pendingPicks).toBe(2);
    s = reduce(s, { type: 'pickItem', index: 0 }, kit3);
    expect(s.phase).toBe('fight');
    expect(s.encounterIndex).toBe(0);
    expect(s.pendingPicks).toBe(0);
    expect([...s.player.items].sort()).toEqual(two.map((i) => i.id).sort());
    expect(s.stats.hpAtEncounterStart).toEqual([100]);
    assertInvariants(s, kit3);
  });

  it('startingPicks 0 opens on a fight; shipped content opens on a pick', () => {
    expect(newRun(5, ctx).pendingPicks).toBe(0);
    expect(newRun(5, ctx).phase).toBe('fight');
    expect(newRun(5, nodeContext()).phase).toBe('pick');
  });

  it('newRun clamps a negative or fractional startingPicks rather than trusting content', () => {
    const neg = nodeContext({ ...CONTENT, tuning: { ...CONTENT.tuning, startingPicks: -1 } });
    expect(newRun(5, neg).pendingPicks).toBe(0);
    const frac = nodeContext({ ...CONTENT, tuning: { ...CONTENT.tuning, startingPicks: 1.5 } });
    expect(newRun(5, frac).pendingPicks).toBe(1);
  });
});

describe('gravity: refilled columns settle', () => {
  it('after a word the report names the used tiles, survivors rise in their column, fresh tiles land below', () => {
    const s0 = newRun(21, ctx);
    if (s0.phase !== 'fight') throw new Error('expected a fight');
    const before = (s0.encounter as Encounter).grid;
    const best = candidateWords(s0, ctx).sort((a, b) => b.damage - a.damage)[0];
    if (!best) throw new Error('no word');
    const idx = candidateIndices(s0, best.word);
    if (!idx) throw new Error('cannot place');
    let s = s0;
    for (const i of idx) s = reduce(s, { type: 'toggleTile', index: i }, ctx);
    const used = [...(s.encounter as Encounter).selection];
    const s1 = reduce(s, { type: 'submitWord' }, ctx);
    expect(s1.lastTurn?.used).toEqual(used);
    if (s1.phase !== 'fight') return; // a kill ends the encounter; the grid is gone
    const after = (s1.encounter as Encounter).grid;
    const usedSet = new Set(used);
    for (let c = 0; c < 4; c++) {
      const survivors = [0, 1, 2, 3].filter((r) => !usedSet.has(r * 4 + c)).map((r) => before[r * 4 + c]?.letter);
      const top = survivors.map((_, r) => after[r * 4 + c]?.letter);
      // The vowel floor may swap one consonant for a vowel anywhere; allow at most one mismatch per column.
      const mismatches = survivors.filter((l, r) => l !== top[r]).length;
      expect(mismatches, `column ${c}`).toBeLessThanOrEqual(1);
    }
  });

  it('a shuffle settles too: a locked tile rises to the top of its column', () => {
    const s0 = newRun(22, ctx);
    if (s0.phase !== 'fight') throw new Error('expected a fight');
    const enc0 = s0.encounter as Encounter;
    const grid = enc0.grid.map((t, i) => (i === 14 ? { ...t, lockedTurns: 3 } : t));
    const s2 = reduce({ ...s0, encounter: { ...enc0, grid } }, { type: 'shuffle' }, ctx);
    if (s2.phase !== 'fight') return;
    const g2 = (s2.encounter as Encounter).grid;
    expect(g2[2]).toEqual({ letter: grid[14]?.letter, lockedTurns: 2 });
    expect(s2.lastTurn?.used).toHaveLength(15);
  });
});

describe('shuffle (costs the turn)', () => {
  function inFight(seed: number): RunState {
    const s = newRun(seed, ctx);
    if (s.phase !== 'fight') throw new Error('expected a fight');
    return s;
  }

  it('is rejected outside a fight and leaves the state otherwise untouched', () => {
    const kit = nodeContext({ ...CONTENT, tuning: { ...CONTENT.tuning, startingPicks: 1 } });
    const s0 = newRun(5, kit);
    const s1 = reduce(s0, { type: 'shuffle' }, kit);
    expect(s1.rejected).toBe('not in a fight');
    expect({ ...s1, rejected: null }).toEqual({ ...s0, rejected: null });
  });

  it('redraws through the RNG, clears the selection, counts a turn, and the enemy attacks once', () => {
    let s = inFight(11);
    s = reduce(s, { type: 'toggleTile', index: 0 }, ctx);
    const before = s;
    const enemy = (before.encounter as Encounter).enemy;
    const def = [...CONTENT.enemies, ...CONTENT.bosses].find((e) => e.id === enemy.id);
    if (!def) throw new Error('enemy def');
    const s2 = reduce(s, { type: 'shuffle' }, ctx);
    assertInvariants(s2, ctx);
    const enc = s2.encounter as Encounter;
    expect(s2.rng.counter).toBeGreaterThan(before.rng.counter);
    expect(enc.selection).toEqual([]);
    expect(enc.turn).toBe(2);
    expect(s2.stats.turns).toBe(before.stats.turns + 1);
    expect(enc.enemy.hp).toBe(enemy.hp); // no damage dealt by a shuffle
    expect(s2.lastTurn).toMatchObject({ word: '', damage: 0, scrambled: true });
    const expectedHit = 1 % def.attackEvery === 0 ? enemy.damage : 0;
    expect(before.player.hp - s2.player.hp).toBe(expectedHit);
    expect(s2.lastTurn?.enemyDamage).toBe(expectedHit);
    expect(s2.stats.damageTaken).toBe(before.stats.damageTaken + expectedHit);
  });

  it('keeps locked tiles in place (and ticks them) while every unlocked tile is redrawn', () => {
    const s0 = inFight(12);
    const enc0 = s0.encounter as Encounter;
    const grid = enc0.grid.map((t, i) => (i === 3 || i === 9 ? { ...t, lockedTurns: 2 } : t));
    const s1: RunState = { ...s0, encounter: { ...enc0, grid } };
    const s2 = reduce(s1, { type: 'shuffle' }, ctx);
    const g2 = (s2.encounter as Encounter).grid;
    // Gravity: a locked survivor rises to the top of its column. Index 3 is already row 0;
    // index 9 (row 2, column 1) settles to index 1.
    expect(g2[3]).toEqual({ letter: grid[3]?.letter, lockedTurns: 1 });
    expect(g2[1]).toEqual({ letter: grid[9]?.letter, lockedTurns: 1 });
    expect(g2.filter((t) => t.lockedTurns > 0)).toHaveLength(2);
    // Fourteen fresh draws: identical to the old multiset only by a 1-in-astronomical chance.
    const oldLetters = grid.filter((_, i) => i !== 3 && i !== 9).map((t) => t.letter).sort();
    const newLetters = g2.filter((t) => t.lockedTurns === 0).map((t) => t.letter).sort();
    expect(newLetters).not.toEqual(oldLetters);
    expect(isDead(g2, ctx.solver)).toBe(false);
  });

  it('with fourteen tiles locked the guard fires after a shuffle and the grid comes back live', () => {
    const s0 = inFight(16);
    const enc0 = s0.encounter as Encounter;
    const grid = enc0.grid.map((t, i) => (i < 14 ? { ...t, lockedTurns: 3 } : t));
    const s1: RunState = { ...s0, encounter: { ...enc0, grid } };
    const s2 = reduce(s1, { type: 'shuffle' }, ctx);
    if (s2.phase !== 'fight') return; // the enemy's turn can kill at low HP; not this seed's concern
    expect(isDead((s2.encounter as Encounter).grid, ctx.solver)).toBe(false);
    expect(s2.lastTurn?.scrambled).toBe(true);
  });

  it('a shuffle draws with the onTileDraw vowel weight, exactly as refill would', () => {
    const s0 = inFight(17);
    const s1: RunState = { ...s0, player: { ...s0.player, items: ['vowel-magnet'] } };
    const enc = s1.encounter as Encounter;
    const all = enc.grid.map((_, i) => i);
    const [expected] = refill(s1.rng, enc.grid, all, 1.5);
    const [unweighted] = refill(s1.rng, enc.grid, all, 1);
    const s2 = reduce(s1, { type: 'shuffle' }, ctx);
    if (s2.phase !== 'fight') return;
    expect((s2.encounter as Encounter).grid).toEqual(expected);
    expect(expected).not.toEqual(unweighted);
  });

  it('clears a stale rejection', () => {
    const s0: RunState = { ...inFight(18), rejected: 'not a word' };
    expect(reduce(s0, { type: 'shuffle' }, ctx).rejected).toBeNull();
  });

  it('is deterministic and JSON-clean', () => {
    const s = inFight(13);
    const a = reduce(s, { type: 'shuffle' }, ctx);
    const b = reduce(s, { type: 'shuffle' }, ctx);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('can kill you: the enemy turn runs and the run ends in a loss', () => {
    // Pick a seed whose enemy attacks every turn, so turn 1 carries a hit.
    let seed = 14;
    let s0 = inFight(seed);
    const attacksEveryTurn = (s: RunState) => CONTENT.enemies.find((e) => e.id === (s.encounter as Encounter).enemy.id)?.attackEvery === 1;
    while (!attacksEveryTurn(s0)) s0 = inFight(++seed);
    const s1: RunState = { ...s0, player: { ...s0.player, hp: 1 } };
    const s2 = reduce(s1, { type: 'shuffle' }, ctx);
    expect(s2.phase).toBe('summary');
    expect(s2.outcome).toBe('lost');
    expect(s2.encounter).toBeNull();
    expect(s2.lastTurn?.enemyDamage).toBeGreaterThan(0);
  });

  it('a played word after a shuffle behaves as before: the refill path is unchanged', () => {
    // submitWord was split into enemyTurn + endTurn for shuffle; the same seed and word must
    // reach byte-identical state whether or not the split exists. Bound by the sim tables too.
    const s0 = inFight(15);
    const best = candidateWords(s0, ctx).sort((a, b) => b.damage - a.damage)[0];
    if (!best) throw new Error('no word');
    const s1 = play(s0, best.word);
    assertInvariants(s1, ctx);
    if (s1.phase === 'fight') {
      expect((s1.encounter as Encounter).turn).toBe(2);
      expect((s1.encounter as Encounter).selection).toEqual([]);
    }
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
