import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { CONTENT } from '../content/index';
import { RARITY_WEIGHT as CONTENT_RARITY_WEIGHT } from '../content/items';
import { bestGold, candidateIndices, candidateWords, type Candidate } from './candidates';
import { gatherEffects } from './hooks';
import { biasFor, isDead, plainTile, refill, settle } from './grid';
import { encounterDefFor, hitRange, kindAt, letterBias, MAX_COMMONS_PER_OFFER, newRun, placeKinds, RARITY_WEIGHT, reduce, resistHit, resistLabel, scoreSelection, selectedWord, type Action, type EngineContext } from './reducer';
import type { Condition, ConditionContext } from './effects';
import { scoreWord } from './scoring';
import { createRng, pick } from './rng';
import { tilesForWord } from './solver';
import type { Content, Encounter, EncounterDef as EncounterDefT, EncounterKind as EncounterKindT, EnemyDef, EventChoice as EventChoiceT, ItemDef, RunState, Tile } from './types';

/** Shipped content opens on a starting-kit pick; most tests here want the first fight directly. */
/** Flat hits (variance 0) so the arithmetic in these tests stays exact; the variety-wave block tests the roll. */
const FLAT: Content = { ...CONTENT, enemies: CONTENT.enemies.map((e) => ({ ...e, variance: 0 })), bosses: CONTENT.bosses.map((e) => ({ ...e, variance: 0 })) };
const REAL_ROLLS: Content = CONTENT;
const ctx = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });

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
    // Encounter types (step 2): the greedy helper heals at a rest below 60% and takes every trade.
    if (s.phase === 'rest') {
      step(s.player.hp < s.player.maxHp * 0.6 || !s.offer ? { type: 'restHeal' } : { type: 'pickItem', index: pickIndex });
      continue;
    }
    if (s.phase === 'event') {
      step({ type: 'eventChoice', index: 0 });
      continue;
    }
    if (s.phase === 'evolve') {
      step({ type: 'pickTrait', index: 0 });
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

/** Items a greedy win holds: six fight picks, the rest's pick unless it healed, the event's pick when its trade carries one. */
function expectedItems(seed: number, c: EngineContext = ctx): number {
  const { log, states } = greedyRun(seed, c);
  const healed = log.some((a) => a.type === 'restHeal') ? 0 : 1;
  const eventState = states.find((st) => st.phase === 'event');
  const trade = c.content.events.find((e) => e.id === eventState?.event)?.choices[0];
  // A cursed offer (variety wave step 6) the greedy helper takes adds its curse on top of the boon:
  // one extra item per cursed pick it walked through (it never skips).
  const cursedPicks = states.filter((st) => st.phase === 'pick' && st.curses !== null).length;
  return 6 + healed + (trade?.rarePick ? 1 : 0) + cursedPicks;
}

function assertInvariants(s: RunState, c: EngineContext) {
  expect(s.player.hp).toBeGreaterThanOrEqual(0);
  expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
  expect(s.encounterIndex).toBeGreaterThanOrEqual(0);
  if (s.mode !== 'endless') expect(s.encounterIndex).toBeLessThan(9);
  if (s.phase === 'fight') {
    expect(s.encounter).not.toBeNull();
    expect(s.encounter?.grid).toHaveLength(16);
    expect(isDead(s.encounter?.grid ?? [], c.solver)).toBe(false);
    expect(s.encounter?.enemy.hp).toBeGreaterThan(0);
  } else {
    expect(s.encounter).toBeNull();
  }
  if (s.phase === 'pick' || s.phase === 'evolve') expect(s.offer?.length).toBeGreaterThan(0);
  if (s.phase === 'event') expect(s.event).not.toBeNull();
  if (s.phase !== 'event') expect(s.event).toBeNull();
  if (s.phase === 'summary') expect(s.outcome).not.toBeNull();
  // Curses (variety wave step 6): non-null only on a cursed pick, aligned 1:1 with the offer.
  if (s.phase !== 'pick') expect(s.curses).toBeNull();
  if (s.curses !== null) {
    expect(s.phase).toBe('pick');
    expect(s.curses.length).toBe(s.offer?.length);
    for (const id of s.curses) expect(c.content.items.find((i) => i.id === id)?.curse, id).toBe(true);
  }
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
}

describe('newRun', () => {
  it('starts in a fight with full HP, no items, a live grid', () => {
    const s = newRun(1, ctx);
    expect(s.phase).toBe('fight');
    expect(s.player).toEqual({ hp: 100, maxHp: 100, items: [], traits: [], shield: 0, freeShuffles: 0 });
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
    // The fight after a pick starts at the HP the previous one ended with, plus whatever the picked
    // item's onPick added (maxHp heals the new room: Growth Factor, Cocoon); never less.
    for (let i = 1; i < states.length; i++) {
      const prev = states[i - 1]!;
      const cur = states[i]!;
      if (prev.phase === 'pick' && cur.phase === 'fight') {
        // A cursed pick (step 6) adds the curse too, and its onPick max-HP cut can lower HP: the
        // never-less rule holds only for a normal pick.
        if (prev.curses === null) expect(cur.encounter?.playerHpAtStart).toBeGreaterThanOrEqual(prev.player.hp);
        expect(cur.encounter?.playerHpAtStart).toBeLessThanOrEqual(cur.player.maxHp);
        expect(cur.player.items).toHaveLength(prev.player.items.length + (prev.curses ? 2 : 1));
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
        // One pick per fight won short of the last (six), plus the rest's pick unless it healed,
        // plus the event's pick when its trade carries one (step 2).
        expect(final.player.items.length).toBe(expectedItems(seed));
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
    const noItems: EngineContext = nodeContext({ ...FLAT, items: [], tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    const { final } = greedyRun(4, noItems);
    expect(final.player.items).toEqual([]);
    // With no items there is no pick phase: encounters chain directly.
    expect(final.phase).toBe('summary');
  });
});

describe('starting kit (tuning.startingPicks)', () => {
  const kit: EngineContext = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 1 } });

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
    const kit2: EngineContext = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 2 } });
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
      expect(final.player.items).toHaveLength(expectedItems(7, kit) + 1);
    }
  });

  it('a kit with an empty item pool skips the offer and still starts encounter 0', () => {
    // Binds makeOffer's empty-offer path to advance(): before the kit, it bumped encounterIndex directly,
    // which with a pick pending would skip encounter 0 and leave pendingPicks stuck at 1 for the whole run.
    const bare: EngineContext = nodeContext({ ...FLAT, items: [], tuning: { ...CONTENT.tuning, startingPicks: 1 } });
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
    const kit3: EngineContext = nodeContext({ ...FLAT, items: two, tuning: { ...CONTENT.tuning, startingPicks: 3 } });
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
    const neg = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: -1 } });
    expect(newRun(5, neg).pendingPicks).toBe(0);
    const frac = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 1.5 } });
    expect(newRun(5, frac).pendingPicks).toBe(1);
  });
});

describe('venom: a tile that bites until you spend it', () => {
  function polypTurn(seed: number, turn = 3): RunState {
    const s0 = newRun(seed, ctx);
    if (s0.phase !== 'fight') throw new Error('expected a fight');
    const enc = s0.encounter as Encounter;
    return { ...s0, encounter: { ...enc, turn, enemy: { id: 'polyp', hp: 100000, maxHp: 100000, damage: 1, poison: 0, stunned: 0 } } };
  }
  function playBest(s: RunState): RunState {
    const best = candidateWords(s, ctx).sort((a, b) => b.damage - a.damage)[0];
    if (!best) throw new Error('no word');
    return play(s, best.word);
  }

  it('the Polyp special venoms one clean, unlocked survivor (never a played tile), and it bites next turn', () => {
    const s = polypTurn(40);
    const idx = candidateIndices(s, candidateWords(s, ctx).sort((a, b) => b.damage - a.damage)[0]?.word ?? '');
    if (!idx) throw new Error('no word');
    const before = (s.encounter as Encounter).grid;
    const s1 = playBest(s);
    expect(s1.phase).toBe('fight');
    const grid = (s1.encounter as Encounter).grid;
    const venomous = grid.filter((t) => t.venom > 0);
    expect(venomous).toHaveLength(1);
    // Applied at 2 by the special, then bitten once at the next turn start and grown to 3.
    expect(venomous[0]?.venom).toBe(3);
    expect(s1.lastTurn?.venom).toBe(2);
    expect(s.player.hp - s1.player.hp).toBe(2 + (s1.lastTurn?.enemyDamage ?? 0));
    // It was a survivor: its letter is among the tiles not played.
    const survivors = before.filter((_, i) => !idx.includes(i)).map((t) => t.letter);
    expect(survivors).toContain(venomous[0]?.letter);
    assertInvariants(s1, ctx);
  });

  it('bites every turn and grows; spending the tile cures it; it can kill', () => {
    // The first seed from 41 whose grid holds a word avoiding tile 5 and, after it, a word through the
    // venomed tile (the grids moved when step 2 added three placement draws to newRun).
    const fixture = (): { s1: RunState; avoiding: Candidate; s2: RunState; through: Candidate } => {
      for (let seed = 41; seed < 80; seed++) {
        const s0 = polypTurn(seed, 1);
        const enc0 = s0.encounter as Encounter;
        const grid = enc0.grid.map((t, i) => (i === 5 ? { ...t, venom: 2 } : t));
        const s1: RunState = { ...s0, encounter: { ...enc0, grid } };
        const cands = candidateWords(s1, ctx).sort((a, b) => a.damage - b.damage);
        const avoiding = cands.find((c) => !(candidateIndices(s1, c.word) ?? []).includes(5));
        if (!avoiding) continue;
        const s2 = play(s1, avoiding.word);
        if (s2.phase !== 'fight') continue;
        const at = (s2.encounter as Encounter).grid.findIndex((t) => t.venom > 0);
        const through = candidateWords(s2, ctx).find((c) => (candidateIndices(s2, c.word) ?? []).includes(at));
        if (through) return { s1, avoiding, s2, through };
      }
      throw new Error('no seed in 41..79 fits the venom fixture');
    };
    const { s1, avoiding, s2, through } = fixture();
    // Playing a word that avoids tile 5: the venom bites for 2 and grows to 3.
    expect(s2.lastTurn?.venom).toBe(2);
    expect(s2.stats.damageTaken).toBe(s1.stats.damageTaken + 2 + (s2.lastTurn?.enemyDamage ?? 0));
    const g2 = (s2.encounter as Encounter).grid;
    expect(g2.filter((t) => t.venom > 0).map((t) => t.venom)).toEqual([3]);
    // Now spend it: settle may have moved it; a word through it cures it.
    const s3 = play(s2, through.word);
    if (s3.phase === 'fight') {
      expect((s3.encounter as Encounter).grid.every((t) => t.venom === 0)).toBe(true);
      // Spent before the bite: the refill removes it ahead of the next turn start, so no venom this turn.
      expect(s3.lastTurn?.venom).toBe(0);
    }
    // Lethal: 1 HP against a 2 bite, with an enemy that cannot attack, so the venom is what kills.
    const dying: RunState = { ...s1, player: { ...s1.player, hp: 1 }, encounter: { ...(s1.encounter as Encounter), enemy: { ...(s1.encounter as Encounter).enemy, damage: 0 } } };
    const dead = play(dying, avoiding.word);
    expect(dead.phase).toBe('summary');
    expect(dead.outcome).toBe('lost');
    expect(dead.player.hp).toBe(0);
    expect(dead.lastTurn?.venom).toBe(1);
    expect(dead.stats.damageTaken).toBe(dying.stats.damageTaken + 1);
  });

  it('venom grows to tuning.venomMax and no further', () => {
    const s0 = polypTurn(44, 1);
    const enc0 = s0.encounter as Encounter;
    const max = CONTENT.tuning.venomMax;
    const grid = enc0.grid.map((t, i) => (i === 9 ? { ...t, venom: max } : t));
    const s1: RunState = { ...s0, encounter: { ...enc0, grid } };
    const cands = candidateWords(s1, ctx).sort((a, b) => a.damage - b.damage);
    const avoiding = cands.find((c) => !(candidateIndices(s1, c.word) ?? []).includes(9));
    if (!avoiding) throw new Error('no word avoiding tile 9');
    const s2 = play(s1, avoiding.word);
    if (s2.phase !== 'fight') return;
    expect(s2.lastTurn?.venom).toBe(max);
    expect((s2.encounter as Encounter).grid.filter((t) => t.venom > 0).map((t) => t.venom)).toEqual([max]);
  });

  it('a shuffle cures venom (and costs the turn), and the whole state stays JSON-clean and deterministic', () => {
    const s0 = polypTurn(42, 1);
    const enc0 = s0.encounter as Encounter;
    const grid = enc0.grid.map((t, i) => (i === 7 ? { ...t, venom: 2 } : t));
    const s1: RunState = { ...s0, encounter: { ...enc0, grid } };
    const a = reduce(s1, { type: 'shuffle' }, ctx);
    const b = reduce(s1, { type: 'shuffle' }, ctx);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    if (a.phase === 'fight') expect((a.encounter as Encounter).grid.every((t) => t.venom === 0)).toBe(true);
  });

  it('the enemy-dead check comes before the bite: a killing turn-start item ends the fight, venom does not bite a dead enemy\'s victim', () => {
    // Gate W3. Player at 2 HP with a venomed tile at 2 and Spores (4 damage at turn start); the enemy is
    // left at 3 HP after the word. Spores kills it at turn start, so the fight ends and no bite lands.
    const s0 = polypTurn(45, 1);
    const enc0 = s0.encounter as Encounter;
    const grid = enc0.grid.map((t, i) => (i === 11 ? { ...t, venom: 2 } : t));
    const withSpores: RunState = { ...s0, player: { ...s0.player, hp: 2, items: ['spores'] }, encounter: { ...enc0, grid } };
    const cands = candidateWords(withSpores, ctx).sort((a, b) => a.damage - b.damage);
    const avoiding = cands.find((c) => !(candidateIndices(withSpores, c.word) ?? []).includes(11));
    if (!avoiding) throw new Error('no word avoiding tile 11');
    // Enemy HP set so the word leaves it at 3: it survives the word and dies to Spores at turn start.
    const enemyHp = avoiding.damage + 3;
    const staged: RunState = { ...withSpores, encounter: { ...(withSpores.encounter as Encounter), enemy: { ...enc0.enemy, hp: enemyHp, maxHp: enemyHp, damage: 0 } } };
    const after = play(staged, avoiding.word);
    expect(after.phase).toBe('pick');
    expect(after.player.hp).toBe(2);
    expect(after.lastTurn?.venom).toBe(0);
  });

  it('venomTiles threads its RNG draw back into state', () => {
    const s = polypTurn(46, 3);
    const idx = candidateIndices(s, candidateWords(s, ctx).sort((a, b) => b.damage - a.damage)[0]?.word ?? '');
    if (!idx) throw new Error('no word');
    const s1 = playBest(s);
    if (s1.phase !== 'fight') return;
    // Same seed, same word, but on a turn where the special does not fire: one fewer draw.
    const quiet = { ...s, encounter: { ...(s.encounter as Encounter), turn: 2 } };
    const q1 = playBest(quiet);
    if (q1.phase !== 'fight') return;
    expect(s1.rng.counter - s.rng.counter).toBeGreaterThan(q1.rng.counter - quiet.rng.counter);
  });

  it('venomTiles never picks a locked or already venomous tile', () => {
    const s0 = polypTurn(43, 3);
    const enc0 = s0.encounter as Encounter;
    // Lock or venom everything but tiles 0 and 1; the special must land on one of those two.
    const grid = enc0.grid.map((t, i) => (i < 2 ? t : i % 2 === 0 ? { ...t, lockedTurns: 3 } : { ...t, venom: 1 }));
    const s1: RunState = { ...s0, encounter: { ...enc0, grid } };
    const cands = candidateWords(s1, ctx);
    const word = cands.find((c) => !(candidateIndices(s1, c.word) ?? []).some((i) => i < 2));
    if (!word) return; // the two clean tiles may be needed for any word; nothing to assert on this seed
    const s2 = play(s1, word.word);
    if (s2.phase !== 'fight') return;
    const g2 = (s2.encounter as Encounter).grid;
    // Pre-venomed tiles not spent by the word grew from 1 to 2; the one new venom was set at 2 and bitten to 3.
    const spentVenomed = (candidateIndices(s1, word.word) ?? []).filter((i) => (grid[i]?.venom ?? 0) > 0).length;
    expect(g2.filter((t) => t.venom === 3)).toHaveLength(1);
    expect(g2.filter((t) => t.venom === 2)).toHaveLength(7 - spentVenomed);
    expect(g2.filter((t) => t.lockedTurns > 0).every((t) => t.venom === 0)).toBe(true);
    expect([grid[0]?.letter, grid[1]?.letter]).toContain(g2.find((t) => t.venom === 3)?.letter);
  });
});

describe('boss lock lands on survivors, never on the tiles just played (tracker #5)', () => {
  /** A Colony fight on the turn its special fires, against an enemy that cannot die this turn. */
  function bossTurn(seed: number): RunState {
    const s0 = newRun(seed, ctx);
    if (s0.phase !== 'fight') throw new Error('expected a fight');
    const enc = s0.encounter as Encounter;
    return { ...s0, encounter: { ...enc, turn: 3, enemy: { id: 'colony', hp: 100000, maxHp: 100000, damage: 1, poison: 0, stunned: 0 } } };
  }

  it('after a word, exactly three tiles are locked, all survivors of the refill, on every seed', () => {
    for (let seed = 30; seed < 60; seed++) {
      const s = bossTurn(seed);
      const best = candidateWords(s, ctx).sort((a, b) => b.damage - a.damage)[0];
      if (!best) throw new Error('no word');
      const idx = candidateIndices(s, best.word);
      if (!idx) throw new Error('cannot place');
      let sel = s;
      for (const i of idx) sel = reduce(sel, { type: 'toggleTile', index: i }, ctx);
      const after = reduce(sel, { type: 'submitWord' }, ctx);
      expect(after.phase, `seed ${seed}`).toBe('fight');
      const grid = (after.encounter as Encounter).grid;
      const locked = grid.filter((t) => t.lockedTurns > 0);
      // Three, or every survivor when the word left fewer (seed 35 plays a 14-letter word).
      expect(locked, `seed ${seed}: ${locked.length} locked`).toHaveLength(Math.min(3, 16 - idx.length));
      // A locked tile keeps its letter from before the turn: it was a survivor, not a fresh draw.
      const before = (s.encounter as Encounter).grid;
      const survivorsLetters = before.filter((_, i) => !idx.includes(i)).map((t) => t.letter);
      for (const t of locked) {
        const at = survivorsLetters.indexOf(t.letter);
        expect(at, `seed ${seed}: locked ${t.letter} was not a survivor`).toBeGreaterThanOrEqual(0);
        survivorsLetters.splice(at, 1);
      }
    }
  });
});

describe('gravity: refilled columns settle', () => {
  it('after a word the grid is exactly refill then settle: survivors rise, fresh tiles land below', () => {
    // An unkillable enemy so the encounter never ends, and no items (ctx has no starting kit), so the
    // only RNG between submit and the refill is the refill itself: the result must equal
    // settle(refill(rng, grid, selection)) with no lock to tick. This binds the order (M6) and the
    // presence (M7) of settle in endTurn exactly.
    const s0 = newRun(21, ctx);
    if (s0.phase !== 'fight') throw new Error('expected a fight');
    const enc0 = s0.encounter as Encounter;
    const tank: RunState = { ...s0, encounter: { ...enc0, enemy: { ...enc0.enemy, hp: 100000, maxHp: 100000 } } };
    const best = candidateWords(tank, ctx).sort((a, b) => b.damage - a.damage)[0];
    if (!best) throw new Error('no word');
    const idx = candidateIndices(tank, best.word);
    if (!idx) throw new Error('cannot place');
    let s = tank;
    for (const i of idx) s = reduce(s, { type: 'toggleTile', index: i }, ctx);
    const used = [...(s.encounter as Encounter).selection];
    const s1 = reduce(s, { type: 'submitWord' }, ctx);
    expect(s1.phase).toBe('fight');
    expect(s1.lastTurn?.used).toEqual(used);
    const [refilled] = refill(s.rng, enc0.grid, used, 1);
    const expected = settle(refilled, used);
    expect((s1.encounter as Encounter).grid).toEqual(expected);
    expect(expected).not.toEqual(refilled); // the word was not a full column, so settling moved something
    // Survivors kept their letters in column order; fresh tiles are the bottom of each column.
    const usedSet = new Set(used);
    for (let c = 0; c < 4; c++) {
      const survivors = [0, 1, 2, 3].filter((r) => !usedSet.has(r * 4 + c)).map((r) => refilled[r * 4 + c]);
      expect([0, 1, 2, 3].map((r) => expected[r * 4 + c]).slice(0, survivors.length)).toEqual(survivors);
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
    expect(g2[2]).toEqual({ letter: grid[14]?.letter, lockedTurns: 2, venom: 0, gold: 0, cracked: 0 });
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
    const kit = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 1 } });
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
    expect(g2[3]).toEqual({ letter: grid[3]?.letter, lockedTurns: 1, venom: 0, gold: 0, cracked: 0 });
    expect(g2[1]).toEqual({ letter: grid[9]?.letter, lockedTurns: 1, venom: 0, gold: 0, cracked: 0 });
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
    // A dead-grid scramble replaces every tile, so the report says so and the UI animates all 16.
    expect(s2.lastTurn?.used).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('a shuffle draws with the onTileDraw vowel weight, exactly as refill would', () => {
    const s0 = inFight(17);
    const s1: RunState = { ...s0, player: { ...s0.player, items: ['vowel-magnet'] } };
    const enc = s1.encounter as Encounter;
    const all = enc.grid.map((_, i) => i);
    const magnet = CONTENT.items.find((i) => i.id === 'vowel-magnet')?.hooks.onTileDraw?.[0];
    const weight = magnet?.type === 'vowelWeight' ? magnet.value : 1.5;
    const [expected] = refill(s1.rng, enc.grid, all, weight);
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
        enemy: { id: bossDef.id, hp: 10_000, maxHp: 10_000, damage: 1, poison: 0, stunned: 0 },
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
      const grid = base.encounter!.grid.map(() => ({ letter: 'e', lockedTurns: 5, venom: 0, gold: 0, cracked: 0 }));
      grid[13] = { letter: 'c', lockedTurns: 0, venom: 0, gold: 0, cracked: 0 };
      grid[14] = { letter: 'a', lockedTurns: 0, venom: 0, gold: 0, cracked: 0 };
      grid[15] = { letter: 't', lockedTurns: 0, venom: 0, gold: 0, cracked: 0 };
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

describe('mythic tier (PR #31 gate)', () => {
  it('reduceDamage floors at zero: Tardigrade on an even turn takes nothing and heals nothing', () => {
    // The adversarial round dropped the Math.max(0, ...) floor and every test stayed green while the
    // enemy's hit healed the player to full and damageTaken went negative. Before the mythics the
    // largest reduceDamage was 8, so the floor was dead code; with 999 it is the whole item.
    const s0 = newRun(7, ctx);
    if (s0.phase !== 'fight') throw new Error('expected a fight');
    const armoured: RunState = { ...s0, player: { ...s0.player, hp: 40, items: ['tardigrade'] } };
    const s1 = reduce(armoured, { type: 'shuffle' }, ctx); // turn 1: odd, the hit lands
    expect(s1.phase).toBe('fight');
    expect(s1.player.hp).toBeLessThan(40);
    const s2 = reduce(s1, { type: 'shuffle' }, ctx); // turn 2: even, 999 reduction, floored at 0
    expect(s2.phase).toBe('fight');
    expect(s2.player.hp).toBe(s1.player.hp);
    expect(s2.stats.damageTaken).toBe(s1.stats.damageTaken);
    expect(s2.lastTurn?.enemyDamage).toBe(0);
  });

  it('mythics can be offered: a pool of only mythics still fills a three-item offer', () => {
    // Binds RARITY_WEIGHT.mythic > 0: at weight 0 weightedPick throws on an all-mythic pool.
    const mythics = CONTENT.items.filter((i) => i.rarity === 'mythic');
    expect(mythics).toHaveLength(12);
    const onlyMythic: EngineContext = nodeContext({ ...FLAT, items: mythics, tuning: { ...CONTENT.tuning, startingPicks: 1 } });
    const s = newRun(3, onlyMythic);
    expect(s.phase).toBe('pick');
    expect(s.offer).toHaveLength(3);
    for (const id of s.offer ?? []) expect(mythics.map((m) => m.id)).toContain(id);
  });

  it('the content mirror of the rarity weights matches the engine constant', () => {
    expect(CONTENT_RARITY_WEIGHT).toEqual(RARITY_WEIGHT);
  });
});

describe('effects wave: nine verbs, the offer rule, free shuffles, onPick (save v3)', () => {
  /** A context with one extra test item on top of the shipped pool, starting in a fight. */
  function withItem(item: ItemDef, extra: Partial<Content> = {}): EngineContext {
    return nodeContext({ ...FLAT, ...extra, items: [...CONTENT.items, item], tuning: { ...CONTENT.tuning, startingPicks: 0, ...extra.tuning } });
  }
  function fightWith(seed: number, c: EngineContext, ids: string[]): RunState {
    const s = newRun(seed, c);
    if (s.phase !== 'fight') throw new Error('expected a fight');
    return { ...s, player: { ...s.player, items: ids } };
  }
  /** The amoeba attacks every turn for 6; a fixed enemy keeps the arithmetic readable. */
  function withEnemy(s: RunState, hp = 100000, damage = 6): RunState {
    const enc = s.encounter as Encounter;
    return { ...s, encounter: { ...enc, enemy: { id: 'amoeba', hp, maxHp: hp, damage, poison: 0, stunned: 0 } } };
  }
  function anyWord(s: RunState, c: EngineContext, minLen = 3): string {
    const w = candidateWords(s, c).find((x) => x.word.length >= minLen);
    if (!w) throw new Error('no word');
    return w.word;
  }

  it('poisonEnemy ticks at turn start for its value, then value-1, ..., capped by tuning.poisonMax', () => {
    const c = withItem({ id: 't-poison', name: 'P', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'poisonEnemy', value: 3 }] } });
    const s0 = withEnemy(fightWith(11, c, ['t-poison']));
    const s1 = play(s0, anyWord(s0, c), c);
    const e1 = (s1.encounter as Encounter).enemy;
    // The word poisoned for 3; the new turn's start ticked 3 and left 2.
    expect(s1.lastTurn?.poison).toBe(3);
    expect(e1.poison).toBe(2);
    expect(e1.hp).toBe(100000 - (s1.lastTurn?.damage ?? 0));
    expect(s1.lastTurn?.damage).toBeGreaterThan(3); // word damage plus the tick
    // Two words in a row: 3 + 3 = 6, capped at poisonMax.
    const capped = withItem({ id: 't-poison', name: 'P', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'poisonEnemy', value: 50 }] } });
    const p0 = withEnemy(fightWith(11, capped, ['t-poison']));
    const p1 = play(p0, anyWord(p0, capped), capped);
    expect(p1.lastTurn?.poison).toBe(CONTENT.tuning.poisonMax);
    expect((p1.encounter as Encounter).enemy.poison).toBe(CONTENT.tuning.poisonMax - 1);
  });

  it('poison that finishes the enemy ends the fight before venom bites', () => {
    const c = withItem({ id: 't-poison', name: 'P', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'poisonEnemy', value: 5 }] } });
    const s0 = withEnemy(fightWith(11, c, ['t-poison']), 1000, 6);
    const grid = (s0.encounter as Encounter).grid.map((t, i) => (i === 15 ? { ...t, venom: 50 } : t));
    const armed: RunState = { ...s0, player: { ...s0.player, hp: 30 }, encounter: { ...(s0.encounter as Encounter), grid, enemy: { ...(s0.encounter as Encounter).enemy, hp: 5 + 4 } } };
    // Play a word whose damage + poison (5) kills 9 HP: any word deals >= 4? Force the enemy to exactly what poison alone finishes.
    const word = anyWord(armed, c);
    const dmg = candidateWords(armed, c).find((x) => x.word === word)?.damage ?? 0;
    const exact: RunState = { ...armed, encounter: { ...(armed.encounter as Encounter), enemy: { ...(armed.encounter as Encounter).enemy, hp: dmg + 5 } } };
    const s1 = play(exact, word, c);
    expect(s1.phase).toBe('pick'); // enemy dead, offer made
    expect(s1.player.hp).toBe(30 - 6); // took the attack, never the 50 venom
  });

  it('stun skips the next attacks but not the special; each attack turn consumes one', () => {
    const c = withItem({ id: 't-stun', name: 'S', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'stun', value: 2 }] } });
    const s0 = withEnemy(fightWith(12, c, ['t-stun']));
    const s1 = play(s0, anyWord(s0, c), c);
    expect(s1.lastTurn?.stunned).toBe(true);
    expect(s1.lastTurn?.enemyDamage).toBe(0);
    expect(s1.player.hp).toBe(100 - (s1.lastTurn?.venom ?? 0));
    expect((s1.encounter as Encounter).enemy.stunned).toBe(1); // +2 from the word, 1 consumed by the skipped attack
    const s2 = reduce(s1, { type: 'shuffle' }, c); // a costed shuffle: attack turn, no word, no new stun
    expect(s2.lastTurn?.stunned).toBe(true);
    expect((s2.encounter as Encounter).enemy.stunned).toBe(0);
    const s3 = reduce(s2, { type: 'shuffle' }, c);
    expect(s3.lastTurn?.stunned).toBe(false);
    expect(s3.lastTurn?.enemyDamage).toBe(6);
  });

  it('stun leaves the boss special firing', () => {
    const c = withItem({ id: 't-stun', name: 'S', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'stun', value: 9 }] } });
    const s0 = fightWith(12, c, ['t-stun']);
    const boss = CONTENT.bosses[0] as EnemyDef;
    const enc = s0.encounter as Encounter;
    const every = boss.special?.every ?? 3;
    const armed: RunState = { ...s0, encounter: { ...enc, turn: every, enemy: { id: boss.id, hp: 100000, maxHp: 100000, damage: 1, poison: 0, stunned: 5 } } };
    const s1 = play(armed, anyWord(armed, c), c);
    expect(s1.lastTurn?.stunned).toBe(true);
    const lockOrVenom = (s1.encounter as Encounter).grid.some((t) => t.lockedTurns > 0 || t.venom > 0);
    expect(lockOrVenom).toBe(true);
  });

  it('shield absorbs after reduction, persists across turns, and is capped by tuning.shieldMax', () => {
    const c = withItem({ id: 't-shield', name: 'Sh', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'shield', value: 10 }], onDamageTaken: [{ type: 'reduceDamage', value: 2 }] } });
    const s0 = withEnemy(fightWith(13, c, ['t-shield']));
    const s1 = play(s0, anyWord(s0, c), c);
    // Word gave 10 shield; attack 6 reduced to 4; the shield took all 4.
    expect(s1.lastTurn?.shielded).toBe(4);
    expect(s1.lastTurn?.enemyDamage).toBe(0);
    expect(s1.player.shield).toBe(6);
    expect(s1.player.hp).toBe(100 - (s1.lastTurn?.venom ?? 0));
    // Shield caps: 6 + 10 = 16, then again... push it past the cap with a big value.
    const big = withItem({ id: 't-shield', name: 'Sh', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'shield', value: 999 }] } });
    const b0 = withEnemy(fightWith(13, big, ['t-shield']));
    const b1 = play(b0, anyWord(b0, big), big);
    expect(b1.player.shield).toBe(CONTENT.tuning.shieldMax - 6);
    expect(b1.lastTurn?.shielded).toBe(6);
    expect(b1.stats.damageTaken).toBe(0);
  });

  it('shield survives an encounter end', () => {
    const c = withItem({ id: 't-shield', name: 'Sh', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'shield', value: 10 }] } });
    const s0 = withEnemy(fightWith(13, c, ['t-shield']), 1, 6);
    const s1 = play(s0, anyWord(s0, c), c);
    expect(s1.phase).toBe('pick');
    expect(s1.player.shield).toBe(10);
  });

  it('the reducer passes tuning.perUnitMultCap into the context (gate M30)', () => {
    const scaler: ItemDef = { id: 't-cap', name: 'C', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'perUnit', unit: 'item', then: [{ type: 'addMult', value: 2 }] }] } };
    const tight = withItem(scaler, { tuning: { ...CONTENT.tuning, startingPicks: 0, perUnitMultCap: 0.4 } });
    const s0 = withEnemy(fightWith(26, tight, ['t-cap']));
    const word = anyWord(s0, tight, 4);
    const s1 = play(s0, word, tight);
    // With the cap at 0.4 the multiplier is 1.4, never the 3 the item asks for.
    expect(s1.lastTurn?.mult).toBe(1.4);
    expect(s1.lastTurn?.damage).toBe(Math.floor((s1.lastTurn?.base ?? 0) * 1.4));
  });

  it('lifesteal heals from the damage actually dealt, not the word score (gate M43)', () => {
    const c = withItem({ id: 't-leech', name: 'L', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'lifesteal', fraction: 1 }] } });
    const s0 = withEnemy(fightWith(14, c, ['t-leech']), 3, 6);
    const hurt: RunState = { ...s0, player: { ...s0.player, hp: 40 } };
    const s1 = play(hurt, anyWord(hurt, c, 5), c);
    expect(s1.phase).toBe('pick');
    expect(s1.lastTurn?.healed).toBe(3);
    expect(s1.player.hp).toBe(43);
  });

  it('lifesteal heals a floored fraction of the word damage', () => {
    const c = withItem({ id: 't-leech', name: 'L', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'lifesteal', fraction: 0.5 }] } });
    const s0 = withEnemy(fightWith(14, c, ['t-leech']));
    const hurt: RunState = { ...s0, player: { ...s0.player, hp: 40 } };
    const word = anyWord(hurt, c, 5);
    const dmg = candidateWords(hurt, c).find((x) => x.word === word)?.damage ?? 0;
    const s1 = play(hurt, word, c);
    expect(s1.lastTurn?.healed).toBe(Math.floor(dmg * 0.5));
    expect(s1.player.hp).toBe(40 + Math.floor(dmg * 0.5) - 6 - (s1.lastTurn?.venom ?? 0));
  });

  it('maxHp raises the ceiling and heals the same amount; a negative value never drops max below 1', () => {
    const c = withItem({ id: 't-grow', name: 'G', rarity: 'common', description: '', flavor: '', hooks: { onEncounterEnd: [{ type: 'maxHp', value: 15 }] } });
    const s0 = withEnemy(fightWith(15, c, ['t-grow']), 1, 6);
    const hurt: RunState = { ...s0, player: { ...s0.player, hp: 50 } };
    const s1 = play(hurt, anyWord(hurt, c), c);
    expect(s1.player.maxHp).toBe(115);
    expect(s1.player.hp).toBe(65);
    const shrink = withItem({ id: 't-grow', name: 'G', rarity: 'common', description: '', flavor: '', hooks: { onEncounterEnd: [{ type: 'maxHp', value: -500 }] } });
    const k0 = withEnemy(fightWith(15, shrink, ['t-grow']), 1, 6);
    const k1 = play(k0, anyWord(k0, shrink), shrink);
    expect(k1.player.maxHp).toBe(1);
    expect(k1.player.hp).toBe(1);
  });

  it('a free shuffle redraws without an enemy turn, a turn advance, a venom bite or a turn count', () => {
    const c = withItem({ id: 't-free', name: 'F', rarity: 'common', description: '', flavor: '', hooks: { onPick: [{ type: 'freeShuffle', value: 2 }] } });
    const s0 = withEnemy(fightWith(16, c, []));
    const charged: RunState = { ...s0, player: { ...s0.player, freeShuffles: 1 } };
    const enc0 = charged.encounter as Encounter;
    const s1 = reduce(charged, { type: 'shuffle' }, c);
    const enc1 = s1.encounter as Encounter;
    expect(s1.player.freeShuffles).toBe(0);
    expect(enc1.turn).toBe(enc0.turn);
    expect(s1.stats.turns).toBe(charged.stats.turns);
    expect(s1.player.hp).toBe(charged.player.hp);
    expect(enc1.enemy.hp).toBe(enc0.enemy.hp);
    expect(enc1.grid).not.toEqual(enc0.grid);
    expect(s1.lastTurn).toMatchObject({ scrambled: true, damage: 0, enemyDamage: 0 });
    expect(s1.rng.counter).toBeGreaterThan(charged.rng.counter);
    // With no charge left the next shuffle costs the turn as before.
    const s2 = reduce(s1, { type: 'shuffle' }, c);
    expect((s2.encounter as Encounter).turn).toBe(enc0.turn + 1);
    expect(s2.player.hp).toBe(charged.player.hp - 6 - (s2.lastTurn?.venom ?? 0));
  });

  it('onPick fires once for the picked item: freeShuffle, maxHp and shield land, enemy verbs are no-ops', () => {
    const kit: ItemDef = {
      id: 't-kit',
      name: 'K',
      rarity: 'common',
      description: '',
      flavor: '',
      hooks: { onPick: [{ type: 'freeShuffle', value: 2 }, { type: 'maxHp', value: 10 }, { type: 'shield', value: 5 }, { type: 'poisonEnemy', value: 9 }, { type: 'stun', value: 9 }] },
    };
    const c = nodeContext({ ...FLAT, items: [kit], tuning: { ...CONTENT.tuning, startingPicks: 1 } });
    const s0 = newRun(17, c);
    expect(s0.phase).toBe('pick');
    expect(s0.offer).toEqual(['t-kit']);
    const s1 = reduce(s0, { type: 'pickItem', index: 0 }, c);
    expect(s1.phase).toBe('fight');
    expect(s1.player.freeShuffles).toBe(2);
    expect(s1.player.maxHp).toBe(110);
    expect(s1.player.hp).toBe(110);
    expect(s1.player.shield).toBe(5);
    expect((s1.encounter as Encounter).enemy.poison).toBe(0);
    expect((s1.encounter as Encounter).enemy.stunned).toBe(0);
  });

  it('redrawTiles redraws that many unlocked, unselected tiles in place, reports them, and spends RNG for the draw', () => {
    const c = withItem({ id: 't-redraw', name: 'R', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'redrawTiles', count: 3 }] } });
    const s0 = withEnemy(fightWith(18, c, ['t-redraw']));
    const word = anyWord(s0, c);
    const s1 = play(s0, word, c);
    expect(s1.lastTurn?.redrawn).toHaveLength(3);
    const played = new Set(s1.lastTurn?.used);
    for (const i of s1.lastTurn?.redrawn ?? []) expect(played.has(i)).toBe(false);
    expect(new Set(s1.lastTurn?.redrawn).size).toBe(3);
    // Gate W2: the same word without the item spends RNG only on the end-of-turn refill; the redraw
    // adds three index picks AND three letter draws, all of which must reach the returned rng.
    const plain = play({ ...s0, player: { ...s0.player, items: [] } }, word, c);
    expect(s1.rng.counter - s0.rng.counter).toBeGreaterThanOrEqual(plain.rng.counter - s0.rng.counter + 6);
  });

  it('a free shuffle onto a dead grid scrambles and spends the scramble RNG (gate W2)', () => {
    const c = withItem({ id: 't-free', name: 'F', rarity: 'common', description: '', flavor: '', hooks: { onPick: [{ type: 'freeShuffle', value: 2 }] } });
    const s0 = withEnemy(fightWith(16, c, []));
    const charged: RunState = { ...s0, player: { ...s0.player, freeShuffles: 1 } };
    const plain = reduce(charged, { type: 'shuffle' }, c);
    let calls = 0;
    const dead: EngineContext = { ...c, solver: { ...c.solver, solve: (letters) => (calls++ === 0 ? [] : c.solver.solve(letters)) } };
    const s1 = reduce(charged, { type: 'shuffle' }, dead);
    expect(s1.phase).toBe('fight');
    expect(s1.lastTurn?.used).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(s1.rng.counter).toBeGreaterThan(plain.rng.counter);
    expect(s1.player.freeShuffles).toBe(0);
    expect((s1.encounter as Encounter).turn).toBe((charged.encounter as Encounter).turn);
  });

  it('a stun survives a non-attack turn and is spent on the attack turn (gate W3, attackEvery 2)', () => {
    const c = withItem({ id: 't-stun', name: 'S', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'stun', value: 1 }] } });
    const s0 = fightWith(12, c, []);
    const enc = s0.encounter as Encounter;
    const flag = CONTENT.enemies.find((e) => e.id === 'flagellate') as EnemyDef;
    expect(flag.attackEvery).toBe(2);
    const armed: RunState = { ...s0, encounter: { ...enc, turn: 1, enemy: { id: 'flagellate', hp: 100000, maxHp: 100000, damage: 9, poison: 0, stunned: 1 } } };
    const s1 = reduce(armed, { type: 'shuffle' }, c); // turn 1: no attack, the stun must survive
    expect(s1.lastTurn?.stunned).toBe(false);
    expect((s1.encounter as Encounter).enemy.stunned).toBe(1);
    const s2 = reduce(s1, { type: 'shuffle' }, c); // turn 2: the attack is skipped
    expect(s2.lastTurn?.stunned).toBe(true);
    expect(s2.lastTurn?.enemyDamage).toBe(0);
    expect((s2.encounter as Encounter).enemy.stunned).toBe(0);
    const s3 = reduce(s2, { type: 'shuffle' }, c); // turn 3: no attack
    const s4 = reduce(s3, { type: 'shuffle' }, c); // turn 4: the hit lands
    expect(s4.lastTurn?.enemyDamage).toBe(9);
  });

  it('under a stun the onDamageTaken hook does not fire (gate S3)', () => {
    const c = withItem({ id: 't-onhit', name: 'H', rarity: 'common', description: '', flavor: '', hooks: { onDamageTaken: [{ type: 'heal', value: 5 }, { type: 'shield', value: 5 }] } });
    const s0 = withEnemy(fightWith(12, c, ['t-onhit']));
    const enc = s0.encounter as Encounter;
    const stunned: RunState = { ...s0, player: { ...s0.player, hp: 50 }, encounter: { ...enc, enemy: { ...enc.enemy, stunned: 1 } } };
    const s1 = reduce(stunned, { type: 'shuffle' }, c);
    expect(s1.lastTurn?.stunned).toBe(true);
    expect(s1.lastTurn?.healed).toBe(0);
    expect(s1.player.shield).toBe(0);
    const s2 = reduce(s1, { type: 'shuffle' }, c);
    expect(s2.lastTurn?.healed).toBe(5);
    expect(s2.player.shield).toBe(5);
  });

  it('the preview agrees with the hit for an item whose only effect is a perUnit (gate W4)', () => {
    const c = withItem({ id: 't-pure', name: 'Pu', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'perUnit', unit: 'letter', then: [{ type: 'addFlat', value: 3 }] }] } });
    for (const seed of [21, 22, 23]) {
      const s0 = withEnemy(fightWith(seed, c, ['t-pure']));
      const word = anyWord(s0, c, 5);
      const preview = candidateWords(s0, c).find((x) => x.word === word)?.damage ?? -1;
      const bare = candidateWords({ ...s0, player: { ...s0.player, items: [] } }, c).find((x) => x.word === word)?.damage ?? -1;
      expect(preview).toBe(bare + 3 * word.length);
      const s1 = play(s0, word, c);
      expect(s1.lastTurn?.damage).toBe(preview);
    }
  });

  it('conditionCtx wires items, venomed tiles and locked tiles into perUnit (gate W5)', () => {
    const blank = (id: string): ItemDef => ({ id, name: id, rarity: 'common', description: '', flavor: '', hooks: {} });
    const perItem: ItemDef = { id: 't-per-item', name: 'I', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'perUnit', unit: 'item', then: [{ type: 'addFlat', value: 1 }] }] } };
    const perLock: ItemDef = { id: 't-per-lock', name: 'L', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'perUnit', unit: 'lockedTile', then: [{ type: 'addFlat', value: 5 }] }] } };
    const perVenom: ItemDef = { id: 't-per-venom', name: 'V', rarity: 'common', description: '', flavor: '', hooks: { onTurnStart: [{ type: 'perUnit', unit: 'venomedTile', then: [{ type: 'heal', value: 2 }] }] } };
    const c = nodeContext({ ...FLAT, items: [...CONTENT.items, blank('b1'), blank('b2'), perItem, perLock, perVenom], tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    // items: one scaler alone, then with two blanks: +2 more damage on the same word.
    const s0 = withEnemy(fightWith(24, c, ['t-per-item']));
    const word = anyWord(s0, c);
    const one = play(s0, word, c).lastTurn?.damage ?? 0;
    const three = play({ ...s0, player: { ...s0.player, items: ['t-per-item', 'b1', 'b2'] } }, word, c).lastTurn?.damage ?? 0;
    expect(three).toBe(one + 2);
    // locked tiles: lock two tiles the word does not use.
    const l0 = withEnemy(fightWith(24, c, ['t-per-lock']));
    const lw = anyWord(l0, c);
    const usedIdx = new Set(tilesForWord(lw, (l0.encounter as Encounter).grid.map((t) => t.letter), (l0.encounter as Encounter).grid.map((_, i) => i)) ?? []);
    const free = (l0.encounter as Encounter).grid.map((_, i) => i).filter((i) => !usedIdx.has(i)).slice(0, 2);
    const lockedGrid = (l0.encounter as Encounter).grid.map((t, i) => (free.includes(i) ? { ...t, lockedTurns: 3 } : t));
    const noLock = play(l0, lw, c).lastTurn?.damage ?? 0;
    const twoLocks = play({ ...l0, encounter: { ...(l0.encounter as Encounter), grid: lockedGrid } }, lw, c).lastTurn?.damage ?? 0;
    expect(twoLocks).toBe(noLock + 10);
    // venomed tiles: two venomed tiles the word does not use survive to the next turn start and heal 4.
    const v0 = withEnemy(fightWith(24, c, ['t-per-venom']));
    const vw = anyWord(v0, c);
    const vUsed = new Set(tilesForWord(vw, (v0.encounter as Encounter).grid.map((t) => t.letter), (v0.encounter as Encounter).grid.map((_, i) => i)) ?? []);
    const vFree = (v0.encounter as Encounter).grid.map((_, i) => i).filter((i) => !vUsed.has(i)).slice(0, 2);
    const venomGrid = (v0.encounter as Encounter).grid.map((t, i) => (vFree.includes(i) ? { ...t, venom: 1 } : t));
    const hurt: RunState = { ...v0, player: { ...v0.player, hp: 50 }, encounter: { ...(v0.encounter as Encounter), grid: venomGrid } };
    const v1 = play(hurt, vw, c);
    // Gravity may move the venomed tiles but never removes them; the count at turn start is still 2.
    expect((v1.encounter as Encounter).grid.filter((t) => t.venom > 0)).toHaveLength(2);
    expect(v1.lastTurn?.healed).toBe(4);
  });

  it('onPick fires for the item just picked, not the first item owned (gate W6)', () => {
    const quiet: ItemDef = { id: 't-quiet', name: 'Q', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'addFlat', value: 1 }] } };
    const grow: ItemDef = { id: 't-grow2', name: 'G', rarity: 'common', description: '', flavor: '', hooks: { onPick: [{ type: 'maxHp', value: 10 }] } };
    const c = nodeContext({ ...FLAT, items: [quiet, grow], tuning: { ...CONTENT.tuning, startingPicks: 2 } });
    const s0 = newRun(25, c);
    expect(s0.phase).toBe('pick');
    const quietFirst = s0.offer?.indexOf('t-quiet') ?? -1;
    const s1 = reduce(s0, { type: 'pickItem', index: quietFirst }, c);
    expect(s1.player.items).toEqual(['t-quiet']);
    expect(s1.player.maxHp).toBe(100);
    expect(s1.phase).toBe('pick');
    expect(s1.offer).toEqual(['t-grow2']);
    const s2 = reduce(s1, { type: 'pickItem', index: 0 }, c);
    expect(s2.player.items).toEqual(['t-quiet', 't-grow2']);
    expect(s2.player.maxHp).toBe(110);
  });

  it('letterWeight biases the draw for its letters exactly as refill would; vowelWeight still stacks', () => {
    const c = withItem({ id: 't-bias', name: 'B', rarity: 'common', description: '', flavor: '', hooks: { onTileDraw: [{ type: 'letterWeight', letters: 'qz', value: 40 }, { type: 'vowelWeight', value: 2 }] } });
    const s0 = fightWith(19, c, ['t-bias']);
    const enc = s0.encounter as Encounter;
    const all = enc.grid.map((_, i) => i);
    const bias = { q: 40, z: 40, a: 2, e: 2, i: 2, o: 2, u: 2 };
    const [expected] = refill(s0.rng, enc.grid, all, bias);
    const [plain] = refill(s0.rng, enc.grid, all, 1);
    const s1 = reduce(s0, { type: 'shuffle' }, c);
    if (s1.phase !== 'fight') return;
    expect((s1.encounter as Encounter).grid).toEqual(expected);
    expect(expected).not.toEqual(plain);
    expect(expected.filter((t) => 'qz'.includes(t.letter)).length).toBeGreaterThan(3);
  });

  it('an offer never holds three commons while a non-common is left in the pool', () => {
    let three = 0;
    let offers = 0;
    for (let seed = 0; seed < 10; seed++) {
      const { states } = greedyRun(seed);
      for (const st of states) {
        if (st.phase !== 'pick' || !st.offer) continue;
        offers++;
        const commons = st.offer.filter((id) => CONTENT.items.find((i) => i.id === id)?.rarity === 'common').length;
        expect(commons).toBeLessThanOrEqual(MAX_COMMONS_PER_OFFER);
        if (commons === 3) three++;
      }
    }
    expect(offers).toBeGreaterThan(30);
    expect(three).toBe(0);
    // An all-common pool still fills the offer: the rule yields when nothing else is left.
    const commonsOnly = nodeContext({ ...FLAT, items: CONTENT.items.filter((i) => i.rarity === 'common'), tuning: { ...CONTENT.tuning, startingPicks: 1 } });
    expect(newRun(1, commonsOnly).offer).toHaveLength(3);
  }, 20000);

  it('the preview (candidateWords) agrees with the hit for perUnit and fight-state conditions', () => {
    const c = withItem({
      id: 't-scaler',
      name: 'Sc',
      rarity: 'common',
      description: '',
      flavor: '',
      hooks: { onWordScored: [{ type: 'perUnit', unit: 'letter', then: [{ type: 'addFlat', value: 2 }] }, { type: 'condition', when: { kind: 'enemyHpBelow', fraction: 0.5 }, then: [{ type: 'addMult', value: 1 }] }] },
    });
    for (const hp of [100000, 10]) {
      const s0 = withEnemy(fightWith(20, c, ['t-scaler']), hp);
      const low: RunState = { ...s0, encounter: { ...(s0.encounter as Encounter), enemy: { ...(s0.encounter as Encounter).enemy, maxHp: 100000 } } };
      const word = anyWord(low, c, 5);
      const preview = candidateWords(low, c).find((x) => x.word === word)?.damage ?? -1;
      const s1 = play(low, word, c);
      expect(Math.min(preview, hp)).toBe(s1.lastTurn?.damage);
      if (hp === 10) expect(s1.phase).toBe('pick');
    }
  });

  it('new state is JSON-plain and replays byte-identical with every new verb in play', () => {
    const everything: ItemDef = {
      id: 't-all',
      name: 'All',
      rarity: 'mythic',
      description: '',
      flavor: '',
      hooks: {
        onPick: [{ type: 'freeShuffle', value: 1 }, { type: 'maxHp', value: 5 }],
        onWordScored: [{ type: 'poisonEnemy', value: 2 }, { type: 'stun', value: 1 }, { type: 'shield', value: 3 }, { type: 'lifesteal', fraction: 0.25 }, { type: 'redrawTiles', count: 1 }],
        onTileDraw: [{ type: 'letterWeight', letters: 'st', value: 2 }],
        onTurnStart: [{ type: 'perUnit', unit: 'venomedTile', then: [{ type: 'damageEnemy', value: 2 }] }],
      },
    };
    const c = nodeContext({ ...FLAT, items: [everything, ...CONTENT.items], tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    for (const seed of [1, 2, 3]) {
      const a = greedyRun(seed, c, 0);
      const b = greedyRun(seed, c, 0);
      expect(JSON.stringify(a.final)).toBe(JSON.stringify(b.final));
      expect(JSON.parse(JSON.stringify(a.final))).toEqual(a.final);
      expect(a.final.v).toBe(10);
    }
  });
});

describe('variety wave step 1: act pools, damage ranges, armour, regen, hunger', () => {
  const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
  function fight(seed: number, c: EngineContext = flat, over: Partial<{ id: string; hp: number; damage: number }> = {}): RunState {
    const s = newRun(seed, c);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    const id = over.id ?? enc.enemy.id;
    return { ...s, encounter: { ...enc, enemy: { ...enc.enemy, id, hp: over.hp ?? 100000, maxHp: over.hp ?? 100000, damage: over.damage ?? enc.enemy.damage } } };
  }

  it('hitRange is inclusive, symmetric and floored at zero', () => {
    expect(hitRange(6, 0.3)).toEqual([4, 8]);
    expect(hitRange(6, 0)).toEqual([6, 6]);
    expect(hitRange(1, 0.5)).toEqual([1, 2]);
    expect(hitRange(0, 0.5)).toEqual([0, 0]);
  });

  it('each encounter draws its enemy from the act pool, bosses from the boss of that act', () => {
    for (let seed = 0; seed < 8; seed++) {
      const { states } = greedyRun(seed);
      for (const st of states) {
        if (!st.encounter) continue;
        const def = CONTENT.encounters[st.encounterIndex];
        const pool = def?.boss ? CONTENT.bosses : CONTENT.enemies;
        const e = pool.find((x) => x.id === st.encounter?.enemy.id);
        expect(e, st.encounter.enemy.id).toBeDefined();
        // An elite slot (step 2) draws from the next act; in act 3 from act 3, scaled.
        const elite = !def?.boss && kindAt(st, st.encounterIndex) === 'elite';
        expect(e?.act).toBe(elite ? Math.min(3, (def?.act ?? 1) + 1) : def?.act);
      }
    }
  }, 30000);

  it('a hit rolls inside the range from the run RNG, reaches both ends, and the roll is one threaded draw (replay identical)', () => {
    const real = nodeContext({ ...REAL_ROLLS, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    const seen = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      let s = newRun(seed, real);
      if (s.phase !== 'fight') continue;
      const enc = s.encounter as Encounter;
      s = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000, damage: 6 } } };
      const a = reduce(s, { type: 'shuffle' }, real);
      const b = reduce(s, { type: 'shuffle' }, real);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const hit = a.lastTurn?.enemyDamage ?? -1;
      expect(hit).toBeGreaterThanOrEqual(4);
      expect(hit).toBeLessThanOrEqual(8);
      seen.add(hit);
      // The roll is exactly one draw on top of what a flat hit spends (gate M2: a dropped RNG
      // would replay the next draw). Same state, same shuffle, variance 0 versus 0.3.
      const flatTurn = reduce(s, { type: 'shuffle' }, flat);
      expect(a.rng.counter - flatTurn.rng.counter).toBe(1);
    }
    // Both ends of the intent line land (gate M11: an off-by-one range never rolls the top).
    expect(seen.has(4)).toBe(true);
    expect(seen.has(8)).toBe(true);
  });

  it('hunger does not grow at the encounter start: the first hit is the base damage times the curve (gate M5)', () => {
    // Every act-1 enemy made hungry and hitting every turn, so whichever the seed draws is under test.
    const hungry = nodeContext({ ...flat.content, enemies: CONTENT.enemies.map((e) => ({ ...e, variance: 0, attackEvery: 1, traits: { ...e.traits, hunger: 2 } })) });
    for (let seed = 0; seed < 6; seed++) {
      const s = newRun(seed, hungry);
      if (s.phase !== 'fight') throw new Error('fight');
      const enc = s.encounter as Encounter;
      const def = CONTENT.enemies.find((e) => e.id === enc.enemy.id);
      const slot = CONTENT.encounters[0];
      if (!def || !slot) throw new Error('def');
      expect(enc.turn).toBe(1);
      expect(enc.enemy.damage).toBe(Math.round(def.damage * slot.damageScale));
      const s1 = reduce(s, { type: 'shuffle' }, hungry);
      expect(s1.lastTurn?.enemyDamage).toBe(enc.enemy.damage); // turn 1 lands at the base
      expect((s1.encounter as Encounter).enemy.damage).toBe(enc.enemy.damage + 2); // then the tick for turn 2
    }
  });

  it('armour halves words shorter than it, floored, and the preview says what lands; a word of exactly the armour length is not halved', () => {
    const s = fight(3, flat, { id: 'diatom-swarm' }); // armour 4
    const cands = candidateWords(s, flat);
    const short = cands.find((c) => c.word.length === 3);
    const edge = cands.find((c) => c.word.length === 4);
    if (!short || !edge) throw new Error('seed 3 lost its 3- and 4-letter words');
    // The preview is already halved (gate W1); the raw score is what the item-free formula gives.
    const raw = (w: string) => scoreWord(w, [], flat.content.tuning).damage;
    expect(short.damage).toBe(Math.floor(raw(short.word) / 2));
    expect(edge.damage).toBe(raw(edge.word)); // gate M9: `<` not `<=`
    const a = play(s, short.word, flat);
    expect(a.lastTurn?.damage).toBe(short.damage);
    expect(a.stats.damageDealt).toBe(short.damage);
    expect(a.stats.bestWordDamage).toBe(raw(short.word)); // the stat records the word's own score, as with overkill
    const b = play(s, edge.word, flat);
    expect(b.lastTurn?.damage).toBe(edge.damage);
    // Off the armoured enemy the same grid previews the raw score.
    const bare = fight(3, flat, { id: 'amoeba' });
    expect(candidateWords(bare, flat).find((c) => c.word === short.word)?.damage).toBe(raw(short.word));
  });

  it('regen heals the enemy at its turn start, never above max; hunger grows its damage every turn', () => {
    const r = fight(4, flat, { id: 'rotifer', hp: 50 }); // regen 2
    const hurt: RunState = { ...r, encounter: { ...(r.encounter as Encounter), enemy: { ...(r.encounter as Encounter).enemy, hp: 40 } } };
    const r1 = reduce(hurt, { type: 'shuffle' }, flat);
    expect((r1.encounter as Encounter).enemy.hp).toBe(42);
    const full = reduce(r, { type: 'shuffle' }, flat);
    expect((full.encounter as Encounter).enemy.hp).toBe(50);
    const h = fight(5, flat, { id: 'lamprey', damage: 10 }); // hunger 2
    const h1 = reduce(h, { type: 'shuffle' }, flat);
    expect((h1.encounter as Encounter).enemy.damage).toBe(12);
    expect(h1.lastTurn?.enemyDamage).toBe(10); // the hit lands at the pre-growth damage
    const h2 = reduce(h1, { type: 'shuffle' }, flat);
    expect((h2.encounter as Encounter).enemy.damage).toBe(14);
    expect(h2.lastTurn?.enemyDamage).toBe(12);
  });

  it('the traits tick runs before poison (regen can out-heal it) and after the onTurnStart death check (a killed enemy stays dead)', () => {
    // Siphonophore (regen 3) at 1 HP with poison 3: regen first leaves it at 1 HP, poison 2, alive.
    // Poison first would kill it. Pinned (gate M17); flipping it is Dean's call.
    const s = fight(7, flat, { id: 'siphonophore', hp: 80 });
    const enc = s.encounter as Encounter;
    const low: RunState = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, hp: 1, poison: 3 } } };
    const t = reduce(low, { type: 'shuffle' }, flat);
    expect(t.phase).toBe('fight');
    expect((t.encounter as Encounter).enemy).toMatchObject({ hp: 1, poison: 2 });
    expect(t.lastTurn?.poison).toBe(3);
    // Spore Cloud deals 3 at turn start; a regenerating enemy at 3 HP dies to it and does not
    // regen back (gate M18: the tick must sit after that death check).
    const armed: RunState = { ...s, player: { ...s.player, items: ['spore-cloud'] }, encounter: { ...enc, enemy: { ...enc.enemy, hp: 3 } } };
    const k = reduce(armed, { type: 'shuffle' }, flat);
    expect(k.phase).not.toBe('fight');
    expect(k.encounter).toBeNull();
  });
});

describe('challenge wave: resist (a word failing the enemy demand deals only a fraction)', () => {
  const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
  // A context in which the drawn act-1 enemy carries a resist demand (and optional extra armour), so
  // whichever the seed rolls is under test. No shipped enemy sets resist; these are test fixtures only.
  const resistCtx = (resist: { when: Condition; factor: number }, armour?: number) =>
    nodeContext({
      ...flat.content,
      enemies: flat.content.enemies.map((e) => ({ ...e, traits: { ...e.traits, ...(armour !== undefined ? { armour } : {}), resist } })),
    });
  const wctx = (word: string, turn = 1): ConditionContext => ({ word, hp: 100, maxHp: 100, turn });

  it('resistHit takes only `factor` of the damage (floored) when the word fails the demand, full when it passes, and is a no-op with no resist', () => {
    // minLength 5: "cat" fails, "cakes" passes. factor 0.5, damage 7 -> floor(3.5) = 3.
    const r = { when: { kind: 'minLength', value: 5 } as const, factor: 0.5 };
    expect(resistHit(7, r, wctx('cat'))).toBe(3);
    expect(resistHit(7, r, wctx('cakes'))).toBe(7);
    expect(resistHit(7, undefined, wctx('cat'))).toBe(7); // no resist: unchanged (the shipped path)
    // The floor bites: factor 0.5 on an odd number rounds down, never up.
    expect(resistHit(9, r, wctx('cat'))).toBe(4);
    // A harsher factor and a different pass/fail word.
    const r2 = { when: { kind: 'minLength', value: 5 } as const, factor: 0.25 };
    expect(resistHit(10, r2, wctx('cat'))).toBe(2); // floor(2.5)
  });

  it('every word-shaped Condition kind works as a resist demand (containsLetter, uniqueLetters, minVowels, repeatLetter)', () => {
    const contains = { when: { kind: 'containsLetter', letters: 'z' } as const, factor: 0.5 };
    expect(resistHit(8, contains, wctx('zebra'))).toBe(8); // has z: passes
    expect(resistHit(8, contains, wctx('cat'))).toBe(4); // no z: resisted
    const unique = { when: { kind: 'uniqueLetters' } as const, factor: 0.5 };
    expect(resistHit(8, unique, wctx('cats'))).toBe(8); // all distinct: passes
    expect(resistHit(8, unique, wctx('book'))).toBe(4); // repeats o: resisted
    const vowels = { when: { kind: 'minVowels', value: 3 } as const, factor: 0.5 };
    expect(resistHit(8, vowels, wctx('audio'))).toBe(8); // a,u,i,o: passes
    expect(resistHit(8, vowels, wctx('cat'))).toBe(4); // one vowel: resisted
    const repeat = { when: { kind: 'repeatLetter' } as const, factor: 0.5 };
    expect(resistHit(8, repeat, wctx('book'))).toBe(8); // has a pair: passes
    expect(resistHit(8, repeat, wctx('cats'))).toBe(4); // all distinct: resisted
  });

  it('the landed hit and both previews (scoreSelection, candidateWords) all apply the same resist: fail is floored, pass is full', () => {
    const rc = resistCtx({ when: { kind: 'minLength', value: 5 }, factor: 0.5 });
    // Find a seed whose first fight offers both a failing (len < 5) and a passing (len >= 5) word.
    let picked: { s: RunState; fail: string; pass: string } | null = null;
    for (let seed = 0; seed < 40 && !picked; seed++) {
      const s = newRun(seed, rc);
      if (s.phase !== 'fight') continue;
      const enc = s.encounter as Encounter;
      const armoured: RunState = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000 } } }; // amoeba: resist only, no native armour
      const cands = candidateWords(armoured, rc);
      const fail = cands.find((c) => c.word.length < 5);
      const pass = cands.find((c) => c.word.length >= 5);
      if (fail && pass) picked = { s: armoured, fail: fail.word, pass: pass.word };
    }
    if (!picked) throw new Error('no seed under 40 offered both a short and a long word');
    const raw = (w: string) => scoreWord(w, [], rc.content.tuning).damage;
    // Preview via candidateWords.
    const cands = candidateWords(picked.s, rc);
    expect(cands.find((c) => c.word === picked.fail)?.damage).toBe(Math.floor(raw(picked.fail) * 0.5));
    expect(cands.find((c) => c.word === picked.pass)?.damage).toBe(raw(picked.pass));
    // Preview via scoreSelection AND the landed hit, for both words.
    for (const [word, expected] of [
      [picked.fail, Math.floor(raw(picked.fail) * 0.5)],
      [picked.pass, raw(picked.pass)],
    ] as const) {
      const idx = tilesForWord(word, picked.s.encounter!.grid.map((t) => t.letter), picked.s.encounter!.grid.map((_, i) => i));
      if (!idx) throw new Error(`cannot spell ${word}`);
      let sel = picked.s;
      for (const i of idx) sel = reduce(sel, { type: 'toggleTile', index: i }, rc);
      expect(scoreSelection(sel, rc), `preview ${word}`).toBe(expected);
      const landed = reduce(sel, { type: 'submitWord' }, rc);
      expect(landed.lastTurn?.damage, `landed ${word}`).toBe(expected);
    }
  });

  it('resist and armour stack: armour halves first (floored), then resist takes its fraction (floored)', () => {
    // A 3-letter word into armour 4 + resist minLength 5 factor 0.5. raw -> floor(raw/2) -> floor(that*0.5).
    const rc = resistCtx({ when: { kind: 'minLength', value: 5 }, factor: 0.5 }, 4);
    let picked: { s: RunState; word: string } | null = null;
    for (let seed = 0; seed < 40 && !picked; seed++) {
      const s = newRun(seed, rc);
      if (s.phase !== 'fight') continue;
      const enc = s.encounter as Encounter;
      const armoured: RunState = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000 } } }; // amoeba + forced armour 4 via resistCtx
      const short = candidateWords(armoured, rc).find((c) => c.word.length === 3);
      if (short) picked = { s: armoured, word: short.word };
    }
    if (!picked) throw new Error('no seed under 40 offered a 3-letter word');
    const raw = scoreWord(picked.word, [], rc.content.tuning).damage;
    const expected = Math.floor(Math.floor(raw / 2) * 0.5); // armour then resist, both floored
    expect(candidateWords(picked.s, rc).find((c) => c.word === picked.word)?.damage).toBe(expected);
    const idx = tilesForWord(picked.word, picked.s.encounter!.grid.map((t) => t.letter), picked.s.encounter!.grid.map((_, i) => i));
    if (!idx) throw new Error('spell');
    let sel = picked.s;
    for (const i of idx) sel = reduce(sel, { type: 'toggleTile', index: i }, rc);
    expect(scoreSelection(sel, rc)).toBe(expected);
    expect(reduce(sel, { type: 'submitWord' }, rc).lastTurn?.damage).toBe(expected);
  });

  it('a control enemy with no resist is unchanged: the preview and the hit are the raw score', () => {
    const s = newRun(3, flat);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    const bare: RunState = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000 } } };
    const cand = candidateWords(bare, flat).find((c) => c.word.length >= 3);
    if (!cand) throw new Error('no word');
    expect(cand.damage).toBe(scoreWord(cand.word, [], flat.content.tuning).damage);
    const idx = tilesForWord(cand.word, bare.encounter!.grid.map((t) => t.letter), bare.encounter!.grid.map((_, i) => i));
    let sel = bare;
    for (const i of idx as number[]) sel = reduce(sel, { type: 'toggleTile', index: i }, flat);
    expect(scoreSelection(sel, flat)).toBe(cand.damage);
    expect(reduce(sel, { type: 'submitWord' }, flat).lastTurn?.damage).toBe(cand.damage);
  });

  it('resistLabel is short and correct per demand kind (dormant intent line, Arena.svelte)', () => {
    expect(resistLabel({ when: { kind: 'minLength', value: 6 }, factor: 0.5 })).toBe('resist <6');
    expect(resistLabel({ when: { kind: 'containsLetter', letters: 'z' }, factor: 0.5 })).toBe('resist no Z');
    expect(resistLabel({ when: { kind: 'uniqueLetters' }, factor: 0.5 })).toBe('resist repeats');
    expect(resistLabel({ when: { kind: 'repeatLetter' }, factor: 0.5 })).toBe('resist no pair');
    expect(resistLabel({ when: { kind: 'minVowels', value: 2 }, factor: 0.5 })).toBe('resist vowels<2');
    // Every label fits the trait row on a 390px phone (HUD strings under ~20 chars, phone-render memo).
    for (const w of [
      { kind: 'minLength', value: 6 },
      { kind: 'maxLength', value: 8 },
      { kind: 'containsLetter', letters: 'z' },
      { kind: 'startsWith', letters: 'q' },
      { kind: 'endsWith', letters: 's' },
      { kind: 'uniqueLetters' },
      { kind: 'repeatLetter' },
      { kind: 'minVowels', value: 3 },
    ] as const) {
      expect(resistLabel({ when: w, factor: 0.5 }).length, JSON.stringify(w)).toBeLessThanOrEqual(20);
    }
  });
});

describe('variety wave step 1: the enrage clock', () => {
  it('past tuning.enrageAfter every enemy hits harder each turn, so a fight in which it attacks cannot stall', () => {
    const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0, enrageAfter: 3, enragePerTurn: 2 } });
    let s = newRun(6, flat);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    s = { ...s, player: { ...s.player, hp: 1000, maxHp: 1000 }, encounter: { ...enc, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000, damage: 6 } } };
    const hits: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = reduce(s, { type: 'shuffle' }, flat);
      hits.push(s.lastTurn?.enemyDamage ?? -1);
    }
    // Turns 1-3 hit 6; the tick at the start of turn 4 and after adds 2 each: 8, 10, 12.
    expect(hits).toEqual([6, 6, 6, 8, 10, 12]);
  });
});

describe('variety wave step 5: Normal and Endless (save v9)', () => {
  const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
  /** Drive an endless run with a player topped up before every word, so it goes as deep as asked. */
  function dive(seed: number, slots: number, c: EngineContext = flat): { states: RunState[]; final: RunState } {
    let s = newRun(seed, c, 'balanced', 'endless');
    const states: RunState[] = [s];
    for (let guard = 0; guard < 4000 && s.phase !== 'summary' && s.encounterIndex < slots; guard++) {
      if (s.phase === 'pick') s = reduce(s, { type: 'pickItem', index: 0 }, c);
      else if (s.phase === 'rest') s = reduce(s, { type: 'restHeal' }, c);
      else if (s.phase === 'event') s = reduce(s, { type: 'eventChoice', index: 1 }, c);
      else if (s.phase === 'evolve') s = reduce(s, { type: 'pickTrait', index: 0 }, c);
      else {
        const topped: RunState = { ...s, player: { ...s.player, hp: s.player.maxHp } };
        const best = candidateWords(topped, c).sort((a, b) => b.damage - a.damage)[0];
        if (!best) throw new Error('dead grid');
        s = play(topped, best.word, c);
      }
      states.push(s);
    }
    return { states, final: s };
  }

  it('newRun defaults to normal; the mode rides the action; the mode adds no draw; a normal run still wins on the ninth slot', () => {
    expect(newRun(1, flat).mode).toBe('normal');
    expect(reduce(newRun(1, flat), { type: 'newRun', seed: 2, mode: 'endless' }, flat).mode).toBe('endless');
    expect(newRun(1, flat, 'balanced', 'endless').mode).toBe('endless');
    const n = newRun(5, flat);
    const e = newRun(5, flat, 'balanced', 'endless');
    expect({ ...e, mode: 'normal' }).toEqual(n);
    const { final } = greedyRun(0, flat);
    expect(final.phase).toBe('summary');
    if (final.outcome === 'won') expect(final.encounterIndex).toBe(8);
  });

  it('encounterDefFor returns the content slot inside the list and a grown act-3 slot past it, bosses every third, pure', () => {
    for (let i = 0; i < 9; i++) expect(encounterDefFor(CONTENT, i)).toBe(CONTENT.encounters[i]);
    const fight = CONTENT.encounters[7] as EncounterDefT; // the last act-3 fight
    const boss = CONTENT.encounters[8] as EncounterDefT;
    const g = CONTENT.tuning.endlessHpGrowth;
    const d = CONTENT.tuning.endlessDamageGrowth;
    for (const i of [9, 10, 12, 13, 21]) {
      const def = encounterDefFor(CONTENT, i);
      expect(def.act).toBe(3);
      expect(def.boss).toBe(false);
      expect(def.hpScale).toBeCloseTo(fight.hpScale * Math.pow(g, i - 8), 9);
      expect(def.damageScale).toBeCloseTo(fight.damageScale * Math.pow(d, i - 8), 9);
    }
    for (const i of [11, 14, 17]) {
      const def = encounterDefFor(CONTENT, i);
      expect(def.boss).toBe(true);
      expect(def.hpScale).toBeCloseTo(boss.hpScale * Math.pow(g, i - 8), 9);
    }
    expect(encounterDefFor(CONTENT, 30)).toEqual(encounterDefFor(CONTENT, 30));
    expect(encounterDefFor(CONTENT, 11).hpScale).toBeGreaterThan(encounterDefFor(CONTENT, 8).hpScale);
  });

  it('an endless run goes past the ninth slot: act-3 pools, a boss every third, an evolve after each, one detour per block, no win', () => {
    const { states, final } = dive(3, 16);
    expect(final.phase).toBe('fight');
    expect(final.encounterIndex).toBe(16);
    expect(final.outcome).toBeNull();
    expect(states.every((st) => st.outcome !== 'won')).toBe(true);
    for (const st of states) {
      if (!st.encounter || st.encounterIndex < 9) continue;
      const def = encounterDefFor(CONTENT, st.encounterIndex);
      const pool = def.boss ? CONTENT.bosses : CONTENT.enemies;
      const e = pool.find((x) => x.id === st.encounter?.enemy.id);
      expect(e?.act, `slot ${st.encounterIndex}`).toBe(3);
    }
    const evolvesAt = [...new Set(states.filter((st) => st.phase === 'evolve').map((st) => st.encounterIndex))];
    expect(evolvesAt).toEqual([2, 5, 8, 11, 14]);
    const at9 = states.find((st) => st.encounterIndex === 9);
    const at12 = states.find((st) => st.encounterIndex === 12);
    expect(at9?.kinds).toHaveLength(12);
    expect(at12?.kinds).toHaveLength(15);
    for (const b of [9, 12]) {
      const block = (final.kinds as EncounterKindT[]).slice(b, b + 3);
      expect(block[2]).toBe('fight');
      expect(block.filter((k) => k !== 'fight').length).toBeLessThanOrEqual(1);
    }
    expect(final.stats.hpAtEncounterStart).toHaveLength(17);
    const boss8 = states.find((st) => st.encounterIndex === 8 && st.encounter?.turn === 1)?.encounter?.enemy.maxHp ?? 0;
    const boss14 = states.find((st) => st.encounterIndex === 14 && st.encounter?.turn === 1)?.encounter?.enemy.maxHp ?? 0;
    expect(boss14).toBeGreaterThan(boss8);
    const again = dive(3, 16);
    expect(JSON.stringify(again.final)).toBe(JSON.stringify(final));
    expect(JSON.parse(JSON.stringify(final))).toEqual(final);
    expect(final.v).toBe(10);
  });

  it('a normal run never extends its kinds or passes the ninth slot', () => {
    for (const seed of [0, 1, 2]) {
      const { states, final } = greedyRun(seed, flat);
      expect(final.encounterIndex).toBeLessThanOrEqual(8);
      for (const st of states) expect(st.kinds).toHaveLength(9);
    }
  });
});

describe('variety wave step 4: gold and cracked tiles (save v8)', () => {
  const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
  /** A fresh fight with an unkillable, harmless enemy and no items, so only the grid moves. */
  function quiet(seed: number): RunState {
    const s = newRun(seed, flat);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    return { ...s, encounter: { ...enc, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000, damage: 0 } } };
  }
  const mark = (s: RunState, at: number, patch: Partial<Tile>): RunState => {
    const enc = s.encounter as Encounter;
    return { ...s, encounter: { ...enc, grid: enc.grid.map((t, i) => (i === at ? { ...t, ...patch } : t)) } };
  };

  it('a fresh tile is plain: gold 0, cracked 0; every tile in a new grid is', () => {
    expect(plainTile('a')).toEqual({ letter: 'a', lockedTurns: 0, venom: 0, gold: 0, cracked: 0 });
    for (const t of (newRun(1, flat).encounter as Encounter).grid) expect([t.gold, t.cracked]).toEqual([0, 0]);
  });

  it('gold on a played tile adds to the hit after the multiplier and before armour; the selection preview, the candidate and the hit agree', () => {
    const s0 = quiet(3);
    const cands = candidateWords(s0, flat);
    const pick = cands.find((c) => c.word.length === 4); // four letters: Tardigrade King's armour 5 halves it below
    if (!pick) throw new Error('no word');
    const idx = candidateIndices(s0, pick.word) ?? [];
    const at = idx[0] as number;
    const s = mark(s0, at, { gold: 5 });
    // Candidates: the word can carry the gold (its letter is in the word), so its damage rises by 5; a word without that letter does not.
    const c2 = candidateWords(s, flat);
    expect(c2.find((c) => c.word === pick.word)?.damage).toBe(pick.damage + 5);
    const letter = (s.encounter as Encounter).grid[at]?.letter ?? '';
    const without = cands.find((c) => !c.word.includes(letter));
    if (without) expect(c2.find((c) => c.word === without.word)?.damage).toBe(without.damage);
    // candidateIndices spends the gold tile first; the exact preview and the hit match the candidate.
    const mapped = candidateIndices(s, pick.word) ?? [];
    expect(mapped).toContain(at);
    let sel = s;
    for (const i of mapped) sel = reduce(sel, { type: 'toggleTile', index: i }, flat);
    expect(scoreSelection(sel, flat)).toBe(pick.damage + 5);
    const hit = reduce(sel, { type: 'submitWord' }, flat);
    expect(hit.lastTurn?.damage).toBe(pick.damage + 5);
    expect(hit.lastTurn?.gold).toBe(5);
    expect(hit.stats.bestWordDamage).toBe(pick.damage); // the stat is the word's own score
    // The gold left with the tile.
    expect((hit.encounter as Encounter).grid.every((t) => t.gold === 0)).toBe(true);
    // A multiplier does not touch gold: Predatory (+15%) lifts the word, then the 5 rides on top; preview, candidate and hit (gate W1).
    const doubled: RunState = { ...sel, player: { ...sel.player, traits: ['predatory'] } };
    expect(scoreSelection(doubled, flat)).toBe(Math.floor(pick.damage * 1.15) + 5);
    expect(reduce(doubled, { type: 'submitWord' }, flat).lastTurn?.damage).toBe(Math.floor(pick.damage * 1.15) + 5);
    expect(candidateWords(doubled, flat).find((c) => c.word === pick.word)?.damage).toBe(Math.floor(pick.damage * 1.15) + 5);
    // Armour halves gold with the rest: a 4-letter word into armour 5 lands floor((word + 5) / 2); the candidate says the same (gate W2).
    const armoured: RunState = { ...sel, encounter: { ...(sel.encounter as Encounter), enemy: { ...(sel.encounter as Encounter).enemy, id: 'tardigrade-king' } } };
    expect(scoreSelection(armoured, flat)).toBe(Math.floor((pick.damage + 5) / 2));
    expect(reduce(armoured, { type: 'submitWord' }, flat).lastTurn?.damage).toBe(Math.floor((pick.damage + 5) / 2));
    expect(candidateWords(armoured, flat).find((c) => c.word === pick.word)?.damage).toBe(Math.floor((pick.damage + 5) / 2));
    // A word that avoids the gold tile lands no gold (gate W5): only the tiles played count.
    if (without) {
      const avoided = play(s, without.word, flat);
      expect(avoided.lastTurn?.damage).toBe(without.damage);
      expect(avoided.lastTurn?.gold).toBe(0);
    }
    // Gold under a lock is not playable and counts for nobody (gate W4): every shared word keeps its plain damage.
    const locked = mark(s, at, { lockedTurns: 2 });
    for (const c of candidateWords(locked, flat)) expect(c.damage, c.word).toBe(cands.find((p) => p.word === c.word)?.damage);
    // Not a word: no preview.
    expect(scoreSelection(s, flat)).toBeNull();
  });

  it('candidateIndices spends the richest gold tile of a letter even when a plain mapping would take another (gate W3)', () => {
    // Find a word with a letter that has at least two playable tiles on the grid, and mark gold on the copy the plain mapping skips.
    for (let seed = 0; seed < 40; seed++) {
      const s0 = quiet(seed);
      const letters = (s0.encounter as Encounter).grid.map((t) => t.letter);
      const cand = candidateWords(s0, flat).find((c) => {
        const idx = candidateIndices(s0, c.word) ?? [];
        return c.word.length >= 4 && idx.some((i) => letters.filter((l) => l === letters[i]).length >= 2 && new Set(c.word).size === c.word.length);
      });
      if (!cand) continue;
      const plainIdx = candidateIndices(s0, cand.word) ?? [];
      const i0 = plainIdx.find((i) => letters.filter((l) => l === letters[i]).length >= 2) as number;
      const other = letters.findIndex((l, i) => l === letters[i0] && i !== i0 && !plainIdx.includes(i));
      if (other < 0) continue;
      // Gold 3 on the copy the plain mapping takes, gold 5 on the copy it skips: the candidate promises 5, the mapping delivers 5.
      const s = mark(mark(s0, i0, { gold: 3 }), other, { gold: 5 });
      expect(candidateWords(s, flat).find((c) => c.word === cand.word)?.damage).toBe(cand.damage + 5);
      const idx = candidateIndices(s, cand.word) ?? [];
      expect(idx).toContain(other);
      expect(idx).not.toContain(i0);
      let sel = s;
      for (const i of idx) sel = reduce(sel, { type: 'toggleTile', index: i }, flat);
      expect(reduce(sel, { type: 'submitWord' }, flat).lastTurn?.damage).toBe(cand.damage + 5);
      return;
    }
    throw new Error('no seed under 40 offered a word with a doubled letter');
  });

  it('a Midas turn spends exactly one draw past the refill, and a crumble spends exactly its own refill (gate W6); two calm turns make two gold tiles (gate W8)', () => {
    const s0 = quiet(11);
    const midas: RunState = { ...s0, player: { ...s0.player, traits: ['midas'] } };
    // Same word, with and without Midas: the counter differs by the one gilding draw, and the gilded tile is playable and unselected.
    const word = candidateWords(s0, flat)[0];
    if (!word) throw new Error('no word');
    const plain = play(s0, word.word, flat);
    const gilded = play(midas, word.word, flat);
    expect(gilded.rng.counter - plain.rng.counter).toBe(1);
    expect((gilded.encounter as Encounter).grid.filter((t) => t.gold > 0)).toHaveLength(1);
    // A second calm turn (a word avoiding the gold tile) gilds a second, different tile.
    const g1 = gilded.encounter as Encounter;
    const goldAt = g1.grid.findIndex((t) => t.gold > 0);
    const avoiding = candidateWords(gilded, flat).find((c) => !(candidateIndices(gilded, c.word) ?? []).includes(goldAt));
    if (!avoiding) throw new Error('no word avoiding the gold tile');
    const twice = play(gilded, avoiding.word, flat);
    expect((twice.encounter as Encounter).grid.filter((t) => t.gold > 0)).toHaveLength(2);
    // A crumble: a cracked tile at the bottom of a column the word does not touch. The turn's rng and grid equal the
    // twin turn's (no crack) followed by one refill of that tile; the tile stays where it is (a bottom tile settles nowhere).
    for (let seed = 0; seed < 40; seed++) {
      const t0 = quiet(seed);
      const w = candidateWords(t0, flat)[0];
      if (!w) continue;
      const idx = candidateIndices(t0, w.word) ?? [];
      const cols = new Set(idx.map((i) => i % 4));
      const j = [12, 13, 14, 15].find((k) => !cols.has(k % 4));
      if (j === undefined) continue;
      const twin = play(t0, w.word, flat);
      if (twin.phase !== 'fight' || twin.lastTurn?.scrambled) continue;
      const cracked = play(mark(t0, j, { cracked: 1 }), w.word, flat);
      const [expectedGrid, expectedRng] = refill(twin.rng, (twin.encounter as Encounter).grid, [j], letterBias(twin, flat));
      expect(cracked.rng).toEqual(expectedRng);
      expect((cracked.encounter as Encounter).grid).toEqual(settle(expectedGrid, [j]));
      expect(cracked.lastTurn?.crumbled).toBe(1);
      // And a crumble at the TOP of an untouched column settles: the survivors below rise one row and the fresh tile lands at the bottom.
      const top = [0, 1, 2, 3].find((k) => !cols.has(k % 4));
      if (top !== undefined) {
        const crumbledTop = play(mark(t0, top, { cracked: 1 }), w.word, flat);
        const before = (twin.encounter as Encounter).grid;
        const after = (crumbledTop.encounter as Encounter).grid;
        for (let r = 0; r < 3; r++) expect(after[top + r * 4]?.letter, `row ${r}`).toBe(before[top + (r + 1) * 4]?.letter);
      }
      return;
    }
    throw new Error('no seed under 40 left a column untouched');
  });

  it('bestGold takes the richest gold tiles the word has letters for, one per occurrence', () => {
    expect(bestGold('cat', [])).toBe(0);
    expect(bestGold('cat', [{ letter: 'a', gold: 5 }])).toBe(5);
    expect(bestGold('cat', [{ letter: 'z', gold: 5 }])).toBe(0);
    expect(bestGold('cat', [{ letter: 'a', gold: 5 }, { letter: 'a', gold: 3 }])).toBe(5);
    expect(bestGold('aardvark', [{ letter: 'a', gold: 5 }, { letter: 'a', gold: 3 }, { letter: 'a', gold: 1 }, { letter: 'a', gold: 1 }])).toBe(9);
  });

  it('goldTiles gilds playable, unselected, plain tiles, one draw each; a Midas turn start makes one gold tile a turn', () => {
    const s = quiet(5);
    const midas: RunState = { ...s, player: { ...s.player, traits: ['midas'] } };
    const t1 = reduce(midas, { type: 'shuffle' }, flat);
    const golds = (t1.encounter as Encounter).grid.filter((t) => t.gold > 0);
    expect(golds).toHaveLength(1);
    expect(golds[0]?.gold).toBe(5);
    const t2 = reduce(t1, { type: 'shuffle' }, flat);
    // A shuffle redraws every unlocked tile, so the first gold went with it; the new turn gilds one again.
    expect((t2.encounter as Encounter).grid.filter((t) => t.gold > 0)).toHaveLength(1);
  });

  it('crackTiles cracks sound tiles; a cracked tile ticks at the end of the turn, crumbles at zero, is refilled and settles; playing it first spends it', () => {
    const s0 = quiet(7);
    const enc = s0.encounter as Encounter;
    const s = mark(mark(s0, 0, { cracked: 2 }), 5, { cracked: 1 });
    const word = candidateWords(s, flat).find((c) => !(candidateIndices(s, c.word) ?? []).includes(0) && !(candidateIndices(s, c.word) ?? []).includes(5));
    if (!word) throw new Error('no word avoiding tiles 0 and 5');
    const after = play(s, word.word, flat);
    const g = (after.encounter as Encounter).grid;
    // Tile 5 (cracked 1) crumbled: refilled and settled, the report counts it; tile 0 ticked to 1 and still stands.
    expect(after.lastTurn?.crumbled).toBe(1);
    expect(g.filter((t) => t.cracked > 0)).toHaveLength(1);
    expect(g.filter((t) => t.cracked > 0)[0]?.cracked).toBe(1);
    expect(g.filter((t) => t.cracked > 0)[0]?.letter).toBe(enc.grid[0]?.letter);
    expect(g.filter((t) => t.cracked === 1 && t.letter === enc.grid[0]?.letter)).toHaveLength(1);
    // Playing a cracked tile spends it like any other.
    const through = candidateWords(s, flat).find((c) => (candidateIndices(s, c.word) ?? []).includes(5));
    if (through) {
      const spent = play(s, through.word, flat);
      expect(spent.lastTurn?.crumbled).toBe(0);
      expect(spent.phase).toBe('fight');
    }
    // The special: Diatom Swarm cracks two tiles every second turn (turn 2) for 3, never the tiles being played; the
    // end of that same turn ticks them to 2 (as a lock is ticked), so the player sees 2, then 1, then the crumble.
    const swarm: RunState = { ...s0, encounter: { ...enc, turn: 2, enemy: { ...enc.enemy, id: 'diatom-swarm', damage: 0 } } };
    const best = candidateWords(swarm, flat).sort((a, b) => b.damage - a.damage)[0];
    if (!best) throw new Error('no word');
    const idx = candidateIndices(swarm, best.word) ?? [];
    const hit = play(swarm, best.word, flat);
    const cracked = (hit.encounter as Encounter).grid.filter((t) => t.cracked > 0);
    expect(cracked).toHaveLength(Math.min(2, 16 - idx.length));
    for (const t of cracked) expect(t.cracked).toBe(2);
    // Two turns on, both crumble at the end of turn 4 (the special fires again that turn, so two fresh cracks appear).
    let later = hit;
    for (let i = 0; i < 2 && later.phase === 'fight'; i++) {
      const w = candidateWords(later, flat).find((c) => (candidateIndices(later, c.word) ?? []).every((k) => (later.encounter as Encounter).grid[k]?.cracked === 0));
      if (!w) break;
      later = play(later, w.word, flat);
    }
    if (later.phase === 'fight' && later.stats.turns === hit.stats.turns + 2) {
      expect(later.lastTurn?.crumbled).toBe(cracked.length);
      expect((later.encounter as Encounter).grid.filter((t) => t.cracked > 0).every((t) => t.cracked === 2)).toBe(true);
    }
    // A shuffle replaces cracked tiles with sound ones.
    expect((reduce(s, { type: 'shuffle' }, flat).encounter as Encounter).grid.every((t) => t.cracked === 0)).toBe(true);
  });

  it('a run with gold and cracks replays byte-identical and stays JSON-plain', () => {
    for (const seed of [0, 1, 2]) {
      const c = nodeContext({ ...flat.content, traits: CONTENT.traits.filter((t) => t.id === 'midas') });
      const a = greedyRun(seed, c);
      const b = greedyRun(seed, c);
      expect(JSON.stringify(a.final)).toBe(JSON.stringify(b.final));
      expect(JSON.parse(JSON.stringify(a.final))).toEqual(a.final);
      expect(a.final.v).toBe(10);
    }
  });
});

describe('variety wave step 3: evolution (save v7)', () => {
  const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
  const traitIds = new Set(CONTENT.traits.map((t) => t.id));

  /** A fight against a boss at slot `index` on the brink of death, entered through the real slot. */
  function bossBrink(seed: number, index: number): RunState {
    const { states } = greedyRun(seed, flat);
    const st = states.find((x) => x.encounterIndex === index && x.phase === 'fight' && x.encounter?.turn === 1);
    if (!st) throw new Error(`seed ${seed} never reached slot ${index}`);
    const enc = st.encounter as Encounter;
    return { ...st, encounter: { ...enc, enemy: { ...enc.enemy, hp: 1 } } };
  }
  function kill(s: RunState): RunState {
    const w = candidateWords(s, flat)[0];
    if (!w) throw new Error('no word');
    return play(s, w.word, flat);
  }

  it('newRun holds no traits; a boss win short of the last opens an evolve offer of three distinct unowned traits, then the item pick', () => {
    expect(newRun(1, flat).player.traits).toEqual([]);
    for (let seed = 0; seed < 8; seed++) {
      let s: RunState;
      try {
        s = bossBrink(seed, 2);
      } catch {
        continue;
      }
      const won = kill(s);
      expect(won.phase).toBe('evolve');
      expect(won.encounter).toBeNull();
      expect(won.offer).toHaveLength(3);
      expect(new Set(won.offer).size).toBe(3);
      for (const id of won.offer ?? []) expect(traitIds.has(id), id).toBe(true);
      // Three draws, one per trait, on top of what the win itself spent.
      // A bad index first, so the good pick has a stale rejection to clear (gate S2).
      const refused = reduce(won, { type: 'pickTrait', index: 9 }, flat);
      expect(refused.rejected).toBe('bad trait index');
      const picked = reduce(refused, { type: 'pickTrait', index: 1 }, flat);
      expect(picked.player.traits).toEqual([won.offer?.[1]]);
      expect(picked.rejected).toBeNull();
      expect(picked.phase).toBe('pick');
      expect(picked.offer).toHaveLength(3);
      expect(picked.encounterIndex).toBe(2);
      for (const id of picked.offer ?? []) expect(traitIds.has(id), id).toBe(false); // items now
      const held = picked.player.traits;
      // pickItem on the evolve screen is refused; pickTrait off it too.
      expect(reduce(won, { type: 'pickItem', index: 0 }, flat).rejected).toBe('not picking');
      expect(reduce(picked, { type: 'pickTrait', index: 0 }, flat).rejected).toBe('not evolving');
      expect(reduce(won, { type: 'pickTrait', index: 3 }, flat).rejected).toBe('bad trait index');
      expect(held).toHaveLength(1);
      return;
    }
    throw new Error('no seed under 8 reached the act-1 boss');
  });

  it('the second boss offers traits the player does not hold; the last boss ends the run with no evolve', () => {
    const s = newRun(2, flat);
    // Force: at the act-2 boss holding one trait, the offer excludes it.
    const enc = s.encounter as Encounter;
    const atBoss5: RunState = { ...s, encounterIndex: 5, player: { ...s.player, traits: ['predatory'] }, encounter: { ...enc, enemy: { ...enc.enemy, id: 'leviathan-larva', hp: 1 } }, stats: { ...s.stats, hpAtEncounterStart: [100, 100, 100, 100, 100, 100] } };
    const won = kill(atBoss5);
    expect(won.phase).toBe('evolve');
    expect(won.offer).not.toContain('predatory');
    expect(won.offer).toHaveLength(3);
    // With only two traits left in content, the offer is two; with none, the item pick follows straight away.
    const few = nodeContext({ ...flat.content, traits: CONTENT.traits.slice(0, 3) });
    const wonTwo = play(atBoss5, candidateWords(atBoss5, few)[0]?.word ?? '', few);
    expect(wonTwo.phase).toBe('evolve');
    expect(wonTwo.offer).toHaveLength(2);
    const none = nodeContext({ ...flat.content, traits: [] });
    const bareBoss: RunState = { ...atBoss5, player: { ...atBoss5.player, traits: [] } };
    const wonNone = play(bareBoss, candidateWords(bareBoss, none)[0]?.word ?? '', none);
    expect(wonNone.phase).toBe('pick');
    // The final boss: a win, not an evolve.
    const atBoss8: RunState = { ...atBoss5, encounterIndex: 8, encounter: { ...enc, enemy: { ...enc.enemy, id: 'abyssal-mat', hp: 1 } } };
    const finished = kill(atBoss8);
    expect(finished.phase).toBe('summary');
    expect(finished.outcome).toBe('won');
  });

  it('a trait fires in its hook and gathers after the cell and before the items (order is load-bearing)', () => {
    // Predatory: +15% on every word; on a fresh grid the preview and the hit both carry it.
    const s = newRun(4, flat);
    const enc = s.encounter as Encounter;
    const bare: RunState = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, hp: 100000, maxHp: 100000, damage: 0 } } };
    const word = candidateWords(bare, flat)[0];
    if (!word) throw new Error('no word');
    const withTrait: RunState = { ...bare, player: { ...bare.player, traits: ['predatory'] } };
    const preview = candidateWords(withTrait, flat).find((c) => c.word === word.word);
    const hit = play(withTrait, word.word, flat);
    expect(hit.lastTurn?.mult).toBeCloseTo(1.15, 5);
    expect(preview?.damage).toBe(hit.lastTurn?.damage);
    expect(hit.lastTurn?.damage).toBe(Math.floor(word.damage * 1.15));
    // Cell, then trait, then item (gate W2): Predator (-1: every hit hurts 1 more), Thick Membrane (2), Thick Skin (4).
    const order = gatherEffects('onDamageTaken', ['thick-skin'], CONTENT, 'aggro', ['thick-membrane']).map((e) => (e.type === 'reduceDamage' ? e.value : NaN));
    expect(order).toEqual([-1, 2, 4]);
    // Wired into the hit (gate W3): a 10 hit with Thick Membrane held costs 8.
    const membrane: RunState = { ...bare, player: { ...bare.player, hp: 50, traits: ['thick-membrane'] }, encounter: { ...(bare.encounter as Encounter), enemy: { ...(bare.encounter as Encounter).enemy, damage: 10 } } };
    const struck = reduce(membrane, { type: 'shuffle' }, flat);
    expect(struck.player.hp).toBe(42);
    expect(struck.lastTurn?.enemyDamage).toBe(8);
    // Wired into the encounter end and the draw (gate W4): Chitin Shell shields 10 and Photosynthesis heals 12 on a win;
    // Rare Taste weights j, q, x and z at 1.5 in the letter bias.
    const winner: RunState = { ...bare, player: { ...bare.player, hp: 50, traits: ['chitin-shell', 'photosynthesis'] }, encounter: { ...(bare.encounter as Encounter), enemy: { ...(bare.encounter as Encounter).enemy, hp: 1 } } };
    const won = play(winner, word.word, flat);
    expect(won.player.shield).toBe(10);
    expect(won.player.hp).toBe(62);
    const tasteful: RunState = { ...bare, player: { ...bare.player, traits: ['rare-taste'] } };
    expect(biasFor(letterBias(tasteful, flat), 'q')).toBeCloseTo(1.5, 5);
    expect(biasFor(letterBias(bare, flat), 'q')).toBeCloseTo(1, 5);
    // An unknown trait id throws where an unknown item would.
    expect(() => gatherEffects('onWordScored', [], CONTENT, undefined, ['no-such-trait'])).toThrow(/unknown trait/);
    // Regenerative heals 2 at turn start.
    const hurt: RunState = { ...bare, player: { ...bare.player, hp: 50, traits: ['regenerative'] } };
    const next = reduce(hurt, { type: 'shuffle' }, flat);
    expect(next.player.hp).toBe(52);
  });

  it('a run with evolutions replays byte-identical and stays JSON-plain; the traits show in the final state', () => {
    let seen = 0;
    for (let seed = 0; seed < 12 && seen < 2; seed++) {
      const a = greedyRun(seed, flat);
      const b = greedyRun(seed, flat);
      expect(JSON.stringify(a.final)).toBe(JSON.stringify(b.final));
      expect(JSON.parse(JSON.stringify(a.final))).toEqual(a.final);
      expect(a.final.v).toBe(10);
      const evolves = a.states.filter((st) => st.phase === 'evolve').length;
      if (a.final.outcome === 'won') {
        expect(evolves).toBe(2);
        expect(a.final.player.traits).toHaveLength(2);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('variety wave step 2: encounter types (save v6)', () => {
  const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
  const rarePlus = new Set(['rare', 'mythic']);
  const NON_BOSS_AFTER_FIRST = [1, 3, 4, 6, 7];

  it('placeKinds puts one elite, one rest and one event on distinct non-boss slots after the first, in three draws, and every eligible slot gets each kind over the seeds', () => {
    const seen: Record<string, Set<number>> = { elite: new Set(), rest: new Set(), event: new Set() };
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      const [kinds, after] = placeKinds(rng, CONTENT);
      expect(kinds).toHaveLength(9);
      expect(after.counter - rng.counter).toBe(3);
      for (const kind of ['elite', 'rest', 'event'] as const) {
        const at = kinds.map((k, i) => (k === kind ? i : -1)).filter((i) => i >= 0);
        expect(at, `${kind} seed ${seed}`).toHaveLength(1);
        expect(NON_BOSS_AFTER_FIRST, `${kind} at ${at[0]}`).toContain(at[0]);
        seen[kind]?.add(at[0] as number);
      }
      expect(kinds.filter((k) => k === 'fight')).toHaveLength(6);
      expect(kinds[0]).toBe('fight');
      // The same kinds land in the run, and the run's RNG has spent the three draws before the kit.
      const run = newRun(seed, flat);
      expect(run.kinds).toEqual(kinds);
      expect(run.v).toBe(10);
      expect(run.event).toBeNull();
    }
    for (const kind of ['elite', 'rest', 'event']) expect([...(seen[kind] ?? [])].sort(), kind).toEqual(NON_BOSS_AFTER_FIRST);
    // Placement is a pure function of the seed: same seed, same kinds; a different seed differs somewhere over 200.
    expect(new Set(Array.from({ length: 200 }, (_, seed) => placeKinds(createRng(seed), CONTENT)[0].join())).size).toBeGreaterThan(20);
    // Without eligible slots (a one-encounter curve) nothing is placed and nothing is drawn.
    const [none, rng2] = placeKinds(createRng(1), { ...CONTENT, encounters: [CONTENT.encounters[0] as EncounterDefT] });
    expect(none).toEqual(['fight']);
    expect(rng2.counter).toBe(createRng(1).counter);
  });

  /** Drive the greedy helper until the run reaches the slot at `index`, returning the state on arrival. */
  function arriveAt(seed: number, index: number, c: EngineContext = flat): RunState {
    const { states } = greedyRun(seed, c);
    const st = states.find((x) => x.encounterIndex === index && x.phase !== 'pick' && (x.phase === 'fight' ? x.encounter?.turn === 1 : true));
    if (!st) throw new Error(`seed ${seed} never reached slot ${index}`);
    return st;
  }
  /** A seed whose greedy run reaches its slot of `kind`. */
  function seedReaching(kind: 'elite' | 'rest' | 'event', c: EngineContext = flat): { seed: number; index: number; state: RunState } {
    for (let seed = 0; seed < 60; seed++) {
      const kinds = placeKinds(createRng(seed), c.content)[0];
      const index = kinds.indexOf(kind);
      try {
        return { seed, index, state: arriveAt(seed, index, c) };
      } catch {
        // died before it; next seed
      }
    }
    throw new Error(`no seed under 60 reaches a ${kind}`);
  }

  it('a rest is a screen with a three-offer: restHeal heals 30% of max HP rounded and capped and moves on; pickItem takes the item instead', () => {
    const { state } = seedReaching('rest');
    expect(state.phase).toBe('rest');
    expect(state.encounter).toBeNull();
    expect(state.offer).toHaveLength(3);
    expect(state.stats.hpAtEncounterStart).toHaveLength(state.encounterIndex + 1); // a rest counts as reached
    // Items stripped so the next slot's turn start is inert and the HP delta is the rest's alone.
    const hurt: RunState = { ...state, player: { ...state.player, hp: 40, maxHp: 100, items: [] } };
    const healed = reduce(hurt, { type: 'restHeal' }, flat);
    expect(healed.player.hp).toBe(70);
    expect(healed.encounterIndex).toBe(state.encounterIndex + 1);
    expect(healed.player.items).toEqual([]);
    expect(['fight', 'event', 'rest']).toContain(healed.phase);
    const nearFull: RunState = { ...hurt, player: { ...hurt.player, hp: 90 } };
    const capped = reduce(nearFull, { type: 'restHeal' }, flat);
    expect(capped.player.hp).toBe(100);
    // Rounded, not floored (gate W3): Predator's 85 heals 26, so 10 becomes 36.
    const predator: RunState = { ...hurt, player: { ...hurt.player, hp: 10, maxHp: 85 } };
    expect(reduce(predator, { type: 'restHeal' }, flat).player.hp).toBe(36);
    const picked = reduce(hurt, { type: 'pickItem', index: 1 }, flat);
    expect(picked.player.hp).toBe(40); // no heal with the pick
    expect(picked.player.items).toEqual([state.offer?.[1]]);
    expect(picked.encounterIndex).toBe(state.encounterIndex + 1);
    // Off a rest, restHeal is rejected and changes nothing.
    const fight = newRun(1, flat);
    expect(reduce(fight, { type: 'restHeal' }, flat)).toEqual({ ...fight, rejected: 'not resting' });
  });

  it('an event is drawn from content by one RNG draw; the trade applies its effects (never below 1 HP), the last choice changes nothing, a rarePick opens a rare-guaranteed offer', () => {
    const { state } = seedReaching('event');
    expect(state.phase).toBe('event');
    expect(state.encounter).toBeNull();
    expect(state.offer).toBeNull();
    const def = CONTENT.events.find((e) => e.id === state.event);
    expect(def).toBeDefined();
    // Every event through the same slot: force each id in turn and check its trade.
    for (const ev of CONTENT.events) {
      // Items stripped so the next slot's turn start is inert and the player delta is the trade's alone.
      const at: RunState = { ...state, event: ev.id, player: { ...state.player, hp: 60, maxHp: 100, shield: 0, freeShuffles: 0, items: [] } };
      const pass = reduce(at, { type: 'eventChoice', index: ev.choices.length - 1 }, flat);
      expect(pass.player, ev.id).toEqual(at.player);
      expect(pass.event, ev.id).toBeNull();
      expect(pass.encounterIndex, ev.id).toBe(state.encounterIndex + 1);
      const trade = reduce(at, { type: 'eventChoice', index: 0 }, flat);
      const choice = ev.choices[0] as EventChoiceT;
      let hp = 60;
      let maxHp = 100;
      let shield = 0;
      let free = 0;
      // Effects apply in the order written (gate S1): a trade is a script, so "max HP +20, take 30" costs 30.
      for (const e of choice.effects) {
        if (e.type === 'heal') hp = Math.min(maxHp, hp + e.value);
        if (e.type === 'damagePlayer') hp = Math.max(0, hp - e.value);
        if (e.type === 'maxHp') {
          maxHp = Math.max(1, maxHp + e.value);
          hp = Math.min(maxHp, hp + Math.max(0, e.value));
        }
        if (e.type === 'shield') shield = Math.min(CONTENT.tuning.shieldMax, shield + e.value);
        if (e.type === 'freeShuffle') free += e.value;
      }
      expect(trade.player, ev.id).toMatchObject({ hp: Math.max(1, hp), maxHp, shield, freeShuffles: free });
      expect(trade.event, ev.id).toBeNull();
      if (choice.rarePick) {
        expect(trade.phase, ev.id).toBe('pick');
        expect(trade.encounterIndex, ev.id).toBe(state.encounterIndex);
        const first = CONTENT.items.find((i) => i.id === trade.offer?.[0]);
        expect(rarePlus.has(first?.rarity ?? ''), `${ev.id}: ${first?.id}`).toBe(true);
        const after = reduce(trade, { type: 'pickItem', index: 0 }, flat);
        expect(after.encounterIndex).toBe(state.encounterIndex + 1);
      } else {
        expect(trade.encounterIndex, ev.id).toBe(state.encounterIndex + 1);
      }
    }
    // A trade never kills: 5 HP into the spore bank's 15 damage leaves 1, and its rare pick still opens.
    const dying: RunState = { ...state, event: 'spore-bank', player: { ...state.player, hp: 5, items: [] } };
    const survived = reduce(dying, { type: 'eventChoice', index: 0 }, flat);
    expect(survived.player.hp).toBe(1);
    expect(survived.phase).toBe('pick');
    expect(survived.stats.damageTaken).toBe(dying.stats.damageTaken + 4);
    // Written order, not EFFECT_ORDER (gate S1): 5 HP into the vent grows to 25 of 120, takes 30, floors at 1.
    const vent: RunState = { ...dying, event: 'thermal-vent' };
    const braved = reduce(vent, { type: 'eventChoice', index: 0 }, flat);
    expect(braved.player).toMatchObject({ hp: 1, maxHp: 120 });
    expect(braved.stats.damageTaken).toBe(dying.stats.damageTaken + 24); // 25 taken, 1 given back by the floor
    // A max-HP cut is not damage taken (gate S3): warm-current at full HP.
    const full: RunState = { ...state, event: 'warm-current', player: { ...state.player, hp: 100, maxHp: 100, items: [] } };
    const basked = reduce(full, { type: 'eventChoice', index: 0 }, flat);
    expect(basked.player).toMatchObject({ hp: 90, maxHp: 90 });
    expect(basked.stats.damageTaken).toBe(full.stats.damageTaken);
    // An event id content no longer has (gate W1): any choice is the walk-away, nothing applied, the run moves on.
    const stale: RunState = { ...state, event: 'gone-event', player: { ...state.player, items: [] } };
    const moved = reduce(stale, { type: 'eventChoice', index: 0 }, flat);
    expect(moved.player).toEqual(stale.player);
    expect(moved.event).toBeNull();
    expect(moved.encounterIndex).toBe(state.encounterIndex + 1);
    expect(moved.rejected).toBeNull();
    // The event id is exactly one draw past arrival (gate W2): re-drawing from the counter before it gives the id and the state's rng.
    const [drawn, rngAfter] = pick({ seed: state.rng.seed, counter: state.rng.counter - 1 }, CONTENT.events);
    expect(drawn.id).toBe(state.event);
    expect(rngAfter).toEqual(state.rng);
    // Bad indexes and a wrong phase are rejected.
    expect(reduce(state, { type: 'eventChoice', index: 9 }, flat).rejected).toBe('bad event choice');
    expect(reduce(newRun(1, flat), { type: 'eventChoice', index: 0 }, flat).rejected).toBe('no event');
    // The event id is one RNG draw past arrival: the same seed replays the same event.
    const again = seedReaching('event');
    expect(again.state.event).toBe(state.event);
  });

  it('an elite fights the next act\'s pool at this slot\'s scale (act 3: an act-3 enemy scaled up) and its win offers a rare first', () => {
    for (let seed = 0; seed < 40; seed++) {
      const kinds = placeKinds(createRng(seed), CONTENT)[0];
      const index = kinds.indexOf('elite');
      const def = CONTENT.encounters[index] as EncounterDefT;
      let state: RunState;
      try {
        state = arriveAt(seed, index);
      } catch {
        continue;
      }
      expect(state.phase).toBe('fight');
      const enc = state.encounter as Encounter;
      const enemy = CONTENT.enemies.find((e) => e.id === enc.enemy.id) as EnemyDef;
      if (def.act < 3) {
        expect(enemy.act, `seed ${seed}`).toBe(def.act + 1);
        expect(enc.enemy.maxHp).toBe(Math.round(enemy.hp * def.hpScale));
        expect(enc.enemy.damage).toBe(Math.round(enemy.damage * def.damageScale));
      } else {
        expect(enemy.act, `seed ${seed}`).toBe(3);
        expect(enc.enemy.maxHp).toBe(Math.round(enemy.hp * def.hpScale * CONTENT.tuning.eliteHpScale));
        expect(enc.enemy.damage).toBe(Math.round(enemy.damage * def.damageScale * CONTENT.tuning.eliteDamageScale));
      }
      // Kill it: the offer's first item is rare or mythic.
      const lowHp: RunState = { ...state, encounter: { ...enc, enemy: { ...enc.enemy, hp: 1 } } };
      const word = candidateWords(lowHp, flat)[0];
      if (!word) throw new Error('no word');
      const won = play(lowHp, word.word, flat);
      expect(won.phase).toBe('pick');
      const first = CONTENT.items.find((i) => i.id === won.offer?.[0]);
      expect(rarePlus.has(first?.rarity ?? ''), `seed ${seed}: ${first?.id}`).toBe(true);
    }
  }, 60000);

  it('a plain fight\'s offer is not rare-guaranteed: over the seeds some first slots are common', () => {
    let commonFirst = 0;
    for (let seed = 0; seed < 30; seed++) {
      const s = newRun(seed, flat);
      const enc = s.encounter as Encounter;
      const lowHp: RunState = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, hp: 1 } } };
      const word = candidateWords(lowHp, flat)[0];
      if (!word) continue;
      const won = play(lowHp, word.word, flat);
      const first = CONTENT.items.find((i) => i.id === won.offer?.[0]);
      if (first?.rarity === 'common') commonFirst++;
    }
    expect(commonFirst).toBeGreaterThan(0);
  });

  it('a migrated v5 save (empty kinds) plays the rest of its run as fights', () => {
    let s: RunState = { ...newRun(3, flat), kinds: [] };
    for (let guard = 0; guard < 2000 && s.phase !== 'summary'; guard++) {
      expect(['fight', 'pick', 'evolve']).toContain(s.phase);
      if (s.phase === 'pick') {
        s = reduce(s, { type: 'pickItem', index: 0 }, flat);
        continue;
      }
      if (s.phase === 'evolve') {
        s = reduce(s, { type: 'pickTrait', index: 0 }, flat);
        continue;
      }
      const best = candidateWords(s, flat).sort((a, b) => b.damage - a.damage)[0];
      if (!best) throw new Error('dead grid');
      s = play(s, best.word, flat);
    }
    expect(s.phase).toBe('summary');
  });

  it('a run with rests and events replays byte-identical and stays JSON-plain', () => {
    for (const seed of [0, 1, 2, 3]) {
      const a = greedyRun(seed, flat);
      const b = greedyRun(seed, flat);
      expect(JSON.stringify(a.final)).toBe(JSON.stringify(b.final));
      expect(a.log).toEqual(b.log);
      const kinds = a.states.map((st) => st.phase).filter((p) => p === 'rest' || p === 'event');
      expect(a.final.v).toBe(10);
      // Over the four seeds at least one run passes through a rest or an event before the summary.
      if (kinds.length > 0) return;
    }
    throw new Error('no seed in 0..3 reached a rest or an event');
  });
});

describe('variety wave step 5: a turn-start redraw that kills the grid scrambles it', () => {
  it('with a redraw organelle at turn start, the grid the player sees always holds a word', () => {
    // A synthetic organelle that redraws three tiles at every turn start (the shipped ones gate theirs on a condition).
    const redrawer: ItemDef = { id: 'test-redrawer', name: 'Redrawer', rarity: 'common', description: 'test', flavor: 'test', hooks: { onTurnStart: [{ type: 'redrawTiles', count: 3 }] } };
    const flat = nodeContext({ ...FLAT, items: [...CONTENT.items, redrawer], tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    // Fifteen locked consonants and one free tile: every redraw of the free tile leaves no word, so the guard must scramble.
    let s = newRun(9, flat);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    const grid = enc.grid.map((t, i) => (i === 15 ? { ...t, letter: 'x', lockedTurns: 0 } : { ...t, letter: 'x', lockedTurns: 9 }));
    s = { ...s, player: { ...s.player, items: [redrawer.id] }, encounter: { ...enc, grid, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000, damage: 0 } } };
    // The dead grid is what the fixture built; a shuffle's end-of-turn guard already scrambles, so go through turnStart directly:
    // a shuffle redraws the one free tile, the end-of-turn guard scrambles (locks included), then turn start redraws again.
    const next = reduce(s, { type: 'shuffle' }, flat);
    expect(next.phase).toBe('fight');
    expect(isDead((next.encounter as Encounter).grid, flat.solver)).toBe(false);
    // Over many seeds with the redrawer held, no turn ever starts on a dead grid.
    for (let seed = 0; seed < 30; seed++) {
      let r = newRun(seed, flat);
      if (r.phase !== 'fight') continue;
      const e = r.encounter as Encounter;
      r = { ...r, player: { ...r.player, items: [redrawer.id, redrawer.id, redrawer.id] }, encounter: { ...e, enemy: { ...e.enemy, id: 'amoeba', hp: 100000, maxHp: 100000, damage: 0 } } };
      for (let t = 0; t < 8; t++) {
        expect(isDead((r.encounter as Encounter).grid, flat.solver), `seed ${seed} turn ${t}`).toBe(false);
        r = reduce(r, { type: 'shuffle' }, flat);
      }
    }
  });
});

describe('variety wave step 5: a hit to 0 HP is death before an on-hit heal', () => {
  it('an on-hit heal cannot stand the player back up from 0; at 1 HP it still fires', () => {
    const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    const healer = CONTENT.items.find((i) => i.hooks.onDamageTaken?.some((e) => e.type === 'heal'));
    if (!healer) throw new Error('no on-hit healer in the pool');
    let s = newRun(8, flat);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    s = { ...s, player: { ...s.player, hp: 6, items: [healer.id] }, encounter: { ...enc, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000, damage: 6 } } };
    const dead = reduce(s, { type: 'shuffle' }, flat);
    expect(dead.phase).toBe('summary');
    expect(dead.outcome).toBe('lost');
    expect(dead.player.hp).toBe(0);
    expect(dead.lastTurn?.enemyDamage).toBe(6);
    const alive = reduce({ ...s, player: { ...s.player, hp: 7 } }, { type: 'shuffle' }, flat);
    expect(alive.phase).toBe('fight');
    expect(alive.player.hp).toBeGreaterThanOrEqual(1);
  });
});

describe('variety wave step 5: rage breaks a stun (tracker #8)', () => {
  it('before the enrage clock a stun skips the attack; from the turn after it the enemy attacks through the stun and the intent agrees', () => {
    const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0, enrageAfter: 3, enragePerTurn: 0 } });
    let s = newRun(6, flat);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    s = { ...s, player: { ...s.player, hp: 1000, maxHp: 1000 }, encounter: { ...enc, enemy: { ...enc.enemy, id: 'amoeba', hp: 100000, maxHp: 100000, damage: 6, stunned: 99 } } };
    const hits: number[] = [];
    const stuns: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      s = reduce(s, { type: 'shuffle' }, flat);
      hits.push(s.lastTurn?.enemyDamage ?? -1);
      stuns.push(s.lastTurn?.stunned ?? false);
    }
    // Turns 1-3 stunned (0 damage); turns 4 and 5 hit through the stun.
    expect(hits).toEqual([0, 0, 0, 6, 6]);
    expect(stuns).toEqual([true, true, true, false, false]);
    expect((s.encounter as Encounter).enemy.stunned).toBe(94); // the count still ticks down, it is simply not honoured
  });
});

describe('stats HUD: the worst word (save v5)', () => {
  it('the first word sets the worst, a weaker word replaces it, a stronger one leaves it', () => {
    let s = newRun(21, ctx);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    s = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, hp: 100000, maxHp: 100000, damage: 0 } } };
    expect(s.stats.worstWord).toBe('');
    const first = candidateWords(s, ctx).sort((a, b) => b.damage - a.damage)[0];
    if (!first) throw new Error('no word');
    s = play(s, first.word, ctx);
    expect(s.stats).toMatchObject({ worstWord: first.word, worstWordDamage: first.damage, bestWord: first.word, bestWordDamage: first.damage });
    const weakest = candidateWords(s, ctx).sort((a, b) => a.damage - b.damage)[0];
    if (!weakest) throw new Error('no word');
    s = play(s, weakest.word, ctx);
    expect(s.stats.worstWordDamage).toBe(Math.min(first.damage, weakest.damage));
    expect(s.stats.bestWordDamage).toBe(Math.max(first.damage, weakest.damage));
    const before = s.stats;
    const mid = candidateWords(s, ctx).find((c) => c.damage > before.worstWordDamage && c.damage < before.bestWordDamage);
    if (mid) {
      s = play(s, mid.word, ctx);
      expect(s.stats.worstWord).toBe(before.worstWord);
      expect(s.stats.bestWord).toBe(before.bestWord);
    }
  });

  it('a tie keeps the first word, and a zero-damage word counts for neither best nor worst (gate W3, S4)', () => {
    let s = newRun(0, ctx);
    if (s.phase !== 'fight') throw new Error('fight');
    const enc = s.encounter as Encounter;
    s = { ...s, encounter: { ...enc, enemy: { ...enc.enemy, hp: 100000, maxHp: 100000, damage: 0 } } };
    const cands = candidateWords(s, ctx);
    const first = cands[0];
    if (!first) throw new Error('no word');
    s = play(s, first.word, ctx);
    const tie = candidateWords(s, ctx).find((c) => c.damage === first.damage && c.word !== first.word);
    if (tie) {
      s = play(s, tie.word, ctx);
      expect(s.stats.worstWord).toBe(first.word);
    }
    // Zero damage: a multiplier stack at exactly 0 (Spore's 3-letter half, Paralytic -0.3, Wellspring -0.2).
    const zero = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    let z = newRun(0, zero, 'gambler');
    if (z.phase !== 'fight') throw new Error('fight');
    const zenc = z.encounter as Encounter;
    z = { ...z, player: { ...z.player, items: ['paralytic', 'wellspring'] }, encounter: { ...zenc, enemy: { ...zenc.enemy, hp: 100000, maxHp: 100000, damage: 0 } } };
    const three = candidateWords(z, zero).find((c) => c.word.length === 3);
    if (!three) return;
    expect(three.damage).toBe(0);
    z = play(z, three.word, zero);
    expect(z.lastTurn?.damage).toBe(0);
    expect(z.stats.bestWord).toBe('');
    expect(z.stats.worstWord).toBe('');
    expect(z.stats.turns).toBe(1);
    // A zero word AFTER a damaging word leaves both worst fields on the damaging word (gate S1).
    const damaging = candidateWords(z, zero).find((c) => c.damage > 0);
    const zeroAgain = () => candidateWords(z, zero).find((c) => c.damage === 0);
    if (damaging) {
      z = play(z, damaging.word, zero);
      const kept = z.stats;
      const zw = zeroAgain();
      if (zw) {
        z = play(z, zw.word, zero);
        expect(z.stats.worstWord).toBe(kept.worstWord);
        expect(z.stats.worstWordDamage).toBe(kept.worstWordDamage);
        expect(z.stats.worstWordDamage).toBeGreaterThan(0);
      }
    }
  });
});

describe('starting cells (save v4)', () => {
  const cells = CONTENT.cells;
  function byId(id: string) {
    const c = cells.find((x) => x.id === id);
    if (!c) throw new Error(id);
    return c;
  }
  function anyWordIn(s: RunState, c: EngineContext): string {
    const w = candidateWords(s, c)[0];
    if (!w) throw new Error('no word');
    return w.word;
  }
  function inFightAs(seed: number, cell: string, c: EngineContext = ctx): RunState {
    let s = newRun(seed, c, cell);
    while (s.phase === 'pick') s = reduce(s, { type: 'pickItem', index: 0 }, c);
    if (s.phase !== 'fight') throw new Error('expected a fight');
    return s;
  }

  it('the default cell is balanced and a run without a cell is exactly the run before cells existed', () => {
    const a = newRun(9, ctx);
    const b = newRun(9, ctx, 'balanced');
    expect(a).toEqual(b);
    expect(a.cell).toBe('balanced');
    expect(a.player.maxHp).toBe(100);
    expect(byId('balanced').traits).toEqual({});
    expect(reduce(a, { type: 'newRun', seed: 9 }, ctx)).toEqual(a);
    expect(reduce(a, { type: 'newRun', seed: 9, cell: 'balanced' }, ctx)).toEqual(a);
  });

  it('the cell chosen through the action reaches the run (gate W1)', () => {
    const a = reduce(newRun(9, ctx), { type: 'newRun', seed: 9, cell: 'aggro' }, ctx);
    expect(a.cell).toBe('aggro');
    expect(a.player.maxHp).toBe(85);
    expect(a).toEqual(newRun(9, ctx, 'aggro'));
    for (const c of cells) expect(reduce(a, { type: 'newRun', seed: 3, cell: c.id }, ctx).player.maxHp).toBe(c.maxHp);
  });

  it('the cell gathers before the items, and that order is load-bearing (gate W2)', () => {
    // Predator's "1 more per hit" and Hardshell's "3 less" against a 2-damage hit: cell-first clamps
    // 2 + 1 - 3 to 0; items-first would clamp 2 - 3 to 0 and then add 1.
    const s = inFightAs(3, 'aggro');
    const enc = s.encounter as Encounter;
    const armed: RunState = { ...s, player: { ...s.player, items: ['hardshell'] }, encounter: { ...enc, enemy: { ...enc.enemy, hp: 100000, maxHp: 100000, damage: 2 } } };
    const after = reduce(armed, { type: 'shuffle' }, ctx);
    expect(after.lastTurn?.enemyDamage).toBe(0);
    const reductions = gatherEffects('onDamageTaken', ['hardshell'], CONTENT, 'aggro').flatMap((e) => (e.type === 'reduceDamage' ? [e.value] : []));
    expect(reductions).toEqual([-1, 3]);
  });

  it('a cell trait fires in every hook it names: draw, turn start, encounter end (gate W3)', () => {
    const traited = nodeContext({
      ...CONTENT,
      tuning: { ...CONTENT.tuning, startingPicks: 0 },
      cells: [
        ...CONTENT.cells,
        { id: 't-cell', name: 'T', description: 'x', flavor: 'y', maxHp: 100, startingItems: [], extraPicks: 0, traits: { onTileDraw: [{ type: 'letterWeight', letters: 'qz', value: 40 }], onTurnStart: [{ type: 'heal', value: 7 }], onEncounterEnd: [{ type: 'heal', value: 11 }] } },
      ],
    });
    const s0 = newRun(19, traited, 't-cell');
    if (s0.phase !== 'fight') throw new Error('fight');
    const enc = s0.encounter as Encounter;
    // onTileDraw: a shuffle draws with the cell's bias, exactly as refill would.
    const all = enc.grid.map((_, i) => i);
    const [expected] = refill(s0.rng, enc.grid, all, { q: 40, z: 40 });
    const hurt: RunState = { ...s0, player: { ...s0.player, hp: 50 }, encounter: { ...enc, enemy: { ...enc.enemy, hp: 100000, maxHp: 100000 } } };
    const s1 = reduce(hurt, { type: 'shuffle' }, traited);
    expect((s1.encounter as Encounter).grid).toEqual(expected);
    // onTurnStart: healed 7 at the new turn's start (minus nothing: the enemy hit is separate).
    expect(s1.lastTurn?.healed).toBe(7);
    // onEncounterEnd: heal 11 when the enemy dies.
    const weak: RunState = { ...hurt, encounter: { ...(hurt.encounter as Encounter), enemy: { ...(hurt.encounter as Encounter).enemy, hp: 1 } } };
    const won = play(weak, anyWordIn(weak, traited), traited);
    expect(won.phase).toBe('pick');
    expect(won.lastTurn?.healed).toBeGreaterThanOrEqual(11);
  });

  it('starting items fire their onPick once, in order (gate W4)', () => {
    const gifted = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 }, cells: [{ ...byId('balanced'), id: 'gifted', startingItems: ['growth-factor', 'kinesin'] }] });
    const g = newRun(4, gifted, 'gifted');
    expect(g.player.items).toEqual(['growth-factor', 'kinesin']);
    expect(g.player.maxHp).toBe(115); // Growth Factor: +15 max HP when taken
    expect(g.player.hp).toBe(115);
    expect(g.player.freeShuffles).toBe(2); // Kinesin: two free shuffles when taken
  });

  it('an unknown cell, or a cell naming an unknown starting item, throws', () => {
    expect(() => newRun(1, ctx, 'nope')).toThrow(/unknown cell/);
    const bad = nodeContext({ ...FLAT, cells: [{ ...byId('balanced'), id: 'bad', startingItems: ['no-such-item'] }] });
    expect(() => newRun(1, bad, 'bad')).toThrow(/unknown item/);
  });

  it('max HP and starting HP come from the cell', () => {
    for (const c of cells) {
      const s = newRun(2, ctx, c.id);
      expect(s.player.maxHp).toBe(c.maxHp);
      expect(s.player.hp).toBe(c.maxHp);
      expect(s.cell).toBe(c.id);
    }
  });

  it('the tinkerer gets its extra starting pick; starting items are granted before the kit', () => {
    const t = newRun(4, ctx, 'tinkerer');
    expect(t.pendingPicks).toBe(ctx.content.tuning.startingPicks + 1);
    expect(newRun(4, nodeContext(FLAT), 'tinkerer').pendingPicks).toBe(CONTENT.tuning.startingPicks + 1);
    const gifted = nodeContext({ ...FLAT, cells: [{ ...byId('balanced'), id: 'gifted', startingItems: ['sharp-pen', 'lens'] }] });
    const g = newRun(4, gifted, 'gifted');
    expect(g.player.items).toEqual(['sharp-pen', 'lens']);
    for (const id of g.offer ?? []) expect(['sharp-pen', 'lens']).not.toContain(id);
  });

  it('traits apply as an item held before every other: Predator +25% and 1 more per hit, Diatom 1 less and -15%', () => {
    const base = inFightAs(5, 'balanced');
    const word = candidateWords(base, ctx).find((c) => c.word.length >= 4)?.word ?? '';
    const grid = (base.encounter as Encounter).grid;
    const enemy = { id: 'amoeba', hp: 100000, maxHp: 100000, damage: 10, poison: 0, stunned: 0 };
    const as = (cell: string): RunState => {
      const s = inFightAs(5, cell);
      // Same grid, same items, same enemy, so the only difference is the cell.
      return { ...s, player: { ...s.player, items: base.player.items, hp: s.player.maxHp }, encounter: { ...(s.encounter as Encounter), grid, selection: [], enemy } };
    };
    const b = play({ ...base, encounter: { ...(base.encounter as Encounter), enemy } }, word, ctx);
    const p = play(as('aggro'), word, ctx);
    const d = play(as('defensive'), word, ctx);
    expect(p.lastTurn?.mult).toBeCloseTo((b.lastTurn?.mult ?? 0) + 0.25, 5);
    expect(d.lastTurn?.mult).toBeCloseTo((b.lastTurn?.mult ?? 0) - 0.15, 5);
    expect(b.lastTurn?.enemyDamage).toBe(10);
    expect(p.lastTurn?.enemyDamage).toBe(11);
    expect(d.lastTurn?.enemyDamage).toBe(9);
  });

  it('the gambler adds 30% on 7+ letter words and halves 3-letter words; the preview agrees with the hit', () => {
    const s = inFightAs(6, 'gambler');
    const cands = candidateWords(s, ctx);
    const long = cands.find((c) => c.word.length >= 7);
    const short = cands.find((c) => c.word.length <= 3);
    const mid = cands.find((c) => c.word.length === 5);
    const bare = candidateWords({ ...s, cell: 'balanced' }, ctx);
    const bareOf = (w: string) => bare.find((c) => c.word === w)?.damage ?? 0;
    expect(long || short).toBeTruthy();
    if (long) expect(long.damage).toBe(Math.floor(bareOf(long.word) * 1.3));
    if (short) expect(short.damage).toBe(Math.floor(bareOf(short.word) * 0.5));
    if (mid) expect(mid.damage).toBe(bareOf(mid.word));
    const pick = long ?? short;
    if (!pick) return;
    const played = play(s, pick.word, ctx);
    expect(played.lastTurn?.damage).toBe(Math.min(pick.damage, (s.encounter as Encounter).enemy.hp));
  });

  it('the tinkerer pays -20% damage for its extra pick', () => {
    const s = inFightAs(7, 'tinkerer');
    const word = candidateWords(s, ctx).find((c) => c.word.length >= 4)?.word ?? '';
    const bare = candidateWords({ ...s, cell: 'balanced' }, ctx).find((c) => c.word === word)?.damage ?? 0;
    const played = play({ ...s, encounter: { ...(s.encounter as Encounter), enemy: { ...(s.encounter as Encounter).enemy, hp: 100000, maxHp: 100000 } } }, word, ctx);
    expect(played.lastTurn?.mult).toBeCloseTo(0.8, 5);
    expect(played.lastTurn?.damage).toBe(Math.floor((played.lastTurn?.base ?? 0) * 0.8));
    expect(bare).toBeGreaterThan(played.lastTurn?.damage ?? 0);
  });

  it('every cell replays byte-identical and stays JSON-plain through a greedy run', () => {
    for (const c of cells) {
      const cc = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
      const run = (seed: number) => {
        let s = newRun(seed, cc, c.id);
        for (let guard = 0; guard < 2000 && s.phase !== 'summary'; guard++) {
          if (s.phase === 'pick') {
            s = reduce(s, { type: 'pickItem', index: 0 }, cc);
            continue;
          }
          if (s.phase === 'rest') {
            s = reduce(s, { type: 'restHeal' }, cc);
            continue;
          }
          if (s.phase === 'event') {
            s = reduce(s, { type: 'eventChoice', index: 0 }, cc);
            continue;
          }
          if (s.phase === 'evolve') {
            s = reduce(s, { type: 'pickTrait', index: 0 }, cc);
            continue;
          }
          const best = candidateWords(s, cc).sort((a, b) => b.damage - a.damage)[0];
          if (!best) throw new Error('dead grid');
          for (const i of candidateIndices(s, best.word) ?? []) s = reduce(s, { type: 'toggleTile', index: i }, cc);
          s = reduce(s, { type: 'submitWord' }, cc);
        }
        return s;
      };
      const a = run(11);
      const b = run(11);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      expect(a.cell).toBe(c.id);
      expect(a.phase).toBe('summary');
    }
  });
});

describe('variety wave step 6: curses (save v10)', () => {
  const flat = nodeContext({ ...FLAT, tuning: { ...CONTENT.tuning, startingPicks: 0 } });
  const curseIds = new Set(CONTENT.items.filter((i) => i.curse).map((i) => i.id));
  const boonIds = new Set(CONTENT.items.filter((i) => !i.curse).map((i) => i.id));

  /** A staged fight at `index` with a one-HP, harmless amoeba and no items, every slot a plain fight. */
  function fightAt(seed: number, index: number): RunState {
    const base = newRun(seed, flat);
    const enc = base.encounter as Encounter;
    return {
      ...base,
      encounterIndex: index,
      kinds: base.kinds.map((): EncounterKindT => 'fight'),
      player: { ...base.player, items: [] },
      encounter: { ...enc, enemy: { id: 'amoeba', hp: 1, maxHp: 1, damage: 0, poison: 0, stunned: 0 } },
    };
  }
  /** Kill the staged enemy with the first candidate word, returning the offer that follows. */
  function offerAfter(seed: number, index: number): { before: RunState; after: RunState } {
    const before = fightAt(seed, index);
    const word = candidateWords(before, flat)[0];
    if (!word) throw new Error(`seed ${seed}: no word`);
    return { before, after: play(before, word.word, flat) };
  }

  it('a cursed offer aligns one curse per boon slot, off the run RNG, only act 2+, about one in five; act 1 is never cursed', () => {
    let cursed = 0;
    let plain = 0;
    let act1Cursed = 0;
    for (let seed = 0; seed < 120; seed++) {
      const { after } = offerAfter(seed, 3); // index 3: act 2, a plain fight
      expect(after.phase).toBe('pick');
      for (const id of after.offer ?? []) expect(boonIds.has(id), `boon slot ${id}`).toBe(true); // a curse never appears as a boon
      if (after.curses === null) {
        plain++;
      } else {
        cursed++;
        expect(after.curses.length).toBe((after.offer ?? []).length);
        for (const id of after.curses) expect(curseIds.has(id), `curse slot ${id}`).toBe(true);
        expect(new Set(after.curses).size).toBe(after.curses.length); // drawn without replacement
      }
      const a1 = offerAfter(seed, 1).after; // index 1: act 1, never cursable
      expect(a1.curses, `seed ${seed} act 1`).toBeNull();
      if (a1.curses !== null) act1Cursed++;
    }
    expect(act1Cursed).toBe(0);
    // A real chance: sometimes cursed, sometimes not (not 0%, not 100%). Roughly one in five over 120.
    expect(cursed, 'some cursed').toBeGreaterThan(0);
    expect(plain, 'some plain').toBeGreaterThan(0);
    expect(cursed).toBeGreaterThan(10);
    expect(cursed).toBeLessThan(50);
  });

  it('the roll is drawn only when eligible: an act-2 offer spends exactly one draw more than the act-1 offer (plus one per curse when cursed)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const a1 = offerAfter(seed, 1); // act 1: no roll
      const a3 = offerAfter(seed, 3); // act 2: a roll, plus curse draws if it hits
      // The grid and pool are identical, so drawOffer spends the same draws in both; the difference is the roll.
      const d1 = a1.after.rng.counter - a1.before.rng.counter;
      const d3 = a3.after.rng.counter - a3.before.rng.counter;
      const extra = a3.after.curses === null ? 1 : 1 + a3.after.curses.length;
      expect(d3 - d1, `seed ${seed}`).toBe(extra);
    }
  });

  it('a cursed offer replays byte-identical', () => {
    // Find a seed whose act-2 offer is cursed, then confirm two identical setups produce the same offer and curses.
    let seed = 0;
    for (; seed < 200; seed++) if (offerAfter(seed, 3).after.curses !== null) break;
    expect(seed, 'a cursed seed under 200').toBeLessThan(200);
    const a = offerAfter(seed, 3).after;
    const b = offerAfter(seed, 3).after;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.curses).not.toBeNull();
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('endless act-3 slots are cursable too (encounterDefFor act 3)', () => {
    // A generated slot past the ninth is act 3, so its normal offer can be cursed.
    let cursed = 0;
    for (let seed = 0; seed < 80; seed++) {
      const before = { ...fightAt(seed, 12), mode: 'endless' as const };
      const word = candidateWords(before, flat)[0];
      if (!word) continue;
      const after = play(before, word.word, flat);
      if (after.phase === 'pick' && after.curses !== null) cursed++;
    }
    expect(cursed, 'some endless offers cursed').toBeGreaterThan(0);
  });

  it('pickItem takes the boon AND its curse, firing both onPick in order (boon first)', () => {
    // Cocoon (onPick: +15 shield, +5 max HP) paired with Atrophy (onPick: -15 max HP). Both must fire:
    // shield rises by 15 (the boon), and max HP ends at 100 + 5 - 15 = 90 (the curse), not 105.
    const base = fightAt(1, 3);
    const staged: RunState = { ...base, phase: 'pick', encounter: null, offer: ['cocoon', 'thick-skin', 'spores'], curses: ['curse-frail', 'curse-dull', 'curse-bleed'] };
    const after = reduce(staged, { type: 'pickItem', index: 0 }, flat);
    expect(after.player.items).toEqual(['cocoon', 'curse-frail']); // boon before curse
    expect(after.player.shield).toBe(15);
    expect(after.player.maxHp).toBe(base.player.maxHp + 5 - 15);
    expect(after.offer).toBeNull();
    expect(after.curses).toBeNull();
    expect(after.encounterIndex).toBe(4); // advanced to the next slot
  });

  it('skipOffer leaves the whole offer and advances; it is rejected on a normal offer', () => {
    const base = fightAt(2, 3);
    const cursed: RunState = { ...base, phase: 'pick', encounter: null, offer: ['lens', 'thick-skin', 'spores'], curses: ['curse-frail', 'curse-dull', 'curse-bleed'] };
    const skipped = reduce(cursed, { type: 'skipOffer' }, flat);
    expect(skipped.player.items).toEqual([]); // nothing taken
    expect(skipped.curses).toBeNull();
    expect(skipped.encounterIndex).toBe(4); // advanced
    expect(skipped.rejected).toBeNull();
    // A normal offer (curses null) is mandatory: skipOffer changes nothing.
    const normal: RunState = { ...base, phase: 'pick', encounter: null, offer: ['lens'], curses: null };
    expect(reduce(normal, { type: 'skipOffer' }, flat).rejected).toBe('no cursed offer to leave');
    // Off a pick entirely, skipOffer is rejected.
    expect(reduce(newRun(1, flat), { type: 'skipOffer' }, flat).rejected).toBe('no cursed offer to leave');
  });

  it('an onTurnStart HP drain to zero is a loss, caught at the turn-start death check', () => {
    const base = newRun(1, flat);
    const enc = base.encounter as Encounter;
    const staged: RunState = {
      ...base,
      player: { ...base.player, hp: 1, items: ['curse-bleed'] },
      encounter: { ...enc, enemy: { id: 'amoeba', hp: 100000, maxHp: 100000, damage: 0, poison: 0, stunned: 0 } },
    };
    const word = candidateWords(staged, flat).sort((a, b) => b.damage - a.damage)[0];
    if (!word) throw new Error('no word');
    // The played turn deals 0 enemy damage; the next turn start drains 1 (Hemorrhage), 1 HP to 0: a loss.
    const after = play(staged, word.word, flat);
    expect(after.phase).toBe('summary');
    expect(after.outcome).toBe('lost');
    expect(after.player.hp).toBe(0);
    expect(after.stats.damageTaken).toBeGreaterThanOrEqual(1);
  });

  it('a cell run through cursed offers replays byte-identical and stays JSON-plain', () => {
    // The seed window is wider than one might expect because which seed's greedy run happens to
    // reach a cursed offer depends on the enemy draws (the challenge wave, PR #87, changed the
    // pools, so the first cursed offer moved past seed 4); any seed that reaches one is enough.
    for (const seed of Array.from({ length: 24 }, (_, i) => i)) {
      const a = greedyRun(seed, flat);
      const b = greedyRun(seed, flat);
      expect(JSON.stringify(a.final)).toBe(JSON.stringify(b.final));
      expect(a.final.v).toBe(10);
      const sawCursed = a.states.some((st) => st.phase === 'pick' && st.curses !== null);
      if (sawCursed) return;
    }
    throw new Error('no seed in 0..23 reached a cursed offer');
  });
});

describe('selectedWord', () => {
  it('reads letters in selection order', () => {
    const s = newRun(2, ctx);
    const s1 = reduce(reduce(s, { type: 'toggleTile', index: 5 }, ctx), { type: 'toggleTile', index: 1 }, ctx);
    expect(selectedWord(s1)).toBe(`${s.encounter!.grid[5]!.letter}${s.encounter!.grid[1]!.letter}`);
  });
});
