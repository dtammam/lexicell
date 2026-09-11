# Exec plan: the evolution track (thread 1, marquee)

Branch `feat/evolution-track`, base main at 8d18bfc. This is the biggest
engine + save wave of the variety plan: it makes evolution mechanically real by
granting the cell three new CAPABILITIES as it descends, each a first-class
engine mechanism, on a v11 save bump with migration. Full adversarial gate,
briefed to break replay; the coordinator runs it and the balance sims after this
branch is reported.

## Goal

By the deep, the player does something with the grid or the word that a starting
grid could not: a wildcard tile that reshapes any word, a once-a-fight
transmutation into a rare letter, and a one-slot letter bank. The capability is
offered after each boss alongside the existing trait pick, so the run walks a
visible path rather than accumulating stat modifiers.

## Dean's decisions (from the intake, carried into this branch)

- Adopt option 1B (in-run evolution track granting capabilities), over 1A
  (branching stat traits) and 1C (grid reshape). Capabilities, not stats.
- A capability is offered after EACH boss, ALONGSIDE the trait (both in one
  wave), chained into the existing evolve -> trait -> item flow.
- All THREE verbs land in this one wave (wildcard, transmute, letter-bank); Dean
  signed off on each. They are first-class engine mechanisms, not special cases.
- The wildcard AUTO-RESOLVES to any letter (no extra tap); it is always exactly
  one tile, consumed when played and re-placed on refill.
- Save bump v10 -> v11 with migration; old runs load and finish with an empty
  track.

## Design

### State (v11)

`RunState.evolution: Evolution`, JSON-plain:

```
interface Evolution {
  readonly caps: readonly Capability[];      // ids gained, in pick order
  readonly transmuteUsed: boolean;           // per-FIGHT, reset at encounter start
  readonly bankedLetter: string | null;      // one stored letter, per-RUN, persists across turns and fights
}
type Capability = 'wildcard' | 'transmute' | 'letter-bank';
```

`newRun` writes `{ caps: [], transmuteUsed: false, bankedLetter: null }`.
`SAVE_VERSION` 10 -> 11. The wildcard tile is a Tile flag `readonly wild?: true`
(absent = not wild), so a grid with no wildcard is byte-identical to main (no
extra key). Capabilities are content data in `src/content/capabilities.ts`
(`CapabilityDef`: id, name, description, flavor) added to `Content.capabilities`;
the engine keys behaviour off the known ids, exactly as it keys the default cell
off `'balanced'`.

### Pacing / offer flow

Boss falls -> `evolve` (trait pick, unchanged) -> `capability` (NEW) -> item
offer. `makeCapabilityOffer` offers every capability the player does NOT yet hold,
in fixed content order (there are only three, so no RNG draw is needed and none is
made). `pickCapability(index)` keeps one; `skipCapability` declines. With all held
(Endless, bosses recur) the offer is empty and the flow falls straight through to
the item offer. Both the offer and its skip consume ZERO RNG and set no
gameplay-affecting state, which is what lets a no-capability run replay
byte-identical to main.

Note (flagged for Dean / the gate): Dean's brief said "pick one" (mirror the
mandatory trait offer). I made the capability step SKIPPABLE (`skipCapability`)
so that (a) a player who wants no capability is not forced, and (b) the required
"no-capability run replays byte-identical to main" determinism test has a real
no-capability path. The skip is RNG- and state-neutral, so it changes nothing for
a run that always declines.

### The three capabilities (first-class engine mechanisms)

They are NOT hook-fired `Effect` verbs: a passive always-on tile invariant and two
player-invoked abilities do not fit the hook model (an `Effect` fires from an item
hook against a ConditionContext). Representing them as dead `Effect`-union entries
that no content uses would be the special-case the rule forbids. Instead:

1. **wildcard (`wild` tile flag + solver support).** When the player holds
   `'wildcard'`, the grid always carries exactly one playable wild tile. A wild
   counts as ANY letter, auto-resolved to whatever letter makes a valid,
   best-scoring word. The invariant is maintained by `withWild(state, ctx)`,
   called wherever the grid is handed back to the player (end of `turnStart`,
   which every path funnels through, plus the free-shuffle path): it places a
   wild on a deterministically (seeded RNG) chosen playable non-wild tile when
   none is present. A no-cap run never enters this path (no RNG consumed).
2. **transmute (`transmuteTile` action).** Once per fight, convert a chosen
   playable tile to the rare letter (K/J/X/Q/Z) that yields the best-scoring
   formable word (deterministic, no RNG); `evolution.transmuteUsed` guards it and
   resets at encounter start.
3. **letter-bank (`bankLetter` action + `submitWord` `spendBank`).** `bankLetter`
   stores a tapped tile's letter into the one slot (per run). A later
   `submitWord({ spendBank: true })` appends the banked letter to the word for
   scoring (letters, length, conditions, armour and resist all see the augmented
   word), then empties the slot. No RNG.

### The wildcard solver (the crown jewel)

The grid is a multiset of letters (no adjacency). The wild is modelled as "one
wildcard slot": a word is formable if its letter deficit against the NON-wild
playable letters is at most the wild count (one). New solver method
`solveWithWild(letters, wilds)`: same linear dictionary scan as `solve`, accepting
a word when `sum_c max(0, count_word(c) - count_grid(c)) <= wilds`. Because the
wild's own drawn letter is excluded from `letters` and re-added as a wildcard,
`solveWithWild(nonWild, 1)` is a strict SUPERSET of `solve(allPlayable)`: a wild
only ever adds words, never removes one (proved and tested). Consequences:

- `candidateWords` uses `solveWithWild` only when a playable wild is present, else
  `solve` exactly as before -> a no-wild grid yields byte-identical candidates.
- `isDead` is wild-aware the same way: a wild grid is dead only if even the
  wildcard makes no word. Since `solveWithWild` is a superset, this never leaves a
  truly dead grid (the guarantee holds) and never fires for a no-wild grid.
- `candidateIndices` maps a wild-enabled word to tiles, using the wild tile for
  the one deficit letter, so the sim bot can always play what it chose.
- `submitWord` / `scoreSelection`: when the selection contains the wild, sweep
  a..z for the letter that makes the highest-scoring valid word (tie -> first in
  a..z). Both use the SAME resolution and the SAME `selectionGold`, so the Attack
  preview equals the landed hit. A no-wild selection takes the literal path
  unchanged.

Determinism: every wild code path is gated behind the presence of a wild tile,
which exists only when the player holds `'wildcard'`. A run that never gains it
touches none of it; a run with it consumes seeded RNG only for wild placement,
threaded through `state.rng` like every other draw. `Math.random` is not used.

### Save / persist (v11)

- `RUN_STATE_KEYS` gains `evolution`; `looksLikeRunState` validates the evolution
  record (caps: string[], transmuteUsed: boolean, bankedLetter: string|null) and
  accepts an optional `wild === true` on a tile.
- `migrate` v10 -> v11 adds the empty evolution (old grids need no tile touch:
  `wild` absent = not wild).
- `dropUnknownIds` strips unknown capability ids from `evolution.caps` and nulls a
  bankedLetter that is not a single a..z letter.

## Task commits

1. State v11 + migration + capability offer flow + tests.
2. Wildcard verb (solver `solveWithWild`, wild-aware `isDead`/candidates,
   `withWild`, submit/preview resolution) + tests.
3. Transmute verb (`transmuteTile`) + tests.
4. Letter-bank verb (`bankLetter`, `spendBank`) + tests.
5. UI: capability step on the evolve screen; transmute and bank actions and the
   wild "?" tile on the fight screen.
6. Release notes (build 90) + ROADMAP.

## Risks

- **Wild-tile solver / determinism / dead grid** (the headline risk). Mitigated
  by gating every wild path behind a present wild tile, the superset proof, and a
  byte-identical-to-main determinism test using golden hashes captured from main.
- **Preview vs landed hit** for the wild resolution and the bank. Mitigated by a
  single shared resolution path used by both `scoreSelection` and `submitWord`.
- **Balance**: capabilities raise the greedy ceiling, the wildcard most. The
  coordinator re-confirms greedy < 90% and mediocre in band. Unit-level read:
  the wild counts as ONE letter (it fills a single deficit), is one tile, and is
  consumed when played; it widens the grid's word set but does not multiply
  damage. If a sim shows it clearly overpowered, the bound to reach for first is
  "the wild resolves only to a common letter" or "one wild per fight, placed at
  turn start, not always-present".
- **Scope creep toward 1C** (grid reshape): held; nothing changes GRID_SIZE.

## Amendments (Dean, 2026-09-11, after the first smoke)

- **Wildcard bounded to ONE PER FIGHT.** The always-present-and-refilling wild put the smoke greedy
  at 100%. New lifecycle: `withWild` places exactly one wild at a fight's first turn (`enc.turn === 1`)
  and never again; once played, the refill is a normal tile, so at most one wild exists per fight and
  it is gone after one use. Still any-letter and auto-resolving; seeded placement, solver superset and
  dead-grid safety unchanged. Smoke greedy dropped to 93.3% (still over the guard in the 30-run smoke;
  the coordinator's 500-run sims decide whether to bound further).
- **The capability pick is MANDATORY** (no skip). `skipCapability` and its UI are removed; you must
  take one of the offered capabilities. The offer stays deterministic (all unheld caps, zero RNG). The
  byte-identical-to-main guarantee no longer rests on declining: it is proved by a run driven only up
  to the first boss (never evolves, caps stays empty), which is byte-identical to main (golden captured
  from 8d18bfc).

## Acceptance

- `npm test` green, `npm run lint` clean, `scripts/sim.ts --runs 30` runs without
  error. (The coordinator runs the full balance sims and the adversarial gate.)
- v10 -> v11 migration loads a real v10 blob.
- The capability offer appears after a boss and a pick lands in `evolution.caps`.
- Each verb works: wild auto-resolves and forms a word a plain grid could not;
  transmute fires once per fight and resets; the bank stores and spends.
- A no-capability run replays byte-identical to main.
- The wild never yields a dead grid; state stays JSON-plain throughout.
