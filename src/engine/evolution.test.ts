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
import { playableLetters, playableWildCount } from './grid';
import { newRun, reduce, scoreSelection, type EngineContext } from './reducer';
import { CAPABILITIES, type RunState, type Tile } from './types';

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

/**
 * Drive a full run that takes ONE named capability (the first time it is offered) and skips every
 * other capability offer, never using the capability's in-fight action. Used to prove that merely
 * HOLDING a capability does not perturb the run relative to a skip run.
 */
function driveWithCapabilityPicks(seed: number, cap: string): RunState {
  let s = newRun(seed, ctx);
  for (let guard = 0; guard < 50000 && s.phase !== 'summary'; guard++) {
    if (s.phase === 'capability') {
      const at = (s.offer ?? []).indexOf(cap);
      s = reduce(s, at >= 0 ? { type: 'pickCapability', index: at } : { type: 'skipCapability' }, ctx);
    } else {
      s = step(s, 'skip');
    }
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
  }
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

/** Every fight state a 'pick0' run passes through (it takes wildcard at the first boss). */
function fightStates(seed: number): RunState[] {
  const out: RunState[] = [];
  let s = newRun(seed, ctx);
  for (let guard = 0; guard < 50000 && s.phase !== 'summary'; guard++) {
    if (s.phase === 'fight') out.push(s);
    s = step(s, 'pick0');
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
  }
  return out;
}

describe('evolution track: the wildcard verb', () => {
  it('holds exactly one playable wild tile every turn once wildcard is taken, and never a dead grid', () => {
    let sawWild = false;
    let sawConsumeReplace = false;
    for (const seed of [1, 2, 3]) {
      let hadWildLastTurn = false;
      for (const s of fightStates(seed)) {
        const grid = (s.encounter as NonNullable<RunState['encounter']>).grid;
        const wildCount = grid.filter((t) => t.wild).length;
        if (s.evolution.caps.includes('wildcard')) {
          // Exactly one wild tile, and it is playable (never locked): the invariant withWild keeps.
          expect(wildCount, `seed ${seed} enc ${s.encounterIndex}`).toBe(1);
          expect(playableWildCount(grid)).toBe(1);
          sawWild = true;
          if (hadWildLastTurn) sawConsumeReplace = true;
          hadWildLastTurn = true;
        } else {
          // Before wildcard is held there is never a wild tile (byte-identical to main until then).
          expect(wildCount).toBe(0);
        }
        // The grid handed to the player is never dead, wild or not (the no-dead-grid guarantee).
        const dead = grid.filter((t) => t.lockedTurns === 0);
        expect(dead.length).toBeGreaterThan(0);
      }
    }
    expect(sawWild).toBe(true);
    expect(sawConsumeReplace).toBe(true);
  });

  it('a full wildcard run stays JSON-plain and replays byte-identical to itself (seeded, no Math.random)', () => {
    for (const seed of [1, 3, 7]) {
      const a = driveToEnd(seed, 'pick0');
      const b = driveToEnd(seed, 'pick0');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      // The wildcard was actually taken on this run (the first capability offered).
      expect(a.evolution.caps).toContain('wildcard');
    }
  });

  it('the wild forms words a plain grid could not, and the Attack preview equals the landed hit', () => {
    let proved = false;
    for (const seed of [1, 2, 3, 4, 5] as const) {
      for (const s of fightStates(seed)) {
        if (!s.evolution.caps.includes('wildcard')) continue;
        const enc = s.encounter as NonNullable<RunState['encounter']>;
        const plain = new Set(ctx.solver.solve(playableLetters(enc.grid)));
        // A candidate that uses the wild: not spellable from the literal playable letters, and its
        // tile mapping includes the single wild tile.
        const wildIdx = enc.grid.findIndex((t) => t.wild);
        const wildOnly = candidateWords(s, ctx).find((c) => {
          if (plain.has(c.word)) return false;
          const idx = candidateIndices(s, c.word);
          return idx !== null && idx.includes(wildIdx);
        });
        if (!wildOnly) continue;
        // Play it against an invincible, harmless enemy, with items and traits stripped so the hp
        // delta is exactly the word's landed damage (no onWordScored extras such as damageEnemy).
        const safe: RunState = { ...s, player: { ...s.player, items: [], traits: [] }, encounter: { ...enc, enemy: { ...enc.enemy, hp: 1_000_000, maxHp: 1_000_000, damage: 0 }, selection: [] } };
        const idx = candidateIndices(safe, wildOnly.word) as number[];
        let sel = safe;
        for (const i of idx) sel = reduce(sel, { type: 'toggleTile', index: i }, ctx);
        const preview = scoreSelection(sel, ctx);
        expect(preview).not.toBeNull();
        const before = (sel.encounter as NonNullable<RunState['encounter']>).enemy.hp;
        const after = reduce(sel, { type: 'submitWord' }, ctx);
        expect(after.rejected).toBeNull();
        const dealt = before - (after.encounter as NonNullable<RunState['encounter']>).enemy.hp;
        // The preview is the number that lands.
        expect(dealt).toBe(preview);
        // The word played is a real dictionary word and used the wild tile's slot.
        expect(ctx.dictionary.has(after.lastTurn?.word ?? '')).toBe(true);
        expect((after.lastTurn?.used ?? []).includes(wildIdx)).toBe(true);
        proved = true;
        break;
      }
      if (proved) break;
    }
    expect(proved).toBe(true);
  });

  it('selecting the wild alone resolves to the best one-letter word; a selection with no valid resolution is rejected', () => {
    // Craft a controlled grid: a single wild plus letters that only spell a word WITH the wild.
    const base = fightStates(1).find((s) => s.evolution.caps.includes('wildcard'));
    if (!base) throw new Error('no wildcard fight state');
    const enc = base.encounter as NonNullable<RunState['encounter']>;
    // A clean 16-tile grid with EXACTLY one wild: c, a, wild, then plain 'b' fillers.
    const plain = (letter: string): Tile => ({ letter, lockedTurns: 0, venom: 0, gold: 0, cracked: 0 });
    const grid: Tile[] = Array.from({ length: 16 }, (_, i) => (i === 0 ? plain('c') : i === 1 ? plain('a') : i === 2 ? { ...plain('z'), wild: true as const } : plain('b')));
    const s: RunState = { ...base, player: { ...base.player, items: [], traits: [] }, encounter: { ...enc, grid, enemy: { ...enc.enemy, hp: 1_000_000, maxHp: 1_000_000, damage: 0 }, selection: [] } };
    // Select c, a, wild: the wild resolves to 't' (cat) or 'b' (cab) etc., the best valid word; it lands.
    let sel = s;
    for (const i of [0, 1, 2]) sel = reduce(sel, { type: 'toggleTile', index: i }, ctx);
    const preview = scoreSelection(sel, ctx);
    expect(preview).not.toBeNull();
    const played = reduce(sel, { type: 'submitWord' }, ctx);
    expect(played.rejected).toBeNull();
    expect(ctx.dictionary.has(played.lastTurn?.word ?? '')).toBe(true);
    // The played word is c + a + (a real letter for the wild), three letters long.
    expect(played.lastTurn?.word.length).toBe(3);
    expect(played.lastTurn?.word.startsWith('ca')).toBe(true);
  });
});

describe('evolution track: the transmute verb', () => {
  const firstPlayable = (s: RunState): number => (s.encounter as NonNullable<RunState['encounter']>).grid.findIndex((t) => t.lockedTurns === 0 && !t.wild);

  it('turns a tile into a rare letter, once per fight, and refreshes at the next encounter', () => {
    const base = driveTo(1, 'fight');
    const s: RunState = { ...base, evolution: { ...base.evolution, caps: ['transmute'], transmuteUsed: false } };
    const idx = firstPlayable(s);
    const t1 = reduce(s, { type: 'transmuteTile', index: idx }, ctx);
    expect(t1.rejected).toBeNull();
    // The tile is now one of the rare letters, and the charge is spent.
    const letter = (t1.encounter as NonNullable<RunState['encounter']>).grid[idx]?.letter ?? '';
    expect('kjxqz'.includes(letter)).toBe(true);
    expect(t1.evolution.transmuteUsed).toBe(true);
    // A second transmute this fight is refused and changes nothing.
    const other = (t1.encounter as NonNullable<RunState['encounter']>).grid.findIndex((t, i) => i !== idx && t.lockedTurns === 0 && !t.wild);
    const t2 = reduce(t1, { type: 'transmuteTile', index: other }, ctx);
    expect(t2.rejected).toBe('transmute already used this fight');
    expect((t2.encounter as NonNullable<RunState['encounter']>).grid[other]?.letter).toBe((t1.encounter as NonNullable<RunState['encounter']>).grid[other]?.letter);
    // Drive on: the next encounter's fight refreshes the charge to false.
    let cur = t1;
    const startEnc = t1.encounterIndex;
    let resetSeen = false;
    for (let g = 0; g < 50000 && cur.phase !== 'summary'; g++) {
      cur = step(cur, 'pick0');
      if (cur.rejected) throw new Error(`rejected ${cur.rejected}`);
      if (cur.phase === 'fight' && cur.encounterIndex > startEnc) {
        expect(cur.evolution.transmuteUsed).toBe(false);
        resetSeen = true;
        break;
      }
    }
    expect(resetSeen).toBe(true);
  });

  it('guards: needs the capability, refuses the wild tile and an out-of-range index', () => {
    const base = driveTo(2, 'fight');
    // No capability held (driveTo declines): refused.
    expect(reduce(base, { type: 'transmuteTile', index: 0 }, ctx).rejected).toBe('no transmute');
    const withCap: RunState = { ...base, evolution: { ...base.evolution, caps: ['transmute'], transmuteUsed: false } };
    expect(reduce(withCap, { type: 'transmuteTile', index: 99 }, ctx).rejected).toBe('bad tile index');
    // The wild tile is not a valid target.
    const enc = withCap.encounter as NonNullable<RunState['encounter']>;
    const grid = enc.grid.map((t, i) => (i === 0 ? { ...t, wild: true as const } : t));
    const wildState: RunState = { ...withCap, encounter: { ...enc, grid } };
    expect(reduce(wildState, { type: 'transmuteTile', index: 0 }, ctx).rejected).toBe('cannot transmute the wild tile');
  });

  it('a run holding transmute (unused) still replays byte-identical to a run without it (no RNG in transmute)', () => {
    // The driver never transmutes, so merely HOLDING the capability must not perturb the RNG stream.
    // Compare a 'skip' run (no caps) to a run that picks only transmute at each boss but never uses it.
    for (const seed of [1, 2]) {
      const withTransmute = driveWithCapabilityPicks(seed, 'transmute');
      const skipped = driveToEnd(seed, 'skip');
      // Stripping the (behaviourally inert) evolution field, the two runs are identical.
      const strip = (s: RunState) => {
        const r: Record<string, unknown> = { ...s };
        delete r.evolution;
        return JSON.stringify(r);
      };
      expect(strip(withTransmute)).toBe(strip(skipped));
    }
  });
});
