/**
 * Hook dispatch: at each hook, gather the effects contributed by the player's
 * items and return them resolved (conditions evaluated, fixed order applied).
 *
 * Order of operations, always:
 *   1. Items contribute in acquisition order (player.items).
 *   2. Conditions are evaluated against the hook's context.
 *   3. The flat list is stable-sorted by EFFECT_ORDER (effects.ts).
 * So two items with addMult still sum in acquisition order (irrelevant for
 * addition, relevant for anything order-sensitive later), and flat always
 * precedes mult no matter which item was picked first.
 *
 * Applying the effects is the reducer's job. This module only decides *what*.
 */
import { resolveEffects, type ConditionContext, type Effect } from './effects';
import type { CellDef, Content, Hook, ItemDef, TraitDef } from './types';

export function itemDef(content: Content, id: string): ItemDef {
  const def = content.items.find((i) => i.id === id);
  if (!def) throw new Error(`unknown item id ${JSON.stringify(id)}`);
  return def;
}

export function cellDef(content: Content, id: string): CellDef {
  const def = content.cells.find((c) => c.id === id);
  if (!def) throw new Error(`unknown cell id ${JSON.stringify(id)}`);
  return def;
}

export function traitDef(content: Content, id: string): TraitDef {
  const def = content.traits.find((t) => t.id === id);
  if (!def) throw new Error(`unknown trait id ${JSON.stringify(id)}`);
  return def;
}

/**
 * Raw (unresolved) effects for a hook: the starting cell's traits first (it is the item held
 * before every other), then the evolution traits in pick order (variety wave step 3), then the
 * items in acquisition order. That order is load-bearing for order-sensitive verbs (reduceDamage
 * clamps between entries).
 */
export function gatherEffects(hook: Hook, itemIds: readonly string[], content: Content, cellId?: string, traitIds: readonly string[] = []): Effect[] {
  const out: Effect[] = [];
  if (cellId !== undefined) {
    const traits = cellDef(content, cellId).traits[hook];
    if (traits) out.push(...traits);
  }
  for (const id of traitIds) {
    const contributed = traitDef(content, id).hooks[hook];
    if (contributed) out.push(...contributed);
  }
  for (const id of itemIds) {
    const contributed = itemDef(content, id).hooks[hook];
    if (contributed) out.push(...contributed);
  }
  return out;
}

/** Resolved effects for a hook: conditions evaluated, EFFECT_ORDER applied. */
export function collectEffects(hook: Hook, itemIds: readonly string[], content: Content, ctx: ConditionContext, cellId?: string, traitIds: readonly string[] = []): Effect[] {
  return resolveEffects(gatherEffects(hook, itemIds, content, cellId, traitIds), ctx);
}
