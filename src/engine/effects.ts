/**
 * The closed effect vocabulary. Items, enemies, and bosses are data that
 * compose these; nothing else. Adding a variant here is an engine change and
 * gets reviewed as one (CLAUDE.md). Do not special-case an item elsewhere.
 *
 * Which hook an effect is meaningful in:
 *   addFlat, addMult, letterBonus   onWordScored (scoring.ts consumes them)
 *   heal, damageEnemy, damagePlayer any hook; enemy attacks use damagePlayer
 *   lifesteal                       onWordScored (a fraction of the damage just dealt)
 *   reduceDamage                    onDamageTaken
 *   shield, maxHp, freeShuffle      any hook, including onPick
 *   poisonEnemy, stun               any hook with an encounter (onWordScored, onTurnStart)
 *   redrawTiles                     onWordScored, onTurnStart
 *   vowelWeight, letterWeight       onTileDraw
 *   lockTiles, venomTiles, scramble enemy specials; onTurnStart
 *   condition                       any hook; gates its children
 *   perUnit                         any hook; scales its children by a count
 */

export type Condition =
  | { readonly kind: 'minLength'; readonly value: number }
  | { readonly kind: 'maxLength'; readonly value: number }
  | { readonly kind: 'containsLetter'; readonly letters: string }
  | { readonly kind: 'hpBelow'; readonly fraction: number }
  | { readonly kind: 'turnEvery'; readonly value: number }
  /** Effects wave (2026-09-08): shape-of-word and state-of-fight conditions. */
  | { readonly kind: 'startsWith'; readonly letters: string }
  | { readonly kind: 'endsWith'; readonly letters: string }
  | { readonly kind: 'uniqueLetters' }
  | { readonly kind: 'repeatLetter' }
  | { readonly kind: 'enemyHpBelow'; readonly fraction: number }
  | { readonly kind: 'minVowels'; readonly value: number }
  | { readonly kind: 'firstTurn' };

/** What perUnit can count. */
export type Unit = 'item' | 'letter' | 'vowel' | 'consonant' | 'rareLetter' | 'turn' | 'missingTenth' | 'venomedTile' | 'lockedTile';

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
  /** Gild `count` playable, unselected, plain tiles: each adds `value` damage when played (variety wave step 4). */
  | { readonly type: 'goldTiles'; readonly count: number; readonly value: number }
  /** Crack `count` playable, unselected, sound tiles: each crumbles and is refilled after `turns` turns (an enemy special). */
  | { readonly type: 'crackTiles'; readonly count: number; readonly turns: number }
  | { readonly type: 'scramble' }
  | { readonly type: 'condition'; readonly when: Condition; readonly then: readonly Effect[] }
  /* Effects wave (2026-09-08), Dean's six agrees. */
  /** Poison the enemy: it takes `value` at the next turn start, then value-1, ... down to 0. Capped by tuning.poisonMax. */
  | { readonly type: 'poisonEnemy'; readonly value: number }
  /** The enemy skips its next `value` attacks; past tuning.enrageAfter rage breaks through and it attacks anyway. */
  | { readonly type: 'stun'; readonly value: number }
  /**
   * Add `value` shield, capped by tuning.shieldMax. Shield absorbs the enemy's ATTACK before HP
   * (after reduceDamage). A special's damagePlayer and venom bites go straight to HP, as does
   * reduceDamage's absence there; no shipped enemy uses damagePlayer in a special.
   */
  | { readonly type: 'shield'; readonly value: number }
  /** Heal `fraction` of the damage the word actually dealt (capped by the enemy's remaining HP), floored. */
  | { readonly type: 'lifesteal'; readonly fraction: number }
  /** Grant `value` shuffles that do not cost the turn. */
  | { readonly type: 'freeShuffle'; readonly value: number }
  /**
   * Redraw `count` random unlocked, unselected tiles in place. A redrawn tile is a fresh tile:
   * this cures its venom, and at onTurnStart it runs before the bite.
   */
  | { readonly type: 'redrawTiles'; readonly count: number }
  /** Multiply the draw weight of each of `letters` by `value` (vowelWeight is the vowel case). */
  | { readonly type: 'letterWeight'; readonly letters: string; readonly value: number }
  /** Raise max HP by `value` and heal the same amount. */
  | { readonly type: 'maxHp'; readonly value: number }
  /**
   * Scale every child's number by the count of `unit`. A count of zero drops the children.
   * Children with nothing to scale (scramble, vowelWeight, letterWeight) are dropped at any
   * count: a perUnit is a multiplier, not a gate; use a condition for gating. The addMult
   * total contributed by every perUnit in the list is capped at tuning.perUnitMultCap.
   */
  | { readonly type: 'perUnit'; readonly unit: Unit; readonly then: readonly Effect[] };

export type EffectType = Effect['type'];

/** Fixed application order. Scoring first, then defence, then damage, then healing, then grid, then draw. */
export const EFFECT_ORDER: readonly EffectType[] = [
  'addFlat',
  'letterBonus',
  'addMult',
  'reduceDamage',
  'damageEnemy',
  'damagePlayer',
  'poisonEnemy',
  'stun',
  'maxHp',
  'heal',
  'lifesteal',
  'shield',
  'freeShuffle',
  'lockTiles',
  'venomTiles',
  'goldTiles',
  'crackTiles',
  'redrawTiles',
  'scramble',
  'vowelWeight',
  'letterWeight',
  'condition',
  'perUnit',
];

/** What a condition or a perUnit can see. Fields absent outside their hook (no word at turn start, no enemy on a pick). */
export interface ConditionContext {
  readonly word?: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly turn: number;
  /** Items carried. Defaults to 0 for callers that do not track it. */
  readonly items?: number;
  readonly enemyHp?: number;
  readonly enemyMaxHp?: number;
  readonly venomedTiles?: number;
  readonly lockedTiles?: number;
  /** tuning.perUnitMultCap. Defaults to 1.5. */
  readonly perUnitMultCap?: number;
}

const VOWELS = 'aeiou';
const RARE_LETTERS = 'kjxqz';
export const DEFAULT_PER_UNIT_MULT_CAP = 1.5;

function countChars(word: string, set: string): number {
  let n = 0;
  for (const c of word) if (set.includes(c)) n++;
  return n;
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
      // turn is 0 outside a fight (onPick): no turn, no cadence.
      return c.value > 0 && ctx.turn > 0 && ctx.turn % c.value === 0;
    case 'startsWith':
      return ctx.word !== undefined && ctx.word.length > 0 && c.letters.includes(ctx.word.charAt(0));
    case 'endsWith':
      return ctx.word !== undefined && ctx.word.length > 0 && c.letters.includes(ctx.word.charAt(ctx.word.length - 1));
    case 'uniqueLetters':
      return ctx.word !== undefined && new Set(ctx.word).size === ctx.word.length;
    case 'repeatLetter':
      return ctx.word !== undefined && new Set(ctx.word).size < ctx.word.length;
    case 'enemyHpBelow':
      return ctx.enemyHp !== undefined && ctx.enemyMaxHp !== undefined && ctx.enemyHp < ctx.enemyMaxHp * c.fraction;
    case 'minVowels':
      return ctx.word !== undefined && countChars(ctx.word, VOWELS) >= c.value;
    case 'firstTurn':
      return ctx.turn === 1;
  }
}

/** How many of `unit` the context holds. Word units are 0 outside onWordScored. */
export function unitCount(unit: Unit, ctx: ConditionContext): number {
  switch (unit) {
    case 'item':
      return ctx.items ?? 0;
    case 'letter':
      return ctx.word?.length ?? 0;
    case 'vowel':
      return ctx.word === undefined ? 0 : countChars(ctx.word, VOWELS);
    case 'consonant':
      return ctx.word === undefined ? 0 : ctx.word.length - countChars(ctx.word, VOWELS);
    case 'rareLetter':
      return ctx.word === undefined ? 0 : countChars(ctx.word, RARE_LETTERS);
    case 'turn':
      return Math.max(0, ctx.turn);
    case 'missingTenth':
      return ctx.maxHp <= 0 ? 0 : Math.floor(((ctx.maxHp - ctx.hp) / ctx.maxHp) * 10);
    case 'venomedTile':
      return ctx.venomedTiles ?? 0;
    case 'lockedTile':
      return ctx.lockedTiles ?? 0;
  }
}

/** A leaf effect with its number multiplied by `times`; addMult capped. Returns null for effects with nothing to scale. */
export function scaleEffect(e: Effect, times: number, multCap: number): Effect | null {
  switch (e.type) {
    case 'addMult':
      return { ...e, value: Math.min(multCap, e.value * times) };
    case 'addFlat':
    case 'heal':
    case 'damageEnemy':
    case 'damagePlayer':
    case 'reduceDamage':
    case 'poisonEnemy':
    case 'stun':
    case 'shield':
    case 'freeShuffle':
    case 'maxHp':
      return { ...e, value: e.value * times };
    case 'letterBonus':
      return { ...e, value: e.value * times };
    case 'lifesteal':
      return { ...e, fraction: e.fraction * times };
    case 'redrawTiles':
      return { ...e, count: e.count * times };
    case 'lockTiles':
      return { ...e, count: e.count * times };
    case 'venomTiles':
      return { ...e, count: e.count * times };
    case 'goldTiles':
    case 'crackTiles':
      return { ...e, count: e.count * times };
    case 'vowelWeight':
    case 'letterWeight':
    case 'scramble':
    case 'condition':
    case 'perUnit':
      return null;
  }
}

/**
 * Flatten a list of effects: resolve conditions against the context, dropping
 * the ones that fail and splicing in the children of the ones that pass;
 * resolve perUnit by scaling its children by the unit's count (zero drops
 * them, and so does a count of one for a child with nothing to scale). The
 * addMult that perUnits contribute in total is capped at ctx.perUnitMultCap
 * (gate W1: the first draft capped each child, and skipped the cap at count
 * one). Then stable-sort by EFFECT_ORDER so application order never depends
 * on item order or on how an item author nested things.
 */
export function resolveEffects(effects: readonly Effect[], ctx: ConditionContext): Effect[] {
  const flat: Effect[] = [];
  const scaledMult: number[] = []; // indices into flat of addMult entries that came through a perUnit
  const cap = ctx.perUnitMultCap ?? DEFAULT_PER_UNIT_MULT_CAP;
  const walk = (list: readonly Effect[], times: number, inPerUnit: boolean) => {
    for (const e of list) {
      if (e.type === 'condition') {
        if (evaluateCondition(e.when, ctx)) walk(e.then, times, inPerUnit);
      } else if (e.type === 'perUnit') {
        const n = unitCount(e.unit, ctx);
        if (n > 0) walk(e.then, times * n, true);
      } else if (!inPerUnit) {
        flat.push(e);
      } else {
        const scaled = scaleEffect(e, times, cap);
        if (!scaled) continue;
        if (scaled.type === 'addMult') scaledMult.push(flat.length);
        flat.push(scaled);
      }
    }
  };
  walk(effects, 1, false);
  // Cap the perUnit multiplier as a total, not per child: two scalers cannot stack past the cap.
  const multTotal = scaledMult.reduce((sum, i) => sum + (flat[i] as { value: number }).value, 0);
  if (multTotal > cap && multTotal > 0) {
    const shrink = cap / multTotal;
    for (const i of scaledMult) {
      const e = flat[i] as { type: 'addMult'; value: number };
      flat[i] = { ...e, value: e.value * shrink };
    }
  }
  const rank = (e: Effect) => EFFECT_ORDER.indexOf(e.type);
  return flat
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map(({ e }) => e);
}
