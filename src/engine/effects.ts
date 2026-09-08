/**
 * The closed effect vocabulary. Items, enemies, and bosses are data that
 * compose these; nothing else. Adding a variant here is an engine change and
 * gets reviewed as one (CLAUDE.md). Do not special-case an item elsewhere.
 *
 * Which hook an effect is meaningful in:
 *   addFlat, addMult, letterBonus   onWordScored (scoring.ts consumes them)
 *   heal, damageEnemy, damagePlayer any hook; enemy attacks use damagePlayer
 *   reduceDamage                    onDamageTaken
 *   vowelWeight                     onTileDraw
 *   lockTiles, venomTiles, scramble enemy specials; onTurnStart
 *   condition                       any hook; gates its children
 */

export type Condition =
  | { readonly kind: 'minLength'; readonly value: number }
  | { readonly kind: 'maxLength'; readonly value: number }
  | { readonly kind: 'containsLetter'; readonly letters: string }
  | { readonly kind: 'hpBelow'; readonly fraction: number }
  | { readonly kind: 'turnEvery'; readonly value: number };

export type Effect =
  | { readonly type: 'addFlat'; readonly value: number }
  | { readonly type: 'addMult'; readonly value: number }
  | { readonly type: 'letterBonus'; readonly letters: string; readonly value: number }
  | { readonly type: 'heal'; readonly value: number }
  | { readonly type: 'damageEnemy'; readonly value: number }
  | { readonly type: 'damagePlayer'; readonly value: number }
  | { readonly type: 'reduceDamage'; readonly value: number }
  | { readonly type: 'vowelWeight'; readonly value: number }
  | { readonly type: 'lockTiles'; readonly count: number; readonly turns: number }
  /**
   * Venom `count` clean, unlocked, unselected tiles at `value`; each bites at turn start and grows by one
   * until spent (Dean, 2026-09-08). Do not give one enemy both lockTiles and venomTiles: a locked venomed
   * tile has no cure (shuffle skips locked tiles), and lockTiles clears the selection while venomTiles does not.
   */
  | { readonly type: 'venomTiles'; readonly count: number; readonly value: number }
  | { readonly type: 'scramble' }
  | { readonly type: 'condition'; readonly when: Condition; readonly then: readonly Effect[] };

export type EffectType = Effect['type'];

/** Fixed application order. Scoring first, then defence, then damage, then healing, then grid. */
export const EFFECT_ORDER: readonly EffectType[] = [
  'addFlat',
  'letterBonus',
  'addMult',
  'reduceDamage',
  'damageEnemy',
  'damagePlayer',
  'heal',
  'lockTiles',
  'venomTiles',
  'scramble',
  'vowelWeight',
  'condition',
];

/** What a condition can see. Fields absent outside their hook (no word at turn start). */
export interface ConditionContext {
  readonly word?: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly turn: number;
}

export function evaluateCondition(c: Condition, ctx: ConditionContext): boolean {
  switch (c.kind) {
    case 'minLength':
      return ctx.word !== undefined && ctx.word.length >= c.value;
    case 'maxLength':
      return ctx.word !== undefined && ctx.word.length <= c.value;
    case 'containsLetter': {
      if (ctx.word === undefined) return false;
      for (let i = 0; i < c.letters.length; i++) if (ctx.word.includes(c.letters.charAt(i))) return true;
      return false;
    }
    case 'hpBelow':
      return ctx.hp < ctx.maxHp * c.fraction;
    case 'turnEvery':
      return c.value > 0 && ctx.turn % c.value === 0;
  }
}

/**
 * Flatten a list of effects: resolve conditions against the context, dropping
 * the ones that fail and splicing in the children of the ones that pass. Then
 * stable-sort by EFFECT_ORDER so application order never depends on item
 * order or on how an item author nested things.
 */
export function resolveEffects(effects: readonly Effect[], ctx: ConditionContext): Effect[] {
  const flat: Effect[] = [];
  const walk = (list: readonly Effect[]) => {
    for (const e of list) {
      if (e.type === 'condition') {
        if (evaluateCondition(e.when, ctx)) walk(e.then);
      } else {
        flat.push(e);
      }
    }
  };
  walk(effects);
  const rank = (e: Effect) => EFFECT_ORDER.indexOf(e.type);
  return flat
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map(({ e }) => e);
}
