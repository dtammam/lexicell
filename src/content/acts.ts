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
  // Effects wave (2026-09-08): poison is a bounded burn, the shield a bounded buffer, and the addMult
  // that all perUnit scalers together contribute is capped at +1.5 (x2.5 before other multipliers).
  poisonMax: 12,
  shieldMax: 30,
  perUnitMultCap: 1.5,
  // Enrage (variety wave, 2026-09-09): after turn 20 every enemy hits 1 harder each turn. A fight
  // that runs twenty turns is already a slog; this makes sure it ends.
  enrageAfter: 20,
  enragePerTurn: 1,
  // Encounter types (variety wave step 2, 2026-09-09): a rest heals 30% of max HP; an act-3
  // elite is an act-3 enemy at 1.3x HP and 1.15x damage (acts 1 and 2 draw the next act's pool).
  restHeal: 0.3,
  eliteHpScale: 1.3,
  eliteDamageScale: 1.15,
};

export const ENCOUNTERS: readonly EncounterDef[] = [
  // Act 1 eased (Dean, 2026-09-06, variant A) so a bare 4-5-letter player
  // reaches act 2 with HP to spend. Do not touch act 1 again without a ruling.
  { act: 1, boss: false, hpScale: 0.7, damageScale: 0.5 },
  { act: 1, boss: false, hpScale: 1.3, damageScale: 0.84 },
  { act: 1, boss: true, hpScale: 0.7, damageScale: 0.84 },
  // Tuning wave (2026-09-08), curve C of the sweep: act 2 softer so a mediocre run reaches
  // the act-2 boss about half the time, act 3 harder so a strong run can still die there.
  // Measured at 300 runs: mediocre 25.0% wins, 48.7% reach E6; greedy 88.0%, E9 costs it 32.6.
  // Effects wave batch 1 (2026-09-08), curve D: the 112-item pool and the two-commons offer made
  // act 3 a cruise (mediocre HP rising E7 to E9 on curve C, 45.8% wins), so act 2 damage +0.1 /
  // +0.1 / +0.2 and act 3 hp 3.1 / 3.5 / 3.0, damage 2.8 / 3.1 / 3.2. Measured at 500 runs:
  // mediocre 35.2%, greedy 66.0%, solver 85.0%; all three criteria pass. Table in ROADMAP.
  // Variety wave step 1 (2026-09-09), curve G: twelve enemies with armour, regen and hunger and three
  // bosses with traits replaced three mild enemies; on curve F the mediocre bot won 8.8% and greedy
  // 40%. Acts 2 and 3 come down (act 2 damage 1.0 / 1.2 / 1.3, hp 1.3 / 1.5 / 1.3; act 3 hp 2.5 / 2.8
  // / 2.2, damage 1.9 / 2.1 / 2.2). Measured at 500 runs: mediocre 22.6%, greedy 68.4%, solver 87.8%.
  // Batch 3 (2026-09-08), curve F, the final pass at 200 items: the bigger pool and the lock removals
  // had pulled greedy to 53.6%, so act 3 damage 2.4 / 2.7 / 2.8 (hp unchanged). Measured at 500 runs:
  // greedy 59.4%, mediocre 33.6%; full table in ROADMAP.
  { act: 2, boss: false, hpScale: 1.3, damageScale: 1.0 },
  { act: 2, boss: false, hpScale: 1.5, damageScale: 1.2 },
  { act: 2, boss: true, hpScale: 1.3, damageScale: 1.3 },
  { act: 3, boss: false, hpScale: 2.5, damageScale: 1.9 },
  { act: 3, boss: false, hpScale: 2.8, damageScale: 2.1 },
  { act: 3, boss: true, hpScale: 2.2, damageScale: 2.2 },
];
