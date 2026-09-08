/**
 * Run structure: 3 acts x (2 fights + 1 boss) = 9 encounters. Index 2, 5, 8 are bosses.
 * hpScale and damageScale multiply the enemy's base numbers. This is the HP
 * curve the sim tunes; keep it here, not in the engine.
 */
import type { EncounterDef, Tuning } from '../engine/types';

export const PLAYER_MAX_HP = 100;

/**
 * Formula knobs. lengthBonus index = word length; superlinear from 5 so long
 * words feel like events. startingPicks = 1 is the starting kit (Dean,
 * 2026-09-06, variant B): the run opens on a pick so no encounter is fought
 * with zero items.
 */
export const TUNING: Tuning = {
  lengthBonus: [1, 1, 1, 1, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5],
  startingPicks: 1,
  venomMax: 4,
};

export const ENCOUNTERS: readonly EncounterDef[] = [
  // Act 1 eased (Dean, 2026-09-06, variant A) so a bare 4-5-letter player
  // reaches act 2 with HP to spend. Do not touch act 1 again without a ruling.
  { act: 1, boss: false, hpScale: 0.7, damageScale: 0.5 },
  { act: 1, boss: false, hpScale: 1.3, damageScale: 0.84 },
  { act: 1, boss: true, hpScale: 0.7, damageScale: 0.84 },
  { act: 2, boss: false, hpScale: 1.7, damageScale: 1.5 },
  { act: 2, boss: false, hpScale: 2.0, damageScale: 1.7 },
  { act: 2, boss: true, hpScale: 1.6, damageScale: 1.7 },
  { act: 3, boss: false, hpScale: 2.5, damageScale: 2.0 },
  { act: 3, boss: false, hpScale: 2.9, damageScale: 2.3 },
  { act: 3, boss: true, hpScale: 2.3, damageScale: 2.3 },
];
