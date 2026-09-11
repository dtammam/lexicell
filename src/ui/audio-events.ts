/**
 * The state-delta -> sound-effect mapping (Dean, 2026-09-10). Pure over (prev, next) so it is unit
 * tested without any audio; audio.ts is the output stage and plays what this returns. No Web Audio
 * call belongs in here.
 */
import type { RunState } from '../engine/types';
import type { SfxName } from './audio';

/**
 * Which effects a transition from `prev` to `next` should play, in order. `prev` is null for the
 * first state. Reads only state the reducer already produced (selection length, lastTurn/report,
 * enemy hp, phase/outcome, player items, curses), never any wall clock.
 */
export function sfxForTransition(prev: RunState | null, next: RunState): SfxName[] {
  const out: SfxName[] = [];
  if (!prev) return out;

  // Selection grew or shrank: a tile went in or came out.
  const prevSel = prev.encounter?.selection.length ?? 0;
  const nextSel = next.encounter?.selection.length ?? 0;
  if (nextSel > prevSel) out.push('tileSelect');
  else if (nextSel < prevSel && nextSel > 0) out.push('tileDeselect');

  // A word was submitted: a fresh lastTurn (a new report object, or one where the turn advanced).
  const report = next.lastTurn;
  const wordPlayed = report !== null && report !== prev.lastTurn;
  if (wordPlayed && report) {
    out.push('wordLand');
    // A thud only when the turn actually cost the player HP (a shield that ate the hit stays quiet).
    if (next.player.hp < prev.player.hp) out.push('damage');
    // The enemy died this turn: a descending defeat blip on top of the word chime.
    if (report.enemyDefeated) out.push('defeat');
  }

  // Reached the run's end.
  if (next.phase === 'summary' && prev.phase !== 'summary') {
    if (next.outcome === 'won') out.push('win');
    else if (next.outcome === 'lost') out.push('lose');
  }

  // A mutation was picked up (the item list grew).
  const grewItems = next.player.items.length > prev.player.items.length;
  if (grewItems) {
    // A cursed pick: the offer's curses cleared as the item was taken. A darker note replaces the pluck.
    const wasCursed = (prev.curses?.length ?? 0) > 0 && (next.curses?.length ?? 0) === 0;
    out.push(wasCursed ? 'curseTaken' : 'itemPick');
  }

  return out;
}
