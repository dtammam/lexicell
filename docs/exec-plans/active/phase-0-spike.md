# Exec plan: Phase 0 spike - is the loop fun?

Status: ACTIVE. Engine and sim built (main through 9f63d34, 2026-09-06).
Exit criteria NOT met. Awaiting Dean's decision on the structural finding
below before any further tuning or any item change.

Owner: main session (lean mode). This doc is the reviewers' spec and
survives context compaction. Spec of record: `docs/lexicell-architecture-pack.md`,
Implementation Roadmap, Phase 0.

## Goal

Validate the riskiest assumption: that word-spelling stays engaging when
difficulty scales through item multipliers rather than harder words.
Headless engine + sim, no UI, two bots, 500 seeded runs each.

## Dean's decisions on record

1. Player HP persists across encounters (scope conversation; fixed, not open).
2. Turn structure is Bookworm-faithful: 16 tiles, no timer, no adjacency,
   used tiles refill (pack assumption, unchallenged).
3. Theme is cosmetic (pack assumption, unchallenged).
4. No file under `src/ui/`, no new `Effect` variant, no change to the
   9-encounter run structure without Dean's explicit go (task brief).

## Deliverables (roadmap 1-8) and where they landed

| # | Deliverable | Commit | Tests |
|---|-------------|--------|-------|
| 1 | `rng.ts` seeded PRNG, determinism proven | 2c1698e | 14 |
| 2 | dictionary: ENABLE, 3-15 cap, blocklist | 97f215d | 8 |
| 3 | `solver.ts` all words from 16 tiles, < 20 ms | 209addf | 10 |
| 4 | `scoring.ts` placeholder formula (+ `effects.ts`, `types.ts`) | 50dc9d4 | 13 |
| 5 | ten items across all 5 hooks, using 8 of the 11 effect types | c96905c | 7 |
| 6 | 3 enemies + 1 boss, HP curve in content | 95d0cf8 | 4 |
| 7 | `grid.ts` + `reducer.ts` full run loop | 79adb44, 32490cb | 19 |
| 8 | `scripts/sim.ts` two bots, table, criteria | da454bc, 24efb16 | 5 |
| - | length-bonus table moved into content tuning | 9f63d34 | - |

`npm test`: 80 tests, 10 files, green. `npm run lint`: clean.

## Measured results (command: `npm run sim` and `npm run sim -- --items none`, seeds 0-499)

| bot | items | win rate | median encounter | mean HP at start of E1..E9 |
|-----|-------|----------|------------------|----------------------------|
| greedy | all 10 | 92.4% | 9 | 100 99 96 85 85 84 66 71 73 |
| mediocre | all 10 | 8.4% | 3 | 100 65 33 8 11 13 14 16 18 |
| greedy | none | 0.0% | 7 | 100 99 95 75 68 57 21 17 14 |
| mediocre | none | 0.0% | 3 | 100 65 28 |

Exit criteria:

| Criterion | Result |
|-----------|--------|
| mediocre wins 20-40% | FAIL (8.4%) |
| greedy wins but < 90% | FAIL (92.4%) |
| no run hits a zero-word grid | PASS (sim throws on one; 2000 runs clean) |
| win rate moves with items | PASS (92.4% -> 0.0% with the pool removed) |

## The structural finding

On a fresh grid at turn 1, 300 seeds, the uncapped best-word policy
(`greedy` at this commit; renamed `solver` once the cap lands) versus
mediocre. Command: `npm run diag:words`, committed after the gate asked
for a reproducible source; these are its numbers:

| bot | mean word length | mean damage | letter sum only | letter sum per tile |
|-----|------------------|-------------|-----------------|---------------------|
| greedy (uncapped) | 9.9 | 66.8 | 16.8 | 1.70 |
| mediocre | 4.5 | 8.3 | 6.7 | 1.49 |

The damage ratio is 8.1x, of which 2.5x is letter sum before any length
bonus. With the enemy attacking once per player turn, damage taken scales
with turns-to-kill, so mediocre takes roughly 8x the hits. By arithmetic
the two win-rate bands can only hold together when the ratio is near
1.5x, and no length bonus that still rewards long words gets there. The
sweep (below) will quantify the best reachable point under the current
structure, but the shape of the answer is already known.

Two observations for Dean, in the order I would take them:

1. **The greedy bot is a solver, not a human ceiling.** Sixteen
   unconstrained letters routinely contain a 10-letter word. A human
   finds 6-7. If greedy were capped at 7 letters the ratio drops to
   about 3x. Still not enough alone, but it changes what "greedy < 90%"
   is testing.
2. **The enemy clock.** If enemy attacks were paced by tiles consumed
   rather than words played, damage per tile is nearly equal between the
   bots (1.70 vs 1.49 per tile at letter sum) and long words stay
   events. This is a turn-structure change and therefore Dean's call.

## Open questions for Dean (numbered; reply "agree" or override per number)

1. Cap the greedy bot at 7 letters so it models a strong human rather
   than a solver? **Recommend: yes**, and keep an uncapped `solver` bot
   in the sim as an upper bound that is reported but not a criterion.
2. Pace enemy attacks by tiles consumed instead of turns? **Recommend:
   try it in the sim as a content-tunable knob before deciding**; it is
   one line in the reducer's enemy turn plus a tuning field. If it
   works, it is the formula the pack says the spike should find.
3. Flatten the length bonus? **Recommend: yes, modestly** (linear
   +0.25 per letter from 5), independent of 1 and 2.
4. Items: shift the placeholder set toward flat damage, armour and
   healing, which compress the skill gap, and away from multipliers,
   which widen it? **Recommend: after 1-3 are settled**, since the brief
   says formula and curve before items.

## Task commits (remaining Phase 0)

- T1 SWEEP: scratch sweep over length-bonus tables x HP/damage curve
  multipliers, 150 runs per bot per cell. Results into this plan as a
  table. No engine change.
- T2 (pending Dean on Q1/Q2): bot cap and/or tile-paced enemy clock as
  content-tunable knobs, with tests, sim re-run, table here.
- T3 GATE: full two-reviewer gate over the whole pre-harness history,
  all 12 commits through 9f63d34 (`git log 9f63d34`; the root scaffold
  commit owns the purity lint), since those commits predate the harness
  (tech-debt #1). Named attack
  surfaces for the adversarial seat: RNG threading in `refill`/
  `freshGrid`/`lockTiles`, JSON round-trip of `RunState` under
  `exactOptionalPropertyTypes`, the dead-grid guard with locked tiles,
  EFFECT_ORDER binding, and every sim number in this plan.
- T4 REPORT: exit-criteria verdict to Dean as a table; move this plan to
  `completed/` only when Dean signs off Phase 0 (met, or consciously
  redefined).

## Risks

- The criteria may be mutually unreachable under the pack's turn
  structure. Then the spike has done its job: the answer is "rethink the
  scoring model", which the roadmap explicitly allows.
- Tuning against bots can overfit to bot behaviour. Dean's own play in
  Phase 1 is the real test; the sim only has to reject broken curves.
