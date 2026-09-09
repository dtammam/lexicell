import type { Content } from '../engine/types';
import { ENCOUNTERS, PLAYER_MAX_HP, TUNING } from './acts';
import { BOSSES } from './bosses';
import { CELLS } from './cells';
import { ENEMIES } from './enemies';
import { EVENTS } from './events';
import { ITEMS } from './items';
import { TRAITS } from './traits';

export const CONTENT: Content = {
  items: ITEMS,
  cells: CELLS,
  enemies: ENEMIES,
  bosses: BOSSES,
  encounters: ENCOUNTERS,
  events: EVENTS,
  traits: TRAITS,
  playerMaxHp: PLAYER_MAX_HP,
  tuning: TUNING,
};
