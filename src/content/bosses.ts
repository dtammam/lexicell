/** Phase 0 has one boss, reused for all three boss slots with curve scaling. Mechanic: locks tiles. */
import type { EnemyDef } from '../engine/types';

export const BOSSES: readonly EnemyDef[] = [
  {
    id: 'colony',
    name: 'Colony',
    hp: 120,
    damage: 12,
    attackEvery: 1,
    special: { every: 3, effects: [{ type: 'lockTiles', count: 3, turns: 2 }] },
  },
];
