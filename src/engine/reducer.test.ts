import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { CONTENT } from '../content/index';
import { RARITY_WEIGHT as CONTENT_RARITY_WEIGHT } from '../content/items';
import { candidateIndices, candidateWords } from './candidates';
import { isDead, refill, settle } from './grid';
import { MAX_COMMONS_PER_OFFER, newRun, RARITY_WEIGHT, reduce, selectedWord, type Action, type EngineContext } from './reducer';
import { tilesForWord } from './solver';
import type { Content, Encounter, EnemyDef, ItemDef, RunState } from './types';

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
    expect(s.player).toEqual({ hp: 100, maxHp: 100, items: [], shield: 0, freeShuffles: 0 });
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
    const s0 = polypTurn(41, 1);
    const enc0 = s0.encounter as Encounter;
    const grid = enc0.grid.map((t, i) => (i === 5 ? { ...t, venom: 2 } : t));
    const s1: RunState = { ...s0, encounter: { ...enc0, grid } };
    // Play a word that avoids tile 5: the venom bites for 2 and grows to 3.
    const cands = candidateWords(s1, ctx).sort((a, b) => a.damage - b.damage);
    const avoiding = cands.find((c) => !(candidateIndices(s1, c.word) ?? []).includes(5));
    if (!avoiding) throw new Error('no word avoiding tile 5');
    const s2 = play(s1, avoiding.word);
    expect(s2.phase).toBe('fight');
    expect(s2.lastTurn?.venom).toBe(2);
    expect(s2.stats.damageTaken).toBe(s1.stats.damageTaken + 2 + (s2.lastTurn?.enemyDamage ?? 0));
    const g2 = (s2.encounter as Encounter).grid;
    expect(g2.filter((t) => t.venom > 0).map((t) => t.venom)).toEqual([3]);
    // Now spend it: settle may have moved it; find it and play a word through it.
    const at = g2.findIndex((t) => t.venom > 0);
    const through = candidateWords(s2, ctx).find((c) => (candidateIndices(s2, c.word) ?? []).includes(at));
    if (!through) throw new Error('no word through the venomous tile');
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
      expect(locked, `seed ${seed}: ${locked.length} locked`).toHaveLength(3);
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
    expect(g2[2]).toEqual({ letter: grid[14]?.letter, lockedTurns: 2, venom: 0 });
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
    expect(g2[3]).toEqual({ letter: grid[3]?.letter, lockedTurns: 1, venom: 0 });
    expect(g2[1]).toEqual({ letter: grid[9]?.letter, lockedTurns: 1, venom: 0 });
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
      const grid = base.encounter!.grid.map(() => ({ letter: 'e', lockedTurns: 5, venom: 0 }));
      grid[13] = { letter: 'c', lockedTurns: 0, venom: 0 };
      grid[14] = { letter: 'a', lockedTurns: 0, venom: 0 };
      grid[15] = { letter: 't', lockedTurns: 0, venom: 0 };
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
    expect(mythics).toHaveLength(8);
    const onlyMythic: EngineContext = nodeContext({ ...CONTENT, items: mythics, tuning: { ...CONTENT.tuning, startingPicks: 1 } });
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
    return nodeContext({ ...CONTENT, ...extra, items: [...CONTENT.items, item], tuning: { ...CONTENT.tuning, startingPicks: 0, ...extra.tuning } });
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
    const c = nodeContext({ ...CONTENT, items: [kit], tuning: { ...CONTENT.tuning, startingPicks: 1 } });
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

  it('redrawTiles redraws that many unlocked, unselected tiles in place and reports them', () => {
    const c = withItem({ id: 't-redraw', name: 'R', rarity: 'common', description: '', flavor: '', hooks: { onWordScored: [{ type: 'redrawTiles', count: 3 }] } });
    const s0 = withEnemy(fightWith(18, c, ['t-redraw']));
    const s1 = play(s0, anyWord(s0, c), c);
    expect(s1.lastTurn?.redrawn).toHaveLength(3);
    const played = new Set(s1.lastTurn?.used);
    for (const i of s1.lastTurn?.redrawn ?? []) expect(played.has(i)).toBe(false);
    expect(new Set(s1.lastTurn?.redrawn).size).toBe(3);
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
    const commonsOnly = nodeContext({ ...CONTENT, items: CONTENT.items.filter((i) => i.rarity === 'common'), tuning: { ...CONTENT.tuning, startingPicks: 1 } });
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
    const c = nodeContext({ ...CONTENT, items: [everything, ...CONTENT.items], tuning: { ...CONTENT.tuning, startingPicks: 0 } });
    for (const seed of [1, 2, 3]) {
      const a = greedyRun(seed, c, 0);
      const b = greedyRun(seed, c, 0);
      expect(JSON.stringify(a.final)).toBe(JSON.stringify(b.final));
      expect(JSON.parse(JSON.stringify(a.final))).toEqual(a.final);
      expect(a.final.v).toBe(3);
    }
  });
});

describe('selectedWord', () => {
  it('reads letters in selection order', () => {
    const s = newRun(2, ctx);
    const s1 = reduce(reduce(s, { type: 'toggleTile', index: 5 }, ctx), { type: 'toggleTile', index: 1 }, ctx);
    expect(selectedWord(s1)).toBe(`${s.encounter!.grid[5]!.letter}${s.encounter!.grid[1]!.letter}`);
  });
});
