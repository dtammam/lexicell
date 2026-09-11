/**
 * The evolution track (v11, marquee wave): the capability offer flow and the determinism guarantee.
 * The wildcard, transmute and letter-bank verbs are exercised by later blocks in this file (added
 * with each verb's commit). Here: the offer appears after a boss alongside the trait, a pick lands
 * in evolution.caps, the offer step is RNG-neutral, and a run that never gains a capability replays
 * BYTE-IDENTICAL to main (golden hashes captured from the engine at 8d18bfc, before this wave).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { nodeContext } from '../../scripts/lib/context';
import { candidateIndices, candidateWords } from './candidates';
import { newRun, reduce, type EngineContext } from './reducer';
import { CAPABILITIES, type RunState } from './types';

const ctx: EngineContext = nodeContext();

/**
 * A fully deterministic driver (no internal RNG): best word of <=7 letters (ties keep the first in
 * candidate order), trait 0, item 0, rest heals, event walks away (last choice), cursed offer
 * skipped. `onCapability` decides the capability phase. This is byte-for-byte the driver the golden
 * capture ran on main; the only branch main never reached is 'capability'.
 */
function step(s: RunState, onCapability: 'skip' | 'pick0'): RunState {
  if (s.phase === 'pick') return reduce(s, s.curses !== null ? { type: 'skipOffer' } : { type: 'pickItem', index: 0 }, ctx);
  if (s.phase === 'evolve') return reduce(s, { type: 'pickTrait', index: 0 }, ctx);
  if (s.phase === 'capability') return reduce(s, onCapability === 'skip' ? { type: 'skipCapability' } : { type: 'pickCapability', index: 0 }, ctx);
  if (s.phase === 'rest') return reduce(s, { type: 'restHeal' }, ctx);
  if (s.phase === 'event') {
    const def = ctx.content.events.find((e) => e.id === s.event);
    const last = Math.max(0, (def?.choices.length ?? 1) - 1);
    return reduce(s, { type: 'eventChoice', index: last }, ctx);
  }
  // fight
  const cands = candidateWords(s, ctx);
  let best: { word: string; damage: number } | null = null;
  for (const c of cands) if (c.word.length <= 7 && (!best || c.damage > best.damage)) best = c;
  if (!best) for (const c of cands) if (!best || c.damage > best.damage) best = c;
  if (!best) throw new Error(`seed dead grid at enc ${s.encounterIndex}`);
  const idx = candidateIndices(s, best.word);
  if (!idx) throw new Error(`cannot map ${best.word}`);
  let out = s;
  for (const index of idx) out = reduce(out, { type: 'toggleTile', index }, ctx);
  return reduce(out, { type: 'submitWord' }, ctx);
}

function driveToEnd(seed: number, onCapability: 'skip' | 'pick0'): RunState {
  let s = newRun(seed, ctx);
  for (let guard = 0; guard < 50000 && s.phase !== 'summary'; guard++) {
    const before = s;
    s = step(s, onCapability);
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
    if (s === before) throw new Error(`seed ${seed}: no progress at ${s.phase}`);
  }
  if (s.phase !== 'summary') throw new Error(`seed ${seed}: did not terminate`);
  return s;
}

/** Drive until the given phase is reached (or the run ends), handling capability by skipping. */
function driveTo(seed: number, phase: RunState['phase'], onCapability: 'skip' | 'pick0' = 'skip'): RunState {
  let s = newRun(seed, ctx);
  for (let guard = 0; guard < 50000 && s.phase !== phase && s.phase !== 'summary'; guard++) {
    s = step(s, onCapability);
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
  }
  return s;
}

describe('evolution track: capability offer flow', () => {
  it('offers the capabilities the player lacks after a boss, alongside the trait, and a pick lands in evolution.caps', () => {
    // Reach the first evolve (after the act-1 boss), then take the trait: the capability offer follows.
    let s = driveTo(0, 'evolve');
    expect(s.phase).toBe('evolve');
    expect(s.evolution.caps).toEqual([]);
    const rngAtEvolve = s.rng;
    s = reduce(s, { type: 'pickTrait', index: 0 }, ctx);
    // The trait pick and building the capability offer consume NO RNG: the stream is untouched.
    expect(s.phase).toBe('capability');
    expect(s.rng).toEqual(rngAtEvolve);
    // The first boss offers every capability (none held yet), in fixed content order.
    expect(s.offer).toEqual(CAPABILITIES.map((c) => c));
    expect(s.offer).toEqual(ctx.content.capabilities.map((c) => c.id));
    // Picking one lands it in caps (pick order) and moves off the capability phase.
    s = reduce(s, { type: 'pickCapability', index: 0 }, ctx);
    expect(s.evolution.caps).toEqual(['wildcard']);
    expect(s.phase).not.toBe('capability');
    expect(['pick', 'rest', 'fight', 'summary']).toContain(s.phase);
  });

  it('a bad or unknown capability index is rejected without changing state', () => {
    let s = driveTo(0, 'capability');
    expect(s.phase).toBe('capability');
    s = reduce(s, { type: 'pickCapability', index: 99 }, ctx);
    expect(s.rejected).toBe('bad capability index');
    expect(s.evolution.caps).toEqual([]);
    // pickCapability off a non-capability phase is rejected too.
    const fight = driveTo(1, 'fight');
    expect(reduce(fight, { type: 'pickCapability', index: 0 }, ctx).rejected).toBe('not choosing a capability');
    expect(reduce(fight, { type: 'skipCapability' }, ctx).rejected).toBe('not choosing a capability');
  });

  it('declining is possible (skipCapability) and never gains a capability', () => {
    let s = driveTo(2, 'capability');
    expect(s.phase).toBe('capability');
    s = reduce(s, { type: 'skipCapability' }, ctx);
    expect(s.phase).not.toBe('capability');
    expect(s.evolution.caps).toEqual([]);
  });

  it('with every capability held the offer is skipped gracefully (Endless: bosses recur)', () => {
    // Endless: pick a capability at every offer until all three are held, then confirm a later boss
    // sends the flow straight from the trait to the item offer with no capability phase.
    let s = newRun(3, ctx, 'balanced', 'endless');
    let sawSkipAfterFull = false;
    let prevPhase: RunState['phase'] = s.phase;
    for (let guard = 0; guard < 30000 && s.phase !== 'summary'; guard++) {
      // After all three are held, a pickTrait must NOT be followed by a capability phase.
      if (s.evolution.caps.length === 3 && prevPhase === 'evolve' && s.phase !== 'capability') sawSkipAfterFull = true;
      prevPhase = s.phase;
      s = step(s, 'pick0');
      if (s.rejected) throw new Error(`rejected ${s.rejected}`);
      if (s.evolution.caps.length === 3 && sawSkipAfterFull) break;
    }
    expect(s.evolution.caps.slice().sort()).toEqual([...CAPABILITIES].sort());
    expect(sawSkipAfterFull).toBe(true);
  });
});

describe('evolution track: determinism (no-capability run == main)', () => {
  // Golden hashes of JSON.stringify(finalState) for the deterministic driver, captured from the
  // engine at 8d18bfc (before the track) for seeds 0..11. A v11 run that DECLINES every capability
  // must reproduce them exactly once its (empty) evolution field is stripped.
  const GOLDEN = [
    '4e91ad293d125d96',
    '692f1b66cee2368d',
    '0fc68503846a61de',
    '31d61fcd3e80b6da',
    'ecd3b5f0b54d4a88',
    '395753a8ee95408f',
    'c390dc513137d357',
    '87b07152746efe2e',
    '15d368c4d5ac4cac',
    '24d2acc280ecc48a',
    '3edb26cfff717b33',
    '33dab77b910029fb',
  ];
  it('replays byte-identical to main for every seed when no capability is taken', () => {
    for (let seed = 0; seed < GOLDEN.length; seed++) {
      const final = driveToEnd(seed, 'skip');
      // No capability taken: the track stayed empty throughout.
      expect(final.evolution).toEqual({ caps: [], transmuteUsed: false, bankedLetter: null });
      // Renumber the version back to 10 and drop the (empty) v11-only field: what remains is
      // byte-for-byte the v10 state main produced (same rng, player, grid, kinds, stats, key order).
      const rest: Record<string, unknown> = { ...final, v: 10 };
      delete rest.evolution;
      const hash = createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
      expect(hash, `seed ${seed}`).toBe(GOLDEN[seed]);
    }
  });

  it('the reducer never reaches for Math.random (seeded RNG only): the same seed and actions give the same state', () => {
    for (const seed of [0, 5, 11]) {
      const a = driveToEnd(seed, 'skip');
      const b = driveToEnd(seed, 'skip');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
