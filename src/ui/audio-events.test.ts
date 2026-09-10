import { describe, expect, it } from 'vitest';
import type { Encounter, RunState, TurnReport } from '../engine/types';
import { sfxForTransition } from './audio-events';

// Minimal but fully-typed fixtures: sfxForTransition reads only selection length, lastTurn,
// player hp/items, phase/outcome and curses, but building complete objects keeps the types honest.

function report(over: Partial<TurnReport> = {}): TurnReport {
  return {
    word: 'cat',
    base: 3,
    mult: 1,
    damage: 3,
    enemyDamage: 0,
    healed: 0,
    scrambled: false,
    enemyDefeated: false,
    venom: 0,
    used: [],
    poison: 0,
    stunned: false,
    shielded: 0,
    redrawn: [],
    gold: 0,
    crumbled: 0,
    ...over,
  };
}

function encounter(selection: readonly number[]): Encounter {
  return {
    enemy: { id: 'e', hp: 10, maxHp: 10, damage: 2, poison: 0, stunned: 0 },
    grid: [],
    selection,
    turn: 1,
    playerHpAtStart: 20,
  };
}

function state(over: Partial<RunState> = {}): RunState {
  return {
    v: 10,
    rng: { seed: 1, counter: 0 },
    cell: 'balanced',
    mode: 'normal',
    kinds: [],
    phase: 'fight',
    encounterIndex: 0,
    event: null,
    player: { hp: 20, maxHp: 20, items: [], traits: [], shield: 0, freeShuffles: 0 },
    encounter: encounter([]),
    offer: null,
    curses: null,
    outcome: null,
    lastTurn: null,
    rejected: null,
    pendingPicks: 0,
    stats: {
      turns: 0,
      damageDealt: 0,
      damageTaken: 0,
      bestWord: '',
      bestWordDamage: 0,
      worstWord: '',
      worstWordDamage: 0,
      hpAtEncounterStart: [],
    },
    ...over,
  };
}

describe('sfxForTransition', () => {
  it('is silent for the first state (no prev)', () => {
    expect(sfxForTransition(null, state())).toEqual([]);
  });

  it('plays tileSelect when the selection grew', () => {
    const prev = state({ encounter: encounter([0]) });
    const next = state({ encounter: encounter([0, 1]) });
    expect(sfxForTransition(prev, next)).toEqual(['tileSelect']);
  });

  it('plays tileDeselect when the selection shrank but is not empty', () => {
    const prev = state({ encounter: encounter([0, 1]) });
    const next = state({ encounter: encounter([0]) });
    expect(sfxForTransition(prev, next)).toEqual(['tileDeselect']);
  });

  it('a full clear back to nothing is not a deselect blip', () => {
    const prev = state({ encounter: encounter([0, 1]) });
    const next = state({ encounter: encounter([]) });
    expect(sfxForTransition(prev, next)).toEqual([]);
  });

  it('plays wordLand on a fresh report, and no damage when no HP was lost', () => {
    const prev = state();
    const next = state({ lastTurn: report({ enemyDamage: 0 }), encounter: encounter([]) });
    expect(sfxForTransition(prev, next)).toEqual(['wordLand']);
  });

  it('adds damage when the word cost the player HP', () => {
    const prev = state();
    const next = state({ lastTurn: report({ enemyDamage: 4 }), player: { hp: 16, maxHp: 20, items: [], traits: [], shield: 0, freeShuffles: 0 } });
    expect(sfxForTransition(prev, next)).toEqual(['wordLand', 'damage']);
  });

  it('a hit fully eaten by the shield (no HP loss) stays quiet after the chime', () => {
    const prev = state();
    const next = state({ lastTurn: report({ enemyDamage: 4, shielded: 4 }) });
    expect(sfxForTransition(prev, next)).toEqual(['wordLand']);
  });

  it('adds defeat when the enemy died this turn', () => {
    const prev = state();
    const next = state({ lastTurn: report({ enemyDefeated: true }), encounter: null, phase: 'pick' });
    expect(sfxForTransition(prev, next)).toEqual(['wordLand', 'defeat']);
  });

  it('does not replay wordLand when the report object is unchanged (a non-word action)', () => {
    const r = report();
    const prev = state({ lastTurn: r, encounter: encounter([0]) });
    const next = state({ lastTurn: r, encounter: encounter([0, 1]) });
    expect(sfxForTransition(prev, next)).toEqual(['tileSelect']);
  });

  it('plays win on the transition into a won summary', () => {
    const prev = state({ phase: 'fight' });
    const next = state({ phase: 'summary', outcome: 'won', encounter: null });
    expect(sfxForTransition(prev, next)).toContain('win');
  });

  it('plays lose on the transition into a lost summary', () => {
    const prev = state({ phase: 'fight' });
    const next = state({ phase: 'summary', outcome: 'lost', encounter: null });
    expect(sfxForTransition(prev, next)).toContain('lose');
  });

  it('does not replay win when already in summary', () => {
    const prev = state({ phase: 'summary', outcome: 'won', encounter: null });
    const next = state({ phase: 'summary', outcome: 'won', encounter: null });
    expect(sfxForTransition(prev, next)).toEqual([]);
  });

  it('plays itemPick when the item list grew and the offer was not cursed', () => {
    const prev = state({ phase: 'pick', offer: ['a', 'b'], player: { hp: 20, maxHp: 20, items: [], traits: [], shield: 0, freeShuffles: 0 } });
    const next = state({ phase: 'fight', offer: null, player: { hp: 20, maxHp: 20, items: ['a'], traits: [], shield: 0, freeShuffles: 0 } });
    expect(sfxForTransition(prev, next)).toEqual(['itemPick']);
  });

  it('plays curseTaken when a cursed pick was taken (curses cleared as items grew)', () => {
    const prev = state({ phase: 'pick', offer: ['a', 'b'], curses: ['hemorrhage', 'thin'], player: { hp: 20, maxHp: 20, items: [], traits: [], shield: 0, freeShuffles: 0 } });
    const next = state({ phase: 'fight', offer: null, curses: null, player: { hp: 20, maxHp: 20, items: ['a'], traits: [], shield: 0, freeShuffles: 0 } });
    expect(sfxForTransition(prev, next)).toEqual(['curseTaken']);
  });
});
