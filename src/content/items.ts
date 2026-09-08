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
    description: '+8 damage on every word.',
    flavor: 'A lash behind every syllable.',
    hooks: { onWordScored: [{ type: 'addFlat', value: 8 }] },
  },
  {
    id: 'lens',
    name: 'Photoreceptor',
    rarity: 'uncommon',
    description: '+70% damage.',
    flavor: 'It sees where the weak spot is.',
    hooks: { onWordScored: [{ type: 'addMult', value: 0.7 }] },
  },
  {
    id: 'long-fuse',
    name: 'Ribosome',
    rarity: 'rare',
    description: 'Words of 6+ letters deal double damage.',
    flavor: 'Long chains, long proteins.',
    hooks: {
      onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 6 }, then: [{ type: 'addMult', value: 1 }] }],
    },
  },
  {
    id: 'vowel-magnet',
    name: 'Vacuole',
    rarity: 'common',
    description: 'Vowels are drawn 80% more often.',
    flavor: 'It stores what you keep running out of.',
    hooks: { onTileDraw: [{ type: 'vowelWeight', value: 1.8 }] },
  },
  {
    id: 'bandage',
    name: 'Mitosis',
    rarity: 'common',
    description: 'Heal 20 after each encounter.',
    flavor: 'Split, recover, continue.',
    hooks: { onEncounterEnd: [{ type: 'heal', value: 20 }] },
  },
  {
    id: 'thick-skin',
    name: 'Membrane',
    rarity: 'uncommon',
    description: 'Take 4 less damage from every hit.',
    flavor: 'Thicker than it looks.',
    hooks: { onDamageTaken: [{ type: 'reduceDamage', value: 4 }] },
  },
  {
    id: 'rare-ink',
    name: 'Enzyme',
    rarity: 'uncommon',
    description: 'J, Q, X and Z are worth +10 each.',
    flavor: 'It catalyses the awkward letters.',
    hooks: { onWordScored: [{ type: 'letterBonus', letters: 'jqxz', value: 10 }] },
  },
  {
    id: 'leech',
    name: 'Cilia',
    rarity: 'uncommon',
    description: 'Heal 4 on every word of 5+ letters.',
    flavor: 'Every long word sweeps in a little life.',
    hooks: {
      onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 5 }, then: [{ type: 'heal', value: 4 }] }],
    },
  },
  {
    id: 'spores',
    name: 'Spores',
    rarity: 'common',
    description: 'Deal 6 damage to the enemy at the start of each turn.',
    flavor: 'They drift, they land, they burn.',
    hooks: { onTurnStart: [{ type: 'damageEnemy', value: 6 }] },
  },
  // Pool expansion (Dean, 2026-09-08: the first offer was always the same commons). Fourteen
  // more items from the existing vocabulary; rule-benders wait for new effect types.
  {
    id: 'lysosome',
    name: 'Lysosome',
    rarity: 'common',
    description: 'Words of 4 letters or fewer deal +10.',
    flavor: 'Small, sharp, everywhere.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'maxLength', value: 4 }, then: [{ type: 'addFlat', value: 10 }] }] },
  },
  {
    id: 'pilus',
    name: 'Pilus',
    rarity: 'common',
    description: 'Words containing S deal +8.',
    flavor: 'It grips.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'containsLetter', letters: 's' }, then: [{ type: 'addFlat', value: 8 }] }] },
  },
  {
    id: 'chloroplast',
    name: 'Chloroplast',
    rarity: 'common',
    description: 'Heal 3 at the start of every turn.',
    flavor: 'Sunlight, slowly.',
    hooks: { onTurnStart: [{ type: 'heal', value: 3 }] },
  },
  {
    id: 'cell-wall',
    name: 'Cell Wall',
    rarity: 'common',
    description: 'While below half HP, take 6 less damage from every hit.',
    flavor: 'It stiffens under stress.',
    hooks: { onDamageTaken: [{ type: 'condition', when: { kind: 'hpBelow', fraction: 0.5 }, then: [{ type: 'reduceDamage', value: 6 }] }] },
  },
  {
    id: 'nucleus',
    name: 'Nucleus',
    rarity: 'common',
    description: 'Every vowel in a word is worth +3.',
    flavor: 'The centre holds.',
    hooks: { onWordScored: [{ type: 'letterBonus', letters: 'aeiou', value: 3 }] },
  },
  {
    id: 'plasmid',
    name: 'Plasmid',
    rarity: 'common',
    description: 'Every second turn, +70% damage.',
    flavor: 'Borrowed genes, on loan.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'turnEvery', value: 2 }, then: [{ type: 'addMult', value: 0.7 }] }] },
  },
  {
    id: 'peroxisome',
    name: 'Peroxisome',
    rarity: 'uncommon',
    description: 'Words of 5+ letters deal +15.',
    flavor: 'It breaks things down.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 5 }, then: [{ type: 'addFlat', value: 15 }] }] },
  },
  {
    id: 'golgi',
    name: 'Golgi Body',
    rarity: 'uncommon',
    description: 'L, N, R, S and T are worth +4 each.',
    flavor: 'It packages the ordinary.',
    hooks: { onWordScored: [{ type: 'letterBonus', letters: 'lnrst', value: 4 }] },
  },
  {
    id: 'centriole',
    name: 'Centriole',
    rarity: 'uncommon',
    description: 'Every third turn, deal 18 damage at the start of the turn.',
    flavor: 'It pulls things apart.',
    hooks: { onTurnStart: [{ type: 'condition', when: { kind: 'turnEvery', value: 3 }, then: [{ type: 'damageEnemy', value: 18 }] }] },
  },
  {
    id: 'tentacle',
    name: 'Tentacle',
    rarity: 'common',
    description: 'Words containing J, Q, X or Z deal double damage.',
    flavor: 'Reach for the awkward ones.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'containsLetter', letters: 'jqxz' }, then: [{ type: 'addMult', value: 1 }] }] },
  },
  {
    id: 'symbiont',
    name: 'Symbiont',
    rarity: 'uncommon',
    description: 'Heal 30 after each encounter, but lose 1 HP at the start of every turn.',
    flavor: 'It eats too.',
    hooks: { onEncounterEnd: [{ type: 'heal', value: 30 }], onTurnStart: [{ type: 'damagePlayer', value: 1 }] },
  },
  {
    id: 'apex',
    name: 'Apex Membrane',
    rarity: 'rare',
    description: 'Words of 7+ letters deal triple damage.',
    flavor: 'The top of the food chain.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 7 }, then: [{ type: 'addMult', value: 2 }] }] },
  },
  {
    id: 'regeneration',
    name: 'Regeneration',
    rarity: 'rare',
    description: 'Heal 2 whenever you take damage.',
    flavor: 'It grows back.',
    hooks: { onDamageTaken: [{ type: 'heal', value: 2 }] },
  },
  {
    id: 'thin-membrane',
    name: 'Thin Membrane',
    rarity: 'rare',
    description: 'Double damage, but every hit you take hurts 4 more.',
    flavor: 'Nothing between you and the world.',
    hooks: { onWordScored: [{ type: 'addMult', value: 1 }], onDamageTaken: [{ type: 'damagePlayer', value: 4 }] },
  },
  {
    id: 'second-wind',
    name: 'Cyst',
    rarity: 'rare',
    description: 'While below 30% HP, heal 4 whenever you take damage.',
    flavor: 'Harden when it hurts.',
    hooks: {
      onDamageTaken: [{ type: 'condition', when: { kind: 'hpBelow', fraction: 0.3 }, then: [{ type: 'heal', value: 4 }] }],
    },
  },
];
