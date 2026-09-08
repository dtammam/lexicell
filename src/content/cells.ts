/**
 * Starting cells (Dean, 2026-09-08: "a balanced one, a more aggro one, a more defensive one").
 * A cell is stats plus always-on hooks in the item vocabulary. The first is the default; the sim's
 * exit criteria are judged on it, and every other cell must sit within 10 points of it for the
 * mediocre bot (a cell is a style, not a difficulty setting). Names are Dean's to change.
 */
import type { CellDef } from '../engine/types';

export const DEFAULT_CELL = 'balanced';

export const CELLS: readonly CellDef[] = [
  {
    id: 'balanced',
    name: 'Amoeba',
    description: 'The whole game, as it is. 100 HP, no traits.',
    flavor: 'It has no plan. It has never needed one.',
    maxHp: 100,
    startingItems: [],
    extraPicks: 0,
    traits: {},
  },
  {
    id: 'aggro',
    name: 'Predator',
    description: '80 HP. +25% damage, but every hit you take hurts 2 more.',
    flavor: 'Kill it before it kills you.',
    maxHp: 80,
    startingItems: [],
    extraPicks: 0,
    traits: { onWordScored: [{ type: 'addMult', value: 0.25 }], onDamageTaken: [{ type: 'reduceDamage', value: -2 }] },
  },
  {
    id: 'defensive',
    name: 'Diatom',
    description: '120 HP. Take 3 less damage from every hit, but -15% damage.',
    flavor: 'Glass walls. Patient inside.',
    maxHp: 120,
    startingItems: [],
    extraPicks: 0,
    traits: { onDamageTaken: [{ type: 'reduceDamage', value: 3 }], onWordScored: [{ type: 'addMult', value: -0.15 }] },
  },
  {
    id: 'gambler',
    name: 'Spore',
    description: '90 HP. Words of 6+ letters deal double; words of 4 or fewer deal half.',
    flavor: 'Long words or nothing.',
    maxHp: 90,
    startingItems: [],
    extraPicks: 0,
    traits: {
      onWordScored: [
        { type: 'condition', when: { kind: 'minLength', value: 6 }, then: [{ type: 'addMult', value: 1 }] },
        { type: 'condition', when: { kind: 'maxLength', value: 4 }, then: [{ type: 'addMult', value: -0.5 }] },
      ],
    },
  },
  {
    id: 'tinkerer',
    name: 'Mycelium',
    description: '100 HP. One extra starting pick, and 5 shield after each fight.',
    flavor: 'Build first. Fight with what you built.',
    maxHp: 100,
    startingItems: [],
    extraPicks: 1,
    traits: { onEncounterEnd: [{ type: 'shield', value: 5 }] },
  },
];
