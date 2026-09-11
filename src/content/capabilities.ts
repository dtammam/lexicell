/**
 * Evolution capabilities (v11, marquee wave): offered after each boss alongside the trait, one kept
 * for the run. Unlike traits (which are item hooks), a capability is a new VERB of play, so its
 * behaviour is first-class engine logic keyed by the id; this file is only the display text and the
 * offer pool. The three ids are the engine's `Capability` union (src/engine/types.ts). Ordered as
 * they are offered (fixed content order, no RNG); the first boss offers all three.
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
];
