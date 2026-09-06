/**
 * Named content variants for A/B tuning in the sim. Each is a pure transform
 * of the shipped CONTENT. When Dean picks one, its numbers move into
 * src/content and the variant here becomes `base`.
 */
import type { Content } from '../../src/engine/types';

export type VariantName = 'base' | 'act1-ease' | 'starting-kit' | 'both';
export const VARIANT_NAMES: readonly VariantName[] = ['base', 'act1-ease', 'starting-kit', 'both'];

/** Variant A (Dean, 2026-09-06): ease act 1 only. E1 dmg x0.5 hp x0.7, E2 dmg x0.7, first boss hp x0.7 dmg x0.7. */
export function act1Ease(content: Content): Content {
  const scale = [
    { hp: 0.7, dmg: 0.5 },
    { hp: 1.0, dmg: 0.7 },
    { hp: 0.7, dmg: 0.7 },
  ];
  return {
    ...content,
    encounters: content.encounters.map((e, i) => {
      const k = scale[i];
      return k ? { ...e, hpScale: e.hpScale * k.hp, damageScale: e.damageScale * k.dmg } : e;
    }),
  };
}

/** Variant B (Dean, 2026-09-06): act 1 untouched, the player picks 1 of 3 items before E1. */
export function startingKit(content: Content): Content {
  return { ...content, tuning: { ...content.tuning, startingPicks: 1 } };
}

export function applyVariant(name: VariantName, content: Content): Content {
  switch (name) {
    case 'base':
      return content;
    case 'act1-ease':
      return act1Ease(content);
    case 'starting-kit':
      return startingKit(content);
    case 'both':
      return startingKit(act1Ease(content));
  }
}
