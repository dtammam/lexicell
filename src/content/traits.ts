/**
 * Evolution traits (variety wave step 3, Dean's answer 4): after each boss but the last, three
 * of these are offered and one is kept for the run. Item hooks, no rarity, no place in the item
 * pool; a trait is a permanent part of the body, so each is one clear, always-on idea. Gathered
 * after the starting cell and before the items in every hook.
 */
import type { TraitDef } from '../engine/types';

export const TRAITS: readonly TraitDef[] = [
  { id: 'thick-membrane', name: 'Thick Membrane', description: 'Every hit you take does 2 less.', flavor: 'Two layers where there was one.', hooks: { onDamageTaken: [{ type: 'reduceDamage', value: 2 }] } },
  { id: 'predatory', name: 'Predatory', description: '+15% damage on every word.', flavor: 'Something in you has started to hunt.', hooks: { onWordScored: [{ type: 'addMult', value: 0.15 }] } },
  { id: 'long-reach', name: 'Long Reach', description: 'Words of 6+ letters deal +40%.', flavor: 'You can hold more of the pond at once.', hooks: { onWordScored: [{ type: 'condition', when: { kind: 'minLength', value: 6 }, then: [{ type: 'addMult', value: 0.4 }] }] } },
  { id: 'regenerative', name: 'Regenerative', description: 'Heal 2 at the start of every turn.', flavor: 'Torn, and then not.', hooks: { onTurnStart: [{ type: 'heal', value: 2 }] } },
  { id: 'venom-glands', name: 'Venom Glands', description: 'Every word poisons the enemy for 2.', flavor: 'Your words leave a taste.', hooks: { onWordScored: [{ type: 'poisonEnemy', value: 2 }] } },
  { id: 'chitin-shell', name: 'Chitin Shell', description: 'After each fight, gain 10 shield.', flavor: 'Hardened between the blows.', hooks: { onEncounterEnd: [{ type: 'shield', value: 10 }] } },
  { id: 'photosynthesis', name: 'Photosynthesis', description: 'After each fight, heal 12.', flavor: 'A little light goes a long way.', hooks: { onEncounterEnd: [{ type: 'heal', value: 12 }] } },
  { id: 'fast-twitch', name: 'Fast Twitch', description: 'After each fight, gain a free shuffle.', flavor: 'The water moves and you have already moved.', hooks: { onEncounterEnd: [{ type: 'freeShuffle', value: 1 }] } },
  { id: 'vowel-sense', name: 'Vowel Sense', description: 'Vowels are drawn more often; +3 on every word.', flavor: 'You can smell an E from here.', hooks: { onTileDraw: [{ type: 'vowelWeight', value: 1.2 }], onWordScored: [{ type: 'addFlat', value: 3 }] } },
  { id: 'rare-taste', name: 'Rare Taste', description: 'J, Q, X and Z are drawn more often and score +6 each.', flavor: 'The hard letters are the sweet ones.', hooks: { onTileDraw: [{ type: 'letterWeight', letters: 'jqxz', value: 1.5 }], onWordScored: [{ type: 'letterBonus', letters: 'jqxz', value: 6 }] } },
  { id: 'adrenal', name: 'Adrenal', description: 'Below 40% HP, +50% damage.', flavor: 'Fear, made useful.', hooks: { onWordScored: [{ type: 'condition', when: { kind: 'hpBelow', fraction: 0.4 }, then: [{ type: 'addMult', value: 0.5 }] }] } },
  { id: 'colonial', name: 'Colonial', description: '+5% damage per organelle you carry.', flavor: 'Many small hands.', hooks: { onWordScored: [{ type: 'perUnit', unit: 'item', then: [{ type: 'addMult', value: 0.05 }] }] } },
];
