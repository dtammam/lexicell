/** Phase 0 placeholder enemies. Base numbers; the encounter curve in acts.ts scales them. */
import type { EnemyDef } from '../engine/types';

export const ENEMIES: readonly EnemyDef[] = [
  { id: 'amoeba', name: 'Amoeba', hp: 40, damage: 6, attackEvery: 1 },
  { id: 'flagellate', name: 'Flagellate', hp: 50, damage: 11, attackEvery: 2 },
  { id: 'polyp', name: 'Polyp', hp: 65, damage: 8, attackEvery: 1 },
];
