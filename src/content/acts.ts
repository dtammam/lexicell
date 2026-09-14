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
  // Power-scaling wave (2026-09-14): the TOP of this curve was the one-shot engine. A 10-letter word
  // at 4.0 (vs a 5-letter's 1.5) plus its extra letters did ~3x a short word on the same item stack,
  // so the stacker one-shot ~80% of fights. Flattened from length 6 up so a long word is still clearly
  // the best play, not a nuke: length 7 is 2.2 (was 2.5), 10 is 2.95 (was 4), 15 is 3.5 (was 6.5).
  // Short words (the weak/mediocre band, 4-5) are untouched. Re-measured with npm run power.
  lengthBonus: [1, 1, 1, 1, 1, 1.5, 1.9, 2.2, 2.5, 2.75, 2.95, 3.1, 3.25, 3.35, 3.45, 3.5],
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
  // Endless (variety wave step 5, 2026-09-09): each slot past the ninth grows the act-3 scale by
  // these factors, compounding. Damage grows faster than HP on purpose: the deep should kill the
  // player before fights turn into slogs (at 1.1 HP / 1.06 damage the greedy bot's fights ran to
  // 600 turns against million-HP enemies it could out-heal).
  endlessHpGrowth: 1.06,
  endlessDamageGrowth: 1.08,
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
  // Evolution (variety wave step 3, 2026-09-09), curve H: a trait after each of the first two
  // bosses lifted greedy 61.8 to 73.8 on curve G and Spore's greedy past the 90% cap; acts 2 and
  // 3 grew to absorb it (act 2 hp 1.4 / 1.6 / 1.4, damage 1.05 / 1.25 / 1.35; act 3 hp 2.7 / 3.0 /
  // 2.4, damage 2.0 / 2.2 / 2.3).
  // Modes (step 5, 2026-09-09), curve J: closing the on-hit-heal immortality (a hit to 0 HP is now
  // death before the heal) cost the casual bot ten points on H (21.0 to 10.6) and the strong bot
  // ten (66.8 to 57.2). Softer acts 2 and 3 bring the casual bot back to 24.4%; the strong bot
  // lands at 84.0%, under the 90% cap but well above the 67% it had with the bug. Measured
  // alternatives: G 66.2 / 12.0, I 78.6 / 19.4, K 83.6 / 20.2, L 75.2 / 17.8, M 79.6 / 20.4.
  // Power-scaling wave (2026-09-14), pass 1: acts 2 and 3 grow the wall so a flattened long word does
  // a third-to-half of an enemy, not all of it (target: 2-3 words, one-shots down to a reward on weak
  // grids, bosses/elites never one-shot). Burst comes down where HP goes up so a non-one-shot turn is
  // survivable, not the "straight dead" half of the swing. Act 1 stays gentle (early one-shots are
  // within Dean's target and the act-1 easing ruling). Re-measured with npm run power + npm run sim.
  // Pass 2 (2026-09-14): pass 1 (HP up, some burst down) fixed the one-shots but sank the mediocre bot
  // to 16.3% (fights got longer, so it took more hits and died). The wall stays up for the stacker;
  // burst comes down HARD so the weak player survives the longer fights (mediocre back toward band).
  // Act 3 HP rises further to cut the act-3 one-shots: the mediocre bot rarely reaches act 3 (median
  // enc 6), so that does not cost it. Re-measured with npm run power + npm run sim.
  // Pass 3 (2026-09-14): pass 2 passed all three criteria (mediocre 25.7%, greedy 69.3%), leaving
  // headroom. The last hot spots were the act-2 fights (enc 4-5, ~52-62% one-shot) and act-3 fight 2
  // (enc 8, ~42%). Their HP goes up to pull those into the 20-30% band; burst stays soft so mediocre
  // keeps its band. Re-measured with npm run power + npm run sim.
  { act: 2, boss: false, hpScale: 2.4, damageScale: 0.6 },
  { act: 2, boss: false, hpScale: 2.6, damageScale: 0.68 },
  { act: 2, boss: true, hpScale: 2.2, damageScale: 0.78 },
  { act: 3, boss: false, hpScale: 3.4, damageScale: 1.2 },
  { act: 3, boss: false, hpScale: 4.3, damageScale: 1.35 },
  { act: 3, boss: true, hpScale: 3.2, damageScale: 1.5 },
];
