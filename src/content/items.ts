/**
 * Phase 0 placeholder items. Ten items across five hooks and eight effect
 * types: enough to prove the hook system moves the sim, not to be balanced.
 * Rarity weights: see RARITY_WEIGHT.
 */
import type { ItemDef, Rarity } from '../engine/types';

export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = { common: 3, uncommon: 2, rare: 1 };

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'sharp-pen',
    name: 'Sharp Pen',
    rarity: 'common',
    description: '+5 damage on every word.',
    hooks: { onWordScored: [{ type: 'addFlat', value: 5 }] },
  },
  {
    id: 'lens',
    name: 'Lens',
    rarity: 'uncommon',
    description: '+50% damage.',
    hooks: { onWordScored: [{ type: 'addMult', value: 0.5 }] },
  },
  {
    id: 'long-fuse',
    name: 'Long Fuse',
    rarity: 'rare',
    description: 'Words of 6+ letters deal double damage.',
    hooks: {
      onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 6 }, then: [{ type: 'addMult', value: 1 }] }],
    },
  },
  {
    id: 'vowel-magnet',
    name: 'Vowel Magnet',
    rarity: 'common',
    description: 'Vowels are drawn 50% more often.',
    hooks: { onTileDraw: [{ type: 'vowelWeight', value: 1.5 }] },
  },
  {
    id: 'bandage',
    name: 'Bandage',
    rarity: 'common',
    description: 'Heal 15 after each encounter.',
    hooks: { onEncounterEnd: [{ type: 'heal', value: 15 }] },
  },
  {
    id: 'thick-skin',
    name: 'Thick Skin',
    rarity: 'uncommon',
    description: 'Take 3 less damage from every hit.',
    hooks: { onDamageTaken: [{ type: 'reduceDamage', value: 3 }] },
  },
  {
    id: 'rare-ink',
    name: 'Rare Ink',
    rarity: 'uncommon',
    description: 'J, Q, X and Z are worth +8 each.',
    hooks: { onWordScored: [{ type: 'letterBonus', letters: 'jqxz', value: 8 }] },
  },
  {
    id: 'leech',
    name: 'Leech',
    rarity: 'uncommon',
    description: 'Heal 3 on every word of 5+ letters.',
    hooks: {
      onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 5 }, then: [{ type: 'heal', value: 3 }] }],
    },
  },
  {
    id: 'spores',
    name: 'Spores',
    rarity: 'common',
    description: 'Deal 4 damage to the enemy at the start of each turn.',
    hooks: { onTurnStart: [{ type: 'damageEnemy', value: 4 }] },
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    rarity: 'rare',
    description: 'While below 30% HP, heal 6 whenever you take damage.',
    hooks: {
      onDamageTaken: [{ type: 'condition', when: { kind: 'hpBelow', fraction: 0.3 }, then: [{ type: 'heal', value: 6 }] }],
    },
  },
];
