import { CONTENT } from '../content/index';
import type { Capability, CapabilityDef, EnemyDef, ItemDef, TraitDef } from '../engine/types';

// State carries content by id only (engine contract); the UI resolves names here.
const enemies = new Map<string, EnemyDef>([...CONTENT.enemies, ...CONTENT.bosses].map((e) => [e.id, e]));
const items = new Map<string, ItemDef>(CONTENT.items.map((i) => [i.id, i]));
const traits = new Map<string, TraitDef>(CONTENT.traits.map((t) => [t.id, t]));
const capabilities = new Map<string, CapabilityDef>(CONTENT.capabilities.map((c) => [c.id, c]));

/** A trait by id; an id content no longer has renders as its id with no text, like an unknown item. */
export function traitDef(id: string): TraitDef {
  return traits.get(id) ?? { id, name: id, description: '', flavor: '', hooks: {} };
}

/** A capability by id (evolution track, v11); an unknown id renders as its id with no text. */
export function capabilityDef(id: string): CapabilityDef {
  return capabilities.get(id) ?? { id: id as Capability, name: id, description: '', flavor: '' };
}

export function enemyName(id: string): string {
  return enemies.get(id)?.name ?? id;
}

export function itemDef(id: string): ItemDef {
  return items.get(id) ?? { id, name: id, rarity: 'common', description: '', flavor: '', hooks: {} };
}
