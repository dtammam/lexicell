/** Phase 0 placeholder enemies. Base numbers; the encounter curve in acts.ts scales them. */
import type { EnemyDef } from '../engine/types';

export const ENEMIES: readonly EnemyDef[] = [
  { id: 'amoeba', name: 'Amoeba', hp: 40, damage: 6, attackEvery: 1 },
  { id: 'flagellate', name: 'Flagellate', hp: 50, damage: 11, attackEvery: 2 },
  // The first tile hazard (Dean, 2026-09-08): every third turn one tile turns venomous.
  { id: 'polyp', name: 'Polyp', hp: 65, damage: 8, attackEvery: 1, special: { every: 3, effects: [{ type: 'venomTiles', count: 1, value: 2 }] } },
];
