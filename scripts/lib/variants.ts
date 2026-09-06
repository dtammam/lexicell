/**
 * Named content variants for A/B tuning in the sim. Each is a pure transform
 * of the shipped CONTENT. When Dean picks one, its numbers move into
 * src/content and the variant here becomes `base`.
 */
import type { Content } from '../../src/engine/types';

export type VariantName = 'base' | 'pre-act1';
export const VARIANT_NAMES: readonly VariantName[] = ['base', 'pre-act1'];

/**
 * The content as it was before the act-1 wave (2026-09-06): no starting kit,
 * act 1 at full strength. Kept so the baseline table stays reproducible.
 */
export function preAct1(content: Content): Content {
  const restore = [
    { hp: 1.0, dmg: 1.0 },
    { hp: 1.3, dmg: 1.2 },
    { hp: 1.0, dmg: 1.2 },
  ];
  return {
    ...content,
    tuning: { ...content.tuning, startingPicks: 0 },
    encounters: content.encounters.map((e, i) => {
      const k = restore[i];
      return k ? { ...e, hpScale: k.hp, damageScale: k.dmg } : e;
    }),
  };
}

export function applyVariant(name: VariantName, content: Content): Content {
  switch (name) {
    case 'base':
      return content;
    case 'pre-act1':
      return preAct1(content);
  }
}
