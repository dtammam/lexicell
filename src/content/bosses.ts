/**
 * One boss per act (variety wave, 2026-09-09; Phase 0 reused the Colony for all three). Each has a
 * special and a trait, so the act ends on a fight that plays like nothing before it.
 */
import type { EnemyDef } from '../engine/types';

export const BOSSES: readonly EnemyDef[] = [
  // Act 1: the Colony locks tiles.
  { id: 'colony', name: 'Colony', act: 1, hp: 120, damage: 12, variance: 0.2, attackEvery: 1, traits: { regen: 1 }, special: { every: 3, effects: [{ type: 'lockTiles', count: 3, turns: 2 }] } },
  // Act 2: the Leviathan Larva venoms two tiles and grows hungrier every turn.
  { id: 'leviathan-larva', name: 'Leviathan Larva', act: 2, hp: 120, damage: 10, variance: 0.3, attackEvery: 1, traits: { hunger: 1 }, special: { every: 3, effects: [{ type: 'venomTiles', count: 2, value: 2 }] } },
  // Act 3: the Abyssal Mat scrambles the grid, shrugs off short words, and heals.
  { id: 'abyssal-mat', name: 'Abyssal Mat', act: 3, hp: 150, damage: 14, variance: 0.25, attackEvery: 1, traits: { armour: 5, regen: 2 }, special: { every: 4, effects: [{ type: 'scramble' }] } },
];
