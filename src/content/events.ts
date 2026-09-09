/**
 * Events (variety wave step 2, Dean's answer 3): a small forced trade between fights. One slot
 * per run holds one of these, drawn by the seed. The first choice is the trade, the last walks
 * away; a trade never kills (the reducer floors HP at 1). Effects are the item vocabulary,
 * player-side only, and apply in EFFECT_ORDER like an item's (damagePlayer before maxHp before heal),
 * whatever order the label reads in. Keep the text short: it is read on a phone in DotGothic16 at 16px.
 */
import type { EventDef } from '../engine/types';

export const EVENTS: readonly EventDef[] = [
  {
    id: 'warm-current',
    name: 'Warm Current',
    text: 'A slow warm current runs through the pond. Bask in it and something in you softens.',
    choices: [
      { label: 'Bask: heal 35, max HP -10', effects: [{ type: 'heal', value: 35 }, { type: 'maxHp', value: -10 }] },
      { label: 'Drift on', effects: [] },
    ],
  },
  {
    id: 'dead-whale',
    name: 'Fallen Giant',
    text: 'Something enormous has died above you and its bulk drifts down. It is rich, and it is rotting.',
    choices: [
      { label: 'Feed: max HP +15, take 20', effects: [{ type: 'maxHp', value: 15 }, { type: 'damagePlayer', value: 20 }] },
      { label: 'Leave it', effects: [] },
    ],
  },
  {
    id: 'thermal-vent',
    name: 'Thermal Vent',
    text: 'A crack in the floor breathes heat and minerals. Cells that live here grow thick.',
    choices: [
      { label: 'Brave it: max HP +20, take 30', effects: [{ type: 'maxHp', value: 20 }, { type: 'damagePlayer', value: 30 }] },
      { label: 'Back away', effects: [] },
    ],
  },
  {
    id: 'symbiont',
    name: 'Symbiont',
    text: 'A smaller cell asks to live inside you. It would wrap you in a coat of its own. It would eat, too.',
    choices: [
      { label: 'Let it in: shield 25, max HP -5', effects: [{ type: 'shield', value: 25 }, { type: 'maxHp', value: -5 }] },
      { label: 'Refuse', effects: [] },
    ],
  },
  {
    id: 'eddy',
    name: 'Eddy',
    text: 'The water spins here. Ride it and the letters around you will change faster than you can read.',
    choices: [
      { label: 'Ride it: 2 free shuffles, take 10', effects: [{ type: 'freeShuffle', value: 2 }, { type: 'damagePlayer', value: 10 }] },
      { label: 'Hold still', effects: [] },
    ],
  },
  {
    id: 'molt',
    name: 'Molt',
    text: 'Your membrane is tired. Shed it and the new one heals clean, but you will never be quite as big.',
    choices: [
      { label: 'Shed: heal 50, max HP -15', effects: [{ type: 'heal', value: 50 }, { type: 'maxHp', value: -15 }] },
      { label: 'Keep it', effects: [] },
    ],
  },
  {
    id: 'spore-bank',
    name: 'Spore Bank',
    text: 'A crust of dormant spores. One of them is something rare. Digging costs skin.',
    choices: [
      { label: 'Dig: take 15, a rare among three', effects: [{ type: 'damagePlayer', value: 15 }], rarePick: true },
      { label: 'Pass', effects: [] },
    ],
  },
  {
    id: 'lantern',
    name: 'Lantern',
    text: 'A light in the dark water. Whatever holds it wants to be followed. Following is easier than not.',
    choices: [
      { label: 'Follow: heal 20, 1 free shuffle, max HP -10', effects: [{ type: 'heal', value: 20 }, { type: 'freeShuffle', value: 1 }, { type: 'maxHp', value: -10 }] },
      { label: 'Stay', effects: [] },
    ],
  },
];
