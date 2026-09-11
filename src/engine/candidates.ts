/**
 * Every playable word on the current grid with the damage it would deal
 * under the player's current items, the gold it can pick up (step 4: the best gold tiles its
 * letters can use, and candidateIndices picks exactly those) and this enemy's armour (variety
 * wave gate: the preview must say what lands). Bots choose from this; the missed-word line too.
 * Pure: reads state and context, changes nothing.
 *
 * Tile indices are resolved separately (candidateIndices) because only the
 * chosen word needs them; mapping all ~400 candidates per turn was the sim's
 * hot spot.
 */
import { playableIndices, playableLetters, playableNonWildLetters, playableWildCount } from './grid';
import { gatherEffects } from './hooks';
import { resolveEffects } from './effects';
import { armourHit, conditionCtx, enemyDefOf, resistHit, type EngineContext } from './reducer';
import type { Tile } from './types';
import { scoreWord } from './scoring';
import { tilesForWord } from './solver';
import type { RunState } from './types';

export interface Candidate {
  readonly word: string;
  readonly damage: number;
}

export function candidateWords(state: RunState, ctx: EngineContext): Candidate[] {
  const enc = state.encounter;
  if (!enc) return [];
  const base = conditionCtx(state, ctx);
  const raw = gatherEffects('onWordScored', state.player.items, ctx.content, state.cell, state.player.traits);
  // Anything that reads the word (a condition or a perUnit) must be resolved per word.
  const conditional = raw.some((e) => e.type === 'condition' || e.type === 'perUnit');
  const fixed = conditional ? null : resolveEffects(raw, base);
  const traits = enemyDefOf(ctx, enc.enemy.id).traits;
  const armour = traits?.armour ?? 0;
  const resist = traits?.resist;
  const gilded = goldTiles(enc.grid);
  const out: Candidate[] = [];
  // Wildcard (v11): with a playable wild tile the solver treats it as any letter, so the candidate
  // list gains the words the wild enables. No wild tile (any run without the capability) takes the
  // exact pre-v11 path. Each enumerated word already contains the resolved letter, so scoring is
  // unchanged; only the enumeration widened.
  const wilds = playableWildCount(enc.grid);
  const words = wilds > 0 ? ctx.solver.solveWithWild(playableNonWildLetters(enc.grid), wilds) : ctx.solver.solve(playableLetters(enc.grid));
  for (const word of words) {
    const wctx = { ...base, word };
    const effects = fixed ?? resolveEffects(raw, wctx);
    // Armour then resist, the same order and the same helpers the landed hit takes (reducer.submitWord),
    // so the candidate list and the Attack preview show the number that lands (resist is dormant until an enemy uses it).
    out.push({ word, damage: resistHit(armourHit(word, scoreWord(word, effects, ctx.content.tuning).damage + bestGold(word, gilded), armour), resist, wctx) });
  }
  return out;
}

/** Playable gold tiles, richest first, so a word takes the most gold its letters allow. */
function goldTiles(grid: readonly Tile[]): readonly { letter: string; gold: number }[] {
  return playableIndices(grid)
    .map((i) => grid[i] as Tile)
    .filter((t) => t.gold > 0)
    .map((t) => ({ letter: t.letter, gold: t.gold }))
    .sort((a, b) => b.gold - a.gold);
}

/** The gold `word` can carry: each gold tile whose letter the word still has a spare occurrence of, richest first. */
export function bestGold(word: string, gilded: readonly { letter: string; gold: number }[]): number {
  if (gilded.length === 0) return 0;
  const need = new Map<string, number>();
  for (const c of word) need.set(c, (need.get(c) ?? 0) + 1);
  let sum = 0;
  for (const t of gilded) {
    const n = need.get(t.letter) ?? 0;
    if (n > 0) {
      sum += t.gold;
      need.set(t.letter, n - 1);
    }
  }
  return sum;
}

/**
 * Tile indices that spell `word` from the playable tiles, or null. Gold tiles are listed last so
 * tilesForWord (which pops from the end) spends them first, richest first: the mapped hit equals
 * the candidate's damage. When the real tiles cannot spell the word but a playable wild tile (v11)
 * can supply the one missing letter, the wild fills it (a word the solver enabled via the wildcard);
 * submitWord then auto-resolves that wild to the same-or-better letter, so the selection always lands.
 */
export function candidateIndices(state: RunState, word: string): number[] | null {
  const enc = state.encounter;
  if (!enc) return null;
  const letters = enc.grid.map((t) => t.letter);
  // Real (non-wild) tiles only, gold-sorted; the wild is spent last, for the letter the reals lack.
  const ordered = playableIndices(enc.grid)
    .filter((i) => !(enc.grid[i] as Tile).wild)
    .sort((a, b) => (enc.grid[a] as Tile).gold - (enc.grid[b] as Tile).gold);
  const real = tilesForWord(word, letters, ordered);
  if (real) return real;
  const wildIdx = playableIndices(enc.grid).find((i) => (enc.grid[i] as Tile).wild);
  if (wildIdx === undefined) return null;
  return tilesForWordWithWild(word, letters, ordered, wildIdx);
}

/**
 * Map `word` onto real tiles, using the single `wildIdx` tile for the one letter the reals cannot
 * supply (evolution track, v11). Returns null if MORE than one letter is missing (one wild covers
 * only one), which the wild solver never enumerates. The wild sits at the deficit letter's position.
 */
function tilesForWordWithWild(word: string, letters: readonly string[], available: readonly number[], wildIdx: number): number[] | null {
  const pool = new Map<string, number[]>();
  for (const i of available) {
    const l = letters[i];
    if (l === undefined) continue;
    const list = pool.get(l);
    if (list) list.push(i);
    else pool.set(l, [i]);
  }
  const out: number[] = [];
  let usedWild = false;
  for (const ch of word) {
    const idx = pool.get(ch)?.pop();
    if (idx !== undefined) out.push(idx);
    else if (!usedWild) {
      usedWild = true;
      out.push(wildIdx);
    } else return null;
  }
  return out;
}
