/**
 * Evolution capabilities: offered after each boss alongside the trait, one kept for the run. There are
 * two kinds. The first three (wildcard, transmute, letter-bank; v11 marquee wave) are new VERBS of play,
 * whose behaviour is first-class engine logic keyed by the id and who carry no hooks. The rest
 * (more-capabilities wave, 2026-09-21) are PASSIVE: pure declarative `hooks`, exactly like a TraitDef,
 * gathered through collectEffects. They exist to deepen the pool so the post-boss offer (now a random
 * draw of up to three unheld caps) makes the strong verbs a minority rather than a guaranteed grab.
 * This file is only display text, hooks and the offer pool; the ids are the engine's `Capability` union
 * (src/engine/types.ts). Numbers here were set by `npm run sim` against the exit criteria, never by feel.
 */
import type { CapabilityDef } from '../engine/types';

export const CAPABILITIES: readonly CapabilityDef[] = [
  {
    id: 'wildcard',
    name: 'Wildcard',
    description: 'Each fight starts with a wildcard tile: it counts as any letter, filling in the best word, until you play it.',
    flavor: 'A limb that becomes whatever the moment needs.',
  },
  {
    id: 'transmute',
    name: 'Transmute',
    description: 'Once per fight, turn a tile into a rare high-value letter.',
    flavor: 'You learned to make the hard letters, not just find them.',
  },
  {
    id: 'letter-bank',
    name: 'Letter Bank',
    description: 'Store one tile’s letter, then spend it later to add that letter to a word for scoring.',
    flavor: 'A pocket in the membrane, holding a letter for when it is wanted.',
  },
  {
    id: 'osmosis',
    name: 'Osmosis',
    description: 'Heal for 12% of the damage each word deals.',
    flavor: 'What you take in, you keep.',
    hooks: { onWordScored: [{ type: 'lifesteal', fraction: 0.12 }] },
  },
  {
    id: 'chitin',
    name: 'Chitin',
    description: 'Every hit you take does 5 less.',
    flavor: 'A harder shell than the one you were born in.',
    hooks: { onDamageTaken: [{ type: 'reduceDamage', value: 5 }] },
  },
  {
    id: 'catalyst',
    name: 'Catalyst',
    description: 'Each rare letter in a word adds 5 damage.',
    flavor: 'The hard letters spark something in you.',
    hooks: { onWordScored: [{ type: 'perUnit', unit: 'rareLetter', then: [{ type: 'addFlat', value: 5 }] }] },
  },
  {
    id: 'mitosis',
    name: 'Mitosis',
    description: 'Gain a free shuffle at the start of every turn.',
    flavor: 'One of you becomes two, over and over.',
    hooks: { onTurnStart: [{ type: 'freeShuffle', value: 1 }] },
  },
  {
    id: 'vesicle',
    name: 'Vesicle',
    description: 'Words of 5 or fewer letters heal you 5.',
    flavor: 'A little sac that gives back what the small things carry.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'maxLength', value: 5 }, then: [{ type: 'heal', value: 5 }] }] },
  },
  {
    id: 'cilia',
    name: 'Cilia',
    description: 'Words of 5 or fewer letters deal 8 more damage.',
    flavor: 'A hundred small strokes, each one counting.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'maxLength', value: 5 }, then: [{ type: 'addFlat', value: 8 }] }] },
  },
  {
    id: 'vacuole',
    name: 'Vacuole',
    description: 'Every word poisons the enemy for 2.',
    flavor: 'You store the sting and let it seep out slowly.',
    hooks: { onWordScored: [{ type: 'poisonEnemy', value: 2 }] },
  },
  {
    id: 'spines',
    name: 'Spines',
    description: 'When you take a hit, the enemy takes 5 back.',
    flavor: 'Touch me and learn why not.',
    hooks: { onDamageTaken: [{ type: 'damageEnemy', value: 5 }] },
  },
  {
    id: 'elongation',
    name: 'Elongation',
    description: 'Words of 6 or more letters deal +15%.',
    flavor: 'You can reach further across the pond than you could.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 6 }, then: [{ type: 'addMult', value: 0.15 }] }] },
  },
  {
    id: 'first-contact',
    name: 'First Contact',
    description: 'Your first word of every fight deals +10 damage.',
    flavor: 'You strike before the thing across from you knows you are there.',
    hooks: { onWordScored: [{ type: 'condition', when: { kind: 'firstTurn' }, then: [{ type: 'addFlat', value: 10 }] }] },
  },
];
