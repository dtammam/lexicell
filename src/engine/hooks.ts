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
import type { CapabilityDef, CellDef, Content, Hook, ItemDef, TraitDef } from './types';

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

export function capabilityDef(content: Content, id: string): CapabilityDef {
  const def = content.capabilities.find((c) => c.id === id);
  if (!def) throw new Error(`unknown capability id ${JSON.stringify(id)}`);
  return def;
}

/**
 * Raw (unresolved) effects for a hook, gathered in a FIXED order that is part of the run's
 * determinism (order is load-bearing for order-sensitive verbs, e.g. reduceDamage clamps between
 * entries). The order:
 *   1. the starting cell's traits (it is the item held before every other),
 *   2. the evolution traits in pick order (variety wave step 3),
 *   3. the items in acquisition order,
 *   4. the passive capabilities in pick order (more-capabilities wave, 2026-09-21).
 * Capabilities come LAST, after the items: the three verb capabilities carry no hooks, so a run that
 * never gains a PASSIVE capability contributes nothing here and stays byte-identical to before this wave.
 */
export function gatherEffects(hook: Hook, itemIds: readonly string[], content: Content, cellId?: string, traitIds: readonly string[] = [], capIds: readonly string[] = []): Effect[] {
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
  for (const id of capIds) {
    const contributed = capabilityDef(content, id).hooks?.[hook];
    if (contributed) out.push(...contributed);
  }
  return out;
}

/** Resolved effects for a hook: conditions evaluated, EFFECT_ORDER applied. */
export function collectEffects(hook: Hook, itemIds: readonly string[], content: Content, ctx: ConditionContext, cellId?: string, traitIds: readonly string[] = [], capIds: readonly string[] = []): Effect[] {
  return resolveEffects(gatherEffects(hook, itemIds, content, cellId, traitIds, capIds), ctx);
}
