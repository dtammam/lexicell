/**
 * Twenty-four enemies in three act pools of eight (challenge wave, 2026-09-11; the variety wave
 * grew the roster from three to twelve). Base numbers; the encounter curve in acts.ts scales them.
 * Each pool now carries a plain hitter, a slow heavy hitter, hazard makers, trait carriers and one
 * "demander" that uses the resist trait, so no two fights in an act play alike and one fight per act
 * rewards clearing a word demand. Most new enemies recombine the existing hazard verbs (armour,
 * regen, hunger, venom tiles, lock tiles, scramble, hit ranges). `variance` is the hit's spread;
 * the intent line shows the range. crackTiles stays diatom-swarm's alone (content test).
 *
 * Demanders (the challenge lever): a resisting enemy takes only half damage from a word that fails
 * its demand, floored, so a harder word answers a harder fight. Escalating by act: Stentor resists
 * words under 5 letters, Zoanthid under 6, Anglerfish under 7. factor 0.5, never 0, so half damage
 * plus the enrage clock always ends the fight. Demanders are three of twenty-four: spice, not homework.
 */
import type { EnemyDef } from '../engine/types';

export const ENEMIES: readonly EnemyDef[] = [
  // Act 1: the pond.
  { id: 'amoeba', name: 'Amoeba', act: 1, hp: 40, damage: 6, variance: 0.3, attackEvery: 1 },
  { id: 'flagellate', name: 'Flagellate', act: 1, hp: 50, damage: 11, variance: 0.2, attackEvery: 2 },
  // The first tile hazard (Dean, 2026-09-08): every third turn one tile turns venomous.
  { id: 'polyp', name: 'Polyp', act: 1, hp: 65, damage: 8, variance: 0.25, attackEvery: 1, special: { every: 3, effects: [{ type: 'venomTiles', count: 1, value: 2 }] } },
  { id: 'rotifer', name: 'Rotifer', act: 1, hp: 45, damage: 5, variance: 0.4, attackEvery: 1, traits: { regen: 2 } },
  // Challenge wave additions.
  // Demander: a filter feeder that ignores small scraps. Words under 5 letters deal half. Gentle, act 1.
  { id: 'stentor', name: 'Stentor', act: 1, hp: 58, damage: 7, variance: 0.25, attackEvery: 1, traits: { resist: { when: { kind: 'minLength', value: 5 }, factor: 0.5 } } },
  // The pond's first shell: short words glance off (armour, new to act 1).
  { id: 'ostracod', name: 'Ostracod', act: 1, hp: 60, damage: 7, variance: 0.2, attackEvery: 1, traits: { armour: 3 } },
  // Regrows on its stalk and stings the grid: regen paired with a venom tile (a fresh act-1 combo).
  { id: 'vorticella', name: 'Vorticella', act: 1, hp: 55, damage: 6, variance: 0.3, attackEvery: 1, traits: { regen: 1 }, special: { every: 3, effects: [{ type: 'venomTiles', count: 1, value: 2 }] } },
  // A darting grazer: weak but wildly erratic hits (the widest act-1 spread).
  { id: 'gastrotrich', name: 'Gastrotrich', act: 1, hp: 45, damage: 6, variance: 0.5, attackEvery: 1 },
  // Act 2: the reef.
  { id: 'hydroid', name: 'Hydroid', act: 2, hp: 55, damage: 8, variance: 0.25, attackEvery: 1, traits: { hunger: 1 } },
  // Cracked tiles (variety wave step 4): every second turn the swarm eats two tiles (the gate measured every third
  // never firing against a strong player: the swarm dies in 2.5 turns). Turns 3 because the end of the turn it lands
  // on already ticks once (as a lock does): the player sees 2, then 1, then the tile crumbles.
  { id: 'diatom-swarm', name: 'Diatom Swarm', act: 2, hp: 70, damage: 6, variance: 0.5, attackEvery: 1, traits: { armour: 4 }, special: { every: 2, effects: [{ type: 'crackTiles', count: 2, turns: 3 }] } },
  { id: 'anemone', name: 'Anemone', act: 2, hp: 60, damage: 13, variance: 0.15, attackEvery: 2, special: { every: 2, effects: [{ type: 'venomTiles', count: 1, value: 2 }] } },
  { id: 'nudibranch', name: 'Nudibranch', act: 2, hp: 50, damage: 9, variance: 0.3, attackEvery: 1, special: { every: 4, effects: [{ type: 'scramble' }] } },
  // Challenge wave additions.
  // Demander: a coral polyp that only opens for a real word. Words under 6 letters deal half. Medium, act 2.
  { id: 'zoanthid', name: 'Zoanthid', act: 2, hp: 68, damage: 8, variance: 0.2, attackEvery: 1, traits: { resist: { when: { kind: 'minLength', value: 6 }, factor: 0.5 } } },
  // A sponge that regrows what you tear off (regen, new to act 2).
  { id: 'sponge', name: 'Sponge', act: 2, hp: 64, damage: 7, variance: 0.25, attackEvery: 1, traits: { regen: 2 } },
  // Clamps tiles shut: a lock special without the boss (no venom on it, so no lock-and-venom clash).
  { id: 'barnacle', name: 'Barnacle', act: 2, hp: 62, damage: 8, variance: 0.2, attackEvery: 1, special: { every: 3, effects: [{ type: 'lockTiles', count: 2, turns: 2 }] } },
  // An ambush striker that grows: a slow heavy hit that gets heavier (hunger and heavy-slow together).
  { id: 'mantis-shrimp', name: 'Mantis Shrimp', act: 2, hp: 54, damage: 13, variance: 0.15, attackEvery: 2, traits: { hunger: 1 } },
  // Act 3: the deep.
  { id: 'lamprey', name: 'Lamprey', act: 3, hp: 60, damage: 10, variance: 0.35, attackEvery: 1, traits: { hunger: 2 } },
  { id: 'siphonophore', name: 'Siphonophore', act: 3, hp: 80, damage: 7, variance: 0.2, attackEvery: 1, traits: { regen: 3 } },
  { id: 'tardigrade-king', name: 'Tardigrade King', act: 3, hp: 75, damage: 9, variance: 0.3, attackEvery: 1, traits: { armour: 5 } },
  { id: 'cuttle', name: 'Cuttle', act: 3, hp: 55, damage: 16, variance: 0.1, attackEvery: 2, special: { every: 3, effects: [{ type: 'lockTiles', count: 2, turns: 2 }] } },
  // Challenge wave additions.
  // Demander: it dangles a lure and only a long word takes the bait. Words under 7 letters deal half. Hard, act 3.
  { id: 'anglerfish', name: 'Anglerfish', act: 3, hp: 78, damage: 9, variance: 0.2, attackEvery: 1, traits: { resist: { when: { kind: 'minLength', value: 7 }, factor: 0.5 } } },
  // Plated and slowly knitting itself back: armour and regen together (the boss's pair, lighter).
  { id: 'giant-isopod', name: 'Giant Isopod', act: 3, hp: 74, damage: 8, variance: 0.2, attackEvery: 1, traits: { armour: 4, regen: 1 } },
  // A hungry biter that spits venom on the grid (hunger and a venom tile, a fresh act-3 combo).
  { id: 'viperfish', name: 'Viperfish', act: 3, hp: 62, damage: 9, variance: 0.3, attackEvery: 1, traits: { hunger: 1 }, special: { every: 3, effects: [{ type: 'venomTiles', count: 1, value: 2 }] } },
  // Turns itself inside out and hits like a wall: a scramble special with a slow heavy hit.
  { id: 'vampire-squid', name: 'Vampire Squid', act: 3, hp: 64, damage: 13, variance: 0.2, attackEvery: 2, special: { every: 3, effects: [{ type: 'scramble' }] } },
];
