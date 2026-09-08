import { CONTENT } from '../content/index';
import type { EnemyDef, ItemDef } from '../engine/types';

// State carries content by id only (engine contract); the UI resolves names here.
const enemies = new Map<string, EnemyDef>([...CONTENT.enemies, ...CONTENT.bosses].map((e) => [e.id, e]));
const items = new Map<string, ItemDef>(CONTENT.items.map((i) => [i.id, i]));

export function enemyName(id: string): string {
  return enemies.get(id)?.name ?? id;
}

export function itemDef(id: string): ItemDef {
  return items.get(id) ?? { id, name: id, rarity: 'common', description: '', hooks: {} };
}
