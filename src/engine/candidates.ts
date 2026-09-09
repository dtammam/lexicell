/**
 * Every playable word on the current grid with the damage it would deal
 * under the player's current items and this enemy's armour (variety wave gate: the preview
 * must say what lands). Bots choose from this; a UI hint can too.
 * Pure: reads state and context, changes nothing.
 *
 * Tile indices are resolved separately (candidateIndices) because only the
 * chosen word needs them; mapping all ~400 candidates per turn was the sim's
 * hot spot.
 */
import { playableIndices, playableLetters } from './grid';
import { gatherEffects } from './hooks';
import { resolveEffects } from './effects';
import { armourHit, conditionCtx, enemyDefOf, type EngineContext } from './reducer';
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
  const raw = gatherEffects('onWordScored', state.player.items, ctx.content, state.cell);
  // Anything that reads the word (a condition or a perUnit) must be resolved per word.
  const conditional = raw.some((e) => e.type === 'condition' || e.type === 'perUnit');
  const fixed = conditional ? null : resolveEffects(raw, base);
  const armour = enemyDefOf(ctx, enc.enemy.id).traits?.armour ?? 0;
  const out: Candidate[] = [];
  for (const word of ctx.solver.solve(playableLetters(enc.grid))) {
    const effects = fixed ?? resolveEffects(raw, { ...base, word });
    out.push({ word, damage: armourHit(word, scoreWord(word, effects, ctx.content.tuning).damage, armour) });
  }
  return out;
}

/** Tile indices that spell `word` from the playable tiles, or null. */
export function candidateIndices(state: RunState, word: string): number[] | null {
  const enc = state.encounter;
  if (!enc) return null;
  return tilesForWord(
    word,
    enc.grid.map((t) => t.letter),
    playableIndices(enc.grid),
  );
}
