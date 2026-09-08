/**
 * Placeholder items, named for the cell that carries them (Dean, 2026-09-08: word and
 * evolution themed, not generic). Ten items across five hooks and eight effect types:
 * enough to prove the hook system moves the sim, not to be balanced. Ids are stable; only
 * names and descriptions change, so saves and tests keyed by id survive renames.
 * Rarity weights: see RARITY_WEIGHT.
 */
import type { ItemDef, Rarity } from '../engine/types';

export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = { common: 3, uncommon: 2, rare: 1 };

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'sharp-pen',
    name: 'Flagellum',
    rarity: 'common',
    description: '+5 damage on every word. A lash behind every syllable.',
    hooks: { onWordScored: [{ type: 'addFlat', value: 5 }] },
  },
  {
    id: 'lens',
    name: 'Photoreceptor',
    rarity: 'uncommon',
    description: '+50% damage. It sees where the weak spot is.',
    hooks: { onWordScored: [{ type: 'addMult', value: 0.5 }] },
  },
  {
    id: 'long-fuse',
    name: 'Ribosome',
    rarity: 'rare',
    description: 'Words of 6+ letters deal double damage. Long chains, long proteins.',
    hooks: {
      onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 6 }, then: [{ type: 'addMult', value: 1 }] }],
    },
  },
  {
    id: 'vowel-magnet',
    name: 'Vacuole',
    rarity: 'common',
    description: 'Vowels are drawn 50% more often. It stores what you keep running out of.',
    hooks: { onTileDraw: [{ type: 'vowelWeight', value: 1.5 }] },
  },
  {
    id: 'bandage',
    name: 'Mitosis',
    rarity: 'common',
    description: 'Heal 15 after each encounter. Split, recover, continue.',
    hooks: { onEncounterEnd: [{ type: 'heal', value: 15 }] },
  },
  {
    id: 'thick-skin',
    name: 'Membrane',
    rarity: 'uncommon',
    description: 'Take 3 less damage from every hit. Thicker than it looks.',
    hooks: { onDamageTaken: [{ type: 'reduceDamage', value: 3 }] },
  },
  {
    id: 'rare-ink',
    name: 'Enzyme',
    rarity: 'uncommon',
    description: 'J, Q, X and Z are worth +8 each. It catalyses the awkward letters.',
    hooks: { onWordScored: [{ type: 'letterBonus', letters: 'jqxz', value: 8 }] },
  },
  {
    id: 'leech',
    name: 'Cilia',
    rarity: 'uncommon',
    description: 'Heal 3 on every word of 5+ letters. Every long word sweeps in a little life.',
    hooks: {
      onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 5 }, then: [{ type: 'heal', value: 3 }] }],
    },
  },
  {
    id: 'spores',
    name: 'Spores',
    rarity: 'common',
    description: 'Deal 4 damage to the enemy at the start of each turn. They drift, they land, they burn.',
    hooks: { onTurnStart: [{ type: 'damageEnemy', value: 4 }] },
  },
  {
    id: 'second-wind',
    name: 'Cyst',
    rarity: 'rare',
    description: 'While below 30% HP, heal 6 whenever you take damage. Harden when it hurts.',
    hooks: {
      onDamageTaken: [{ type: 'condition', when: { kind: 'hpBelow', fraction: 0.3 }, then: [{ type: 'heal', value: 6 }] }],
    },
  },
];
