/**
 * Twelve enemies in three act pools (variety wave, 2026-09-09; the first three were the whole
 * roster). Base numbers; the encounter curve in acts.ts scales them. Each pool has a plain hitter,
 * a slow heavy hitter, a hazard maker and a trait carrier, so no two fights in an act play alike.
 * `variance` is the hit's spread; the intent line shows the range.
 */
import type { EnemyDef } from '../engine/types';

export const ENEMIES: readonly EnemyDef[] = [
  // Act 1: the pond.
  { id: 'amoeba', name: 'Amoeba', act: 1, hp: 40, damage: 6, variance: 0.3, attackEvery: 1 },
  { id: 'flagellate', name: 'Flagellate', act: 1, hp: 50, damage: 11, variance: 0.2, attackEvery: 2 },
  // The first tile hazard (Dean, 2026-09-08): every third turn one tile turns venomous.
  { id: 'polyp', name: 'Polyp', act: 1, hp: 65, damage: 8, variance: 0.25, attackEvery: 1, special: { every: 3, effects: [{ type: 'venomTiles', count: 1, value: 2 }] } },
  { id: 'rotifer', name: 'Rotifer', act: 1, hp: 45, damage: 5, variance: 0.4, attackEvery: 1, traits: { regen: 2 } },
  // Act 2: the reef.
  { id: 'hydroid', name: 'Hydroid', act: 2, hp: 55, damage: 8, variance: 0.25, attackEvery: 1, traits: { hunger: 1 } },
  // Cracked tiles (variety wave step 4): every third turn the swarm eats two tiles. Turns 3 because the end of the
  // turn it lands on already ticks once (as a lock does): the player sees 2, then 1, then the tile crumbles.
  { id: 'diatom-swarm', name: 'Diatom Swarm', act: 2, hp: 70, damage: 6, variance: 0.5, attackEvery: 1, traits: { armour: 4 }, special: { every: 3, effects: [{ type: 'crackTiles', count: 2, turns: 3 }] } },
  { id: 'anemone', name: 'Anemone', act: 2, hp: 60, damage: 13, variance: 0.15, attackEvery: 2, special: { every: 2, effects: [{ type: 'venomTiles', count: 1, value: 2 }] } },
  { id: 'nudibranch', name: 'Nudibranch', act: 2, hp: 50, damage: 9, variance: 0.3, attackEvery: 1, special: { every: 4, effects: [{ type: 'scramble' }] } },
  // Act 3: the deep.
  { id: 'lamprey', name: 'Lamprey', act: 3, hp: 60, damage: 10, variance: 0.35, attackEvery: 1, traits: { hunger: 2 } },
  { id: 'siphonophore', name: 'Siphonophore', act: 3, hp: 80, damage: 7, variance: 0.2, attackEvery: 1, traits: { regen: 3 } },
  { id: 'tardigrade-king', name: 'Tardigrade King', act: 3, hp: 75, damage: 9, variance: 0.3, attackEvery: 1, traits: { armour: 5 } },
  { id: 'cuttle', name: 'Cuttle', act: 3, hp: 55, damage: 16, variance: 0.1, attackEvery: 2, special: { every: 3, effects: [{ type: 'lockTiles', count: 2, turns: 2 }] } },
];
