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
    description: '85 HP. +25% damage, but every hit you take hurts 1 more.',
    flavor: 'Kill it before it kills you.',
    maxHp: 85,
    startingItems: [],
    extraPicks: 0,
    traits: { onWordScored: [{ type: 'addMult', value: 0.25 }], onDamageTaken: [{ type: 'reduceDamage', value: -1 }] },
  },
  {
    id: 'defensive',
    name: 'Diatom',
    description: '108 HP. Take 1 less damage from every hit, but -15% damage.',
    flavor: 'Glass walls. Patient inside.',
    maxHp: 108,
    startingItems: [],
    extraPicks: 0,
    traits: { onDamageTaken: [{ type: 'reduceDamage', value: 1 }], onWordScored: [{ type: 'addMult', value: -0.15 }] },
  },
  {
    id: 'gambler',
    name: 'Spore',
    description: '90 HP. Words of 7+ letters deal +30%; words of 3 letters deal half.',
    flavor: 'Long words or nothing.',
    maxHp: 90,
    startingItems: [],
    extraPicks: 0,
    traits: {
      onWordScored: [
        { type: 'condition', when: { kind: 'minLength', value: 7 }, then: [{ type: 'addMult', value: 0.3 }] },
        { type: 'condition', when: { kind: 'maxLength', value: 3 }, then: [{ type: 'addMult', value: -0.5 }] },
      ],
    },
  },
  {
    id: 'tinkerer',
    name: 'Mycelium',
    description: '85 HP. One extra starting pick, but -20% damage.',
    flavor: 'Build first. Fight with what you built.',
    maxHp: 85,
    startingItems: [],
    extraPicks: 1,
    traits: { onWordScored: [{ type: 'addMult', value: -0.2 }] },
  },
];
