import type { Content } from '../engine/types';
import { ENCOUNTERS, PLAYER_MAX_HP } from './acts';
import { BOSSES } from './bosses';
import { ENEMIES } from './enemies';
import { ITEMS } from './items';

export const CONTENT: Content = {
  items: ITEMS,
  enemies: ENEMIES,
  bosses: BOSSES,
  encounters: ENCOUNTERS,
  playerMaxHp: PLAYER_MAX_HP,
};
