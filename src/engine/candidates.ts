/**
 * Every playable word on the current grid with the damage it would deal
 * under the player's current items. Bots choose from this; a UI hint can too.
 * Pure: reads state and context, changes nothing.
 */
import { playableIndices, playableLetters } from './grid';
import { collectEffects } from './hooks';
import type { EngineContext } from './reducer';
import { scoreWord } from './scoring';
import { tilesForWord } from './solver';
import type { RunState } from './types';

export interface Candidate {
  readonly word: string;
  readonly indices: readonly number[];
  readonly damage: number;
}

export function candidateWords(state: RunState, ctx: EngineContext): Candidate[] {
  const enc = state.encounter;
  if (!enc) return [];
  const letters = enc.grid.map((t) => t.letter);
  const available = playableIndices(enc.grid);
  const base = { hp: state.player.hp, maxHp: state.player.maxHp, turn: enc.turn };
  const out: Candidate[] = [];
  for (const word of ctx.solver.solve(playableLetters(enc.grid))) {
    const indices = tilesForWord(word, letters, available);
    if (!indices) continue;
    const effects = collectEffects('onWordScored', state.player.items, ctx.content, { ...base, word });
    out.push({ word, indices, damage: scoreWord(word, effects).damage });
  }
  return out;
}
