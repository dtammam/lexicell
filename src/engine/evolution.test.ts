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
import { newRun, OFFER_SIZE, reduce, scoreSelection, type EngineContext } from './reducer';
import { CAPABILITIES, type Capability, type RunState, type Tile } from './types';

const ctx: EngineContext = nodeContext();

/**
 * A fully deterministic driver (no internal RNG): best word of <=7 letters (ties keep the first in
 * candidate order), trait 0, item 0, rest heals, event walks away (last choice), cursed offer
 * skipped, capability index 0 (the pick is mandatory, so index 0 = wildcard at the first boss).
 */
function step(s: RunState): RunState {
  if (s.phase === 'pick') return reduce(s, s.curses !== null ? { type: 'skipOffer' } : { type: 'pickItem', index: 0 }, ctx);
  if (s.phase === 'evolve') return reduce(s, { type: 'pickTrait', index: 0 }, ctx);
  if (s.phase === 'capability') return reduce(s, { type: 'pickCapability', index: 0 }, ctx);
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

function driveToEnd(seed: number): RunState {
  let s = newRun(seed, ctx);
  for (let guard = 0; guard < 50000 && s.phase !== 'summary'; guard++) {
    const before = s;
    s = step(s);
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
    if (s === before) throw new Error(`seed ${seed}: no progress at ${s.phase}`);
  }
  if (s.phase !== 'summary') throw new Error(`seed ${seed}: did not terminate`);
  return s;
}

/**
 * Drive to the FIRST boss (phase 'evolve') or the run's end, whichever comes first. This prefix never
 * gains a capability (the capability pick only follows pickTrait), so caps stays empty and it is
 * byte-identical to main: the baseline the mandatory-pick change preserves.
 */
function driveToFirstBossOrEnd(seed: number): RunState {
  let s = newRun(seed, ctx);
  for (let guard = 0; guard < 50000 && s.phase !== 'evolve' && s.phase !== 'summary'; guard++) {
    const before = s;
    s = step(s);
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
    if (s === before) throw new Error(`seed ${seed}: no progress at ${s.phase}`);
  }
  return s;
}

/**
 * Take a specific capability at a capability offer. The offer is now a RANDOM subset of the unheld
 * caps (more-capabilities wave), so the named cap may not be present at a given boss; when it is not
 * (and not already held), inject it at the front of the offer and take it. pickCapability draws NO RNG
 * and every capability but the three verbs is inert until it fires through collectEffects, so forcing
 * WHICH capability is held leaves the run's RNG stream and grid byte-identical to any other forced pick.
 * When the named cap is already held, take the first offered non-wildcard cap (so no wild is placed).
 */
function forceCapPick(s: RunState, cap: string): RunState {
  const offer = s.offer ?? [];
  const named = offer.indexOf(cap);
  if (named >= 0) return reduce(s, { type: 'pickCapability', index: named }, ctx);
  if (!s.evolution.caps.includes(cap as Capability)) {
    return reduce({ ...s, offer: [cap, ...offer] }, { type: 'pickCapability', index: 0 }, ctx);
  }
  const nonWild = offer.findIndex((id) => id !== 'wildcard');
  return reduce(s, { type: 'pickCapability', index: nonWild >= 0 ? nonWild : 0 }, ctx);
}

/**
 * Drive a full run that takes ONE named capability (forced, so it is guaranteed held) and, at later
 * bosses, the first offered capability that is NOT wildcard (so no wild is ever placed). Used to show
 * that merely HOLDING an unused non-wildcard capability does not perturb the run.
 */
function driveWithCapabilityPicks(seed: number, cap: string): RunState {
  let s = newRun(seed, ctx);
  for (let guard = 0; guard < 50000 && s.phase !== 'summary'; guard++) {
    s = s.phase === 'capability' ? forceCapPick(s, cap) : step(s);
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
  }
  return s;
}

/** Drive until the given phase is reached (or the run ends). */
function driveTo(seed: number, phase: RunState['phase']): RunState {
  let s = newRun(seed, ctx);
  for (let guard = 0; guard < 50000 && s.phase !== phase && s.phase !== 'summary'; guard++) {
    s = step(s);
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
  }
  return s;
}

describe('evolution track: capability offer flow', () => {
  it('draws a random subset of the capabilities the player lacks after a boss, and a pick lands in evolution.caps', () => {
    // Reach the first evolve (after the act-1 boss), then take the trait: the capability offer follows.
    let s = driveTo(0, 'evolve');
    expect(s.phase).toBe('evolve');
    expect(s.evolution.caps).toEqual([]);
    const rngAtEvolve = s.rng;
    s = reduce(s, { type: 'pickTrait', index: 0 }, ctx);
    expect(s.phase).toBe('capability');
    // Building the offer now DRAWS from the run RNG (the randomized offer, more-capabilities wave): the
    // stream has advanced past the trait pick. Before this wave the offer was every unheld cap in content
    // order and consumed no RNG.
    expect(s.rng).not.toEqual(rngAtEvolve);
    const offer = (s.offer ?? []) as Capability[];
    // Up to OFFER_SIZE unheld capabilities: all real, unique, none held.
    expect(offer.length).toBe(Math.min(OFFER_SIZE, CAPABILITIES.length));
    expect(new Set(offer).size).toBe(offer.length);
    for (const id of offer) expect(CAPABILITIES).toContain(id);
    // Picking one lands it in caps (pick order) and moves off the capability phase.
    s = reduce(s, { type: 'pickCapability', index: 0 }, ctx);
    expect(s.evolution.caps).toEqual([offer[0]]);
    expect(s.phase).not.toBe('capability');
    expect(['pick', 'rest', 'fight', 'summary']).toContain(s.phase);
  });

  it('the offer is seed-stable (same seed, same subset) and never wildcard every time (dilution)', () => {
    let sawOfferWithoutWildcard = false;
    for (let seed = 0; seed < 20; seed++) {
      const a = driveTo(seed, 'capability');
      if (a.phase !== 'capability') continue;
      const b = driveTo(seed, 'capability');
      // Deterministic per seed: the random draw reproduces exactly.
      expect(a.offer, `seed ${seed}`).toEqual(b.offer);
      const offer = (a.offer ?? []) as Capability[];
      expect(offer.length).toBe(Math.min(OFFER_SIZE, CAPABILITIES.length));
      expect(new Set(offer).size).toBe(offer.length);
      for (const id of offer) {
        expect(CAPABILITIES).toContain(id);
        expect(a.evolution.caps).not.toContain(id); // only unheld caps are offered
      }
      if (!offer.includes('wildcard')) sawOfferWithoutWildcard = true;
    }
    // The whole point of the change: wildcard is one option among many, not a guaranteed grab.
    expect(sawOfferWithoutWildcard).toBe(true);
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
  });

  it('the pick is mandatory: there is no way off the capability phase but taking one', () => {
    const s = driveTo(2, 'capability');
    expect(s.phase).toBe('capability');
    // Only pickCapability advances it; taking any offered index lands a capability.
    const picked = reduce(s, { type: 'pickCapability', index: 0 }, ctx);
    expect(picked.phase).not.toBe('capability');
    expect(picked.evolution.caps.length).toBe(1);
  });

  it('with every capability held the offer is skipped gracefully (Endless: bosses recur)', () => {
    // Reach an evolve, then hold ALL capabilities and take the trait: with the unheld pool empty the
    // offer is skipped and the flow goes straight from the trait to the item offer, no capability phase.
    // (There are thirteen caps now, more than a finite run's three bosses can hand out, so this is the
    // clean way to exercise the all-held path rather than grinding endless bosses.)
    const s = driveTo(3, 'evolve');
    expect(s.phase).toBe('evolve');
    const full: RunState = { ...s, evolution: { ...s.evolution, caps: [...CAPABILITIES] } };
    const after = reduce(full, { type: 'pickTrait', index: 0 }, ctx);
    expect(after.phase).not.toBe('capability');
    // No capability is added or removed when the pool is empty; the draw loop never runs.
    expect(after.evolution.caps.slice().sort()).toEqual([...CAPABILITIES].sort());
    expect(['pick', 'rest', 'fight', 'summary']).toContain(after.phase);
  });
});

describe('evolution track: determinism (a run that never reaches a boss == main)', () => {
  // The capability pick is mandatory (no skip), so the baseline is a run driven only up to the FIRST
  // boss (phase 'evolve') or its end, whichever comes first: that prefix never gains a capability, so
  // caps stays empty. It is a determinism/regression pin: the deterministic driver (best <=7 word,
  // trait 0, item 0, ...) must reproduce this exact state.
  // Golden hashes captured from the engine at 8d18bfc (before the track) with the deterministic driver,
  // seeds 0..11. Briefly recaptured for the power-scaling flatten (PR #106) and restored here when that
  // flatten was reverted (2026-09-15): with the original lengthBonus the driver plays the original words,
  // so the act-1 prefix (act-1 enemies untouched) reproduces these exact pre-wave hashes again.
  const BASELINE = [
    'a4c47f3a2f00422a',
    'adb82be435d538b4',
    '5227fe631d3559c2',
    '35f73b7540ca4b6e',
    '67d84f3c37727deb',
    '998e8c56dee46000',
    'eb4085897fb1aba1',
    'fba56de2f7d9b825',
    'ec91de7f9cc89b19',
    '565c46a2dc3625ca',
    'f677c976342ff3ec',
    '862facccc060280c',
  ];
  it('replays byte-identical to main up to the first boss (caps stays empty)', () => {
    for (let seed = 0; seed < BASELINE.length; seed++) {
      const s = driveToFirstBossOrEnd(seed);
      // No capability could have been gained yet: the track is untouched.
      expect(s.evolution).toEqual({ caps: [], transmuteUsed: false, bankedLetter: null });
      expect(['evolve', 'summary']).toContain(s.phase);
      // Renumber the version back to 10 and drop the (empty) v11-only field: what remains is
      // byte-for-byte the v10 state main produced at the same point (same rng, grid, kinds, key order).
      const rest: Record<string, unknown> = { ...s, v: 10 };
      delete rest.evolution;
      const hash = createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
      expect(hash, `seed ${seed}`).toBe(BASELINE[seed]);
    }
  });

  it('the reducer never reaches for Math.random (seeded RNG only): the same seed and actions give the same state', () => {
    for (const seed of [0, 5, 11]) {
      const a = driveToEnd(seed);
      const b = driveToEnd(seed);
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
    s = step(s);
    if (s.rejected) throw new Error(`seed ${seed}: rejected ${s.rejected}`);
  }
  return out;
}

describe('evolution track: the wildcard verb', () => {
  it('places one wild at each fight start; once played it does not return until the next fight (one per fight)', () => {
    let sawWildAtStart = false;
    let sawGoneAfterUse = false;
    for (const seed of [1, 2, 3]) {
      // Group each fight's turn states by encounter.
      const byEnc = new Map<number, RunState[]>();
      for (const s of fightStates(seed)) {
        const list = byEnc.get(s.encounterIndex);
        if (list) list.push(s);
        else byEnc.set(s.encounterIndex, [s]);
      }
      for (const [, states] of byEnc) {
        const held = states[0]?.evolution.caps.includes('wildcard') ?? false;
        const wilds = states.map((s) => (s.encounter as NonNullable<RunState['encounter']>).grid.filter((t) => t.wild).length);
        if (!held) {
          // Before wildcard is held, no fight state carries a wild (byte-identical to main until then).
          for (const w of wilds) expect(w).toBe(0);
          continue;
        }
        // At most one wild ever, and every present wild is playable (never locked).
        for (const s of states) {
          const grid = (s.encounter as NonNullable<RunState['encounter']>).grid;
          expect(grid.filter((t) => t.wild).length).toBeLessThanOrEqual(1);
          expect(playableWildCount(grid)).toBe(grid.filter((t) => t.wild).length);
          expect(grid.filter((t) => t.lockedTurns === 0).length).toBeGreaterThan(0); // never a dead grid
        }
        // The fight opens (turn 1) with exactly one wild.
        const first = states[0] as RunState;
        if ((first.encounter as NonNullable<RunState['encounter']>).turn === 1) {
          expect(wilds[0]).toBe(1);
          sawWildAtStart = true;
        }
        // The wild count is non-increasing across the fight: once played (1 -> 0) it never returns to 1.
        for (let i = 1; i < wilds.length; i++) expect(wilds[i]).toBeLessThanOrEqual(wilds[i - 1] as number);
        if (wilds.some((w) => w === 0)) sawGoneAfterUse = true;
      }
    }
    expect(sawWildAtStart).toBe(true);
    expect(sawGoneAfterUse).toBe(true);
  });

  it('a full wildcard run stays JSON-plain and replays byte-identical to itself (seeded, no Math.random)', () => {
    // The offer is a random subset now, so force wildcard (forceCapPick) to guarantee it is held; the
    // run is still fully deterministic per seed, so it replays byte-identical to itself.
    for (const seed of [1, 3, 7]) {
      const a = driveWithCapabilityPicks(seed, 'wildcard');
      const b = driveWithCapabilityPicks(seed, 'wildcard');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      // The wildcard was actually taken on this run.
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
      cur = step(cur);
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

  it('holding an unused non-wildcard capability does not perturb the run (transmute-first vs letter-bank-first)', () => {
    // Neither transmute nor letter-bank draws RNG or touches the grid until used, so which of the two
    // a run takes first (both non-wildcard, so no wild is ever placed) cannot change anything but the
    // caps list. Stripping the evolution field, the two runs are byte-identical.
    for (const seed of [1, 2]) {
      const transmuteFirst = driveWithCapabilityPicks(seed, 'transmute');
      const bankFirst = driveWithCapabilityPicks(seed, 'letter-bank');
      const strip = (s: RunState) => {
        const r: Record<string, unknown> = { ...s };
        delete r.evolution;
        return JSON.stringify(r);
      };
      // Both hold the two non-wild caps, unused; neither ever placed a wild.
      expect(transmuteFirst.evolution.caps.includes('wildcard')).toBe(false);
      expect(bankFirst.evolution.caps.includes('wildcard')).toBe(false);
      expect(strip(transmuteFirst)).toBe(strip(bankFirst));
    }
  });
});

describe('evolution track: the letter-bank verb', () => {
  const firstPlayable = (s: RunState): number => (s.encounter as NonNullable<RunState['encounter']>).grid.findIndex((t) => t.lockedTurns === 0 && !t.wild);
  const plain = (letter: string): Tile => ({ letter, lockedTurns: 0, venom: 0, gold: 0, cracked: 0 });

  it('stores a tapped tile letter, one slot; a second bank is refused; the letter persists across a turn', () => {
    const base = driveTo(3, 'fight');
    // Invincible, harmless enemy so a played word does not end the fight, and a live grid to bank from.
    const enc = base.encounter as NonNullable<RunState['encounter']>;
    const s: RunState = { ...base, evolution: { caps: ['letter-bank'], transmuteUsed: false, bankedLetter: null }, encounter: { ...enc, enemy: { ...enc.enemy, hp: 1_000_000, maxHp: 1_000_000, damage: 0 } } };
    const idx = firstPlayable(s);
    const stored = (s.encounter as NonNullable<RunState['encounter']>).grid[idx]?.letter ?? '';
    const banked = reduce(s, { type: 'bankLetter', index: idx }, ctx);
    expect(banked.rejected).toBeNull();
    expect(banked.evolution.bankedLetter).toBe(stored);
    // The tile is NOT consumed (banking copies the letter).
    expect((banked.encounter as NonNullable<RunState['encounter']>).grid[idx]?.letter).toBe(stored);
    // A second bank while the slot is full is refused.
    const other = (banked.encounter as NonNullable<RunState['encounter']>).grid.findIndex((t, i) => i !== idx && t.lockedTurns === 0 && !t.wild);
    expect(reduce(banked, { type: 'bankLetter', index: other }, ctx).rejected).toBe('bank is full');
    // Play a normal word WITHOUT spending: the banked letter persists across the turn.
    const wordChoice = candidateWords(banked, ctx)[0];
    if (wordChoice) {
      const idxs = candidateIndices(banked, wordChoice.word) as number[];
      let sel = banked;
      for (const i of idxs) sel = reduce(sel, { type: 'toggleTile', index: i }, ctx);
      const played = reduce(sel, { type: 'submitWord' }, ctx);
      expect(played.evolution.bankedLetter).toBe(stored);
    }
  });

  it('spends the banked letter into a word for scoring, then empties the slot; the preview equals the hit', () => {
    const base = driveTo(1, 'fight');
    const enc = base.encounter as NonNullable<RunState['encounter']>;
    // A controlled grid spelling 'cat', with a fat banked letter, items and traits stripped for isolation.
    const grid: Tile[] = Array.from({ length: 16 }, (_, i) => (i === 0 ? plain('c') : i === 1 ? plain('a') : i === 2 ? plain('t') : plain('e')));
    const s: RunState = { ...base, player: { ...base.player, items: [], traits: [] }, evolution: { caps: ['letter-bank'], transmuteUsed: false, bankedLetter: 'z' }, encounter: { ...enc, grid, enemy: { ...enc.enemy, hp: 1_000_000, maxHp: 1_000_000, damage: 0 }, selection: [] } };
    let sel = s;
    for (const i of [0, 1, 2]) sel = reduce(sel, { type: 'toggleTile', index: i }, ctx);
    const plainPreview = scoreSelection(sel, ctx, false) as number;
    const spendPreview = scoreSelection(sel, ctx, true) as number;
    // Appending 'z' adds its letter value (and a length step), so the spent preview is strictly higher.
    expect(spendPreview).toBeGreaterThan(plainPreview);
    const before = (sel.encounter as NonNullable<RunState['encounter']>).enemy.hp;
    const played = reduce(sel, { type: 'submitWord', spendBank: true }, ctx);
    expect(played.rejected).toBeNull();
    // The preview is the number that lands.
    expect(before - (played.encounter as NonNullable<RunState['encounter']>).enemy.hp).toBe(spendPreview);
    // The slot is now empty, and the scored word carried the banked letter.
    expect(played.evolution.bankedLetter).toBeNull();
    expect(played.lastTurn?.word).toBe('catz');
    // Spending with an empty slot is a no-op augmentation: the same as a plain submit.
    const empty: RunState = { ...s, evolution: { ...s.evolution, bankedLetter: null } };
    let sel2 = empty;
    for (const i of [0, 1, 2]) sel2 = reduce(sel2, { type: 'toggleTile', index: i }, ctx);
    expect(scoreSelection(sel2, ctx, true)).toBe(scoreSelection(sel2, ctx, false));
  });

  it('guards: needs the capability and refuses the wild tile', () => {
    const base = driveTo(4, 'fight');
    expect(reduce(base, { type: 'bankLetter', index: 0 }, ctx).rejected).toBe('no letter bank');
    const withCap: RunState = { ...base, evolution: { caps: ['letter-bank'], transmuteUsed: false, bankedLetter: null } };
    expect(reduce(withCap, { type: 'bankLetter', index: 99 }, ctx).rejected).toBe('bad tile index');
    const enc = withCap.encounter as NonNullable<RunState['encounter']>;
    const grid = enc.grid.map((t, i) => (i === 0 ? { ...t, wild: true as const } : t));
    expect(reduce({ ...withCap, encounter: { ...enc, grid } }, { type: 'bankLetter', index: 0 }, ctx).rejected).toBe('cannot bank the wild tile');
  });

  it('a full run holding letter-bank but never banking keeps the slot empty and stays JSON-plain', () => {
    for (const seed of [1, 2]) {
      const run = driveWithCapabilityPicks(seed, 'letter-bank');
      expect(run.evolution.caps).toContain('letter-bank');
      // Never banked: the slot is empty the whole run, and no wildcard was placed (non-wild picks).
      expect(run.evolution.bankedLetter).toBeNull();
      expect(run.evolution.caps.includes('wildcard')).toBe(false);
      expect(JSON.parse(JSON.stringify(run))).toEqual(run);
    }
  });
});

describe('evolution track: passive capabilities (declarative hooks)', () => {
  const plain = (letter: string): Tile => ({ letter, lockedTurns: 0, venom: 0, gold: 0, cracked: 0 });

  it('osmosis lifesteals on a word: with the cap the player heals 12% of the damage, without it not at all', () => {
    const base = driveTo(1, 'fight');
    const enc = base.encounter as NonNullable<RunState['encounter']>;
    // A controlled grid spelling a high-scoring real word (quartz: two rich rare letters over six tiles,
    // so 15% of its damage floors above zero), an invincible harmless enemy so the fight does not end, the
    // player wounded so a heal is visible, items/traits stripped so osmosis is the only lifesteal.
    const q = 'quartz';
    const grid: Tile[] = Array.from({ length: 16 }, (_, i) => (i < q.length ? plain(q[i] as string) : plain('e')));
    const make = (caps: Capability[]): RunState => ({
      ...base,
      player: { ...base.player, hp: 1, items: [], traits: [] },
      evolution: { caps, transmuteUsed: false, bankedLetter: null },
      encounter: { ...enc, grid, enemy: { ...enc.enemy, hp: 1_000_000, maxHp: 1_000_000, damage: 0 }, selection: [] },
    });
    const play = (s0: RunState): RunState => {
      let s = s0;
      for (let i = 0; i < q.length; i++) s = reduce(s, { type: 'toggleTile', index: i }, ctx);
      const r = reduce(s, { type: 'submitWord' }, ctx);
      if (r.rejected) throw new Error(`submit rejected: ${r.rejected}`);
      return r;
    };
    const withCap = play(make(['osmosis']));
    const without = play(make([]));
    expect(without.lastTurn?.healed).toBe(0);
    expect(withCap.lastTurn?.healed).toBeGreaterThan(0);
    const dealt = 1_000_000 - (withCap.encounter as NonNullable<RunState['encounter']>).enemy.hp;
    expect(withCap.lastTurn?.healed).toBe(Math.floor(dealt * 0.12));
  });

  it('chitin softens every hit by 5 (an onDamageTaken passive hook fires end to end)', () => {
    const base = driveTo(2, 'fight');
    const enc = base.encounter as NonNullable<RunState['encounter']>;
    // Full HP, no shield, items/traits stripped so chitin is the only onDamageTaken source; invincible
    // enemy so the fight does not end, and a large fixed hit (damage 60) so the 5-point reduction is
    // always visible on the SAME turn (a small hit that chitin absorbs to zero would land the two runs'
    // first non-zero hit on different turns). chitin changes no RNG and no word choice, so the two runs
    // play the identical words and take the identical enemy roll; only the reduction differs.
    const make = (caps: Capability[]): RunState => ({
      ...base,
      player: { ...base.player, hp: base.player.maxHp, shield: 0, items: [], traits: [] },
      evolution: { caps, transmuteUsed: false, bankedLetter: null },
      encounter: { ...enc, enemy: { ...enc.enemy, hp: 1_000_000, maxHp: 1_000_000, damage: 60 } },
    });
    const firstHit = (s0: RunState): number => {
      let s = s0;
      for (let g = 0; g < 300 && s.phase === 'fight'; g++) {
        s = step(s);
        if (s.rejected) throw new Error(`rejected ${s.rejected}`);
        if ((s.lastTurn?.enemyDamage ?? 0) > 0) return s.lastTurn?.enemyDamage ?? 0;
      }
      throw new Error('enemy never hit');
    };
    const raw = firstHit(make([]));
    const softened = firstHit(make(['chitin']));
    expect(raw).toBeGreaterThan(5);
    expect(softened).toBe(raw - 5);
  });

  it('vesicle heals 5 on a short word (<=5 letters) and nothing on a long word: the maxLength gate is greedy-proof', () => {
    const base = driveTo(1, 'fight');
    const enc = base.encounter as NonNullable<RunState['encounter']>;
    // A controlled grid, the player wounded so a heal is visible, items/traits stripped so vesicle is the
    // only heal, an invincible harmless enemy so the fight does not end. Vesicle heals a flat 5 only when
    // the word played is 5 letters or fewer: greedy plays 6-7 letter words so it never triggers, while the
    // mediocre bot's 4-5 letter words always do. That asymmetry is the point of the swap.
    const makeGrid = (word: string): Tile[] => Array.from({ length: 16 }, (_, i) => (i < word.length ? plain(word[i] as string) : plain('e')));
    const make = (caps: Capability[], word: string): RunState => ({
      ...base,
      player: { ...base.player, hp: 1, items: [], traits: [] },
      evolution: { caps, transmuteUsed: false, bankedLetter: null },
      encounter: { ...enc, grid: makeGrid(word), enemy: { ...enc.enemy, hp: 1_000_000, maxHp: 1_000_000, damage: 0 }, selection: [] },
    });
    const play = (s0: RunState, word: string): RunState => {
      let s = s0;
      for (let i = 0; i < word.length; i++) s = reduce(s, { type: 'toggleTile', index: i }, ctx);
      const r = reduce(s, { type: 'submitWord' }, ctx);
      if (r.rejected) throw new Error(`submit rejected: ${r.rejected}`);
      return r;
    };
    const short = 'stone'; // 5 letters -> the gate fires
    const long = 'stones'; // 6 letters -> the gate does not fire
    expect(play(make([], short), short).lastTurn?.healed).toBe(0);
    expect(play(make(['vesicle'], short), short).lastTurn?.healed).toBe(5);
    expect(play(make(['vesicle'], long), long).lastTurn?.healed).toBe(0);
  });
});
