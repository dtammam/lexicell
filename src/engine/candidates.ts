/**
 * Every playable word on the current grid with the damage it would deal
 * under the player's current items. Bots choose from this; a UI hint can too.
 * Pure: reads state and context, changes nothing.
 *
 * Tile indices are resolved separately (candidateIndices) because only the
 * chosen word needs them; mapping all ~400 candidates per turn was the sim's
 * hot spot.
 */
import { playableIndices, playableLetters } from './grid';
import { gatherEffects } from './hooks';
import { resolveEffects } from './effects';
import type { EngineContext } from './reducer';
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
  const base = { hp: state.player.hp, maxHp: state.player.maxHp, turn: enc.turn };
  const raw = gatherEffects('onWordScored', state.player.items, ctx.content);
  const conditional = raw.some((e) => e.type === 'condition');
  const fixed = conditional ? null : resolveEffects(raw, base);
  const out: Candidate[] = [];
  for (const word of ctx.solver.solve(playableLetters(enc.grid))) {
    const effects = fixed ?? resolveEffects(raw, { ...base, word });
    out.push({ word, damage: scoreWord(word, effects).damage });
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
