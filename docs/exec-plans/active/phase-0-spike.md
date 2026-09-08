# Exec plan: Phase 0 spike - is the loop fun?

Status: ACTIVE. Engine and sim built (main through 9f63d34, 2026-09-06).
Act-1 wave done on branch `tune/greedy-cap` (greedy cap, starting kit,
act-1 ease), awaiting its one adversarial round (engine changed) and
merge. Exit criteria: 3 of 4 pass on that branch; greedy 91.0% is noise
around the 90% line at n=500 (Dean). NEXT WAVE: act 2 (E4-E6) and the
final boss E9. See "Handoff" at the end.

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

## Results after the act-1 wave (branch tune/greedy-cap, pasted from the sim)

Dean's rulings (2026-09-06): greedy capped at 7 letters, uncapped policy
reported as `solver`; attacks stay per word; act 1 eased (variant A) AND
one starting pick (variant B) both become content; act 1 is not touched
again. The `pre-act1` variant restores the previous content so the
baseline stays reproducible.

Shipped content, `npx tsx scripts/sim.ts`:

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 10 items, variant base. 125.8s

|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    91.0% |           9 |       21.1 |         5 |   100 |    99 |    97 |    91 |    88 |    85 |    58 |    63 |    66 |
| mediocre |  500 |    23.2% |           4 |       32.6 |         8 |   100 |    92 |    71 |    34 |    25 |    19 |    16 |    19 |    19 |
|   solver |  500 |    99.2% |           9 |       15.3 |         4 |   100 |   100 |    99 |    96 |    96 |    96 |    81 |    86 |    89 |

Exit criteria:
  PASS  mediocre wins 20-40%
  FAIL  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

Previous content, `npx tsx scripts/sim.ts --variant pre-act1` (the `solver`
row is the old uncapped greedy, i.e. the baseline; `greedy` is cap only):

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 10 items, variant pre-act1. 39.9s

|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    59.4% |           9 |       21.2 |         4 |   100 |    96 |    89 |    62 |    60 |    58 |    39 |    44 |    47 |
| mediocre |  500 |     8.4% |           3 |       21.2 |         1 |   100 |    65 |    33 |     8 |    11 |    13 |    14 |    16 |    18 |
|   solver |  500 |    92.4% |           9 |       17.1 |         9 |   100 |    99 |    96 |    85 |    85 |    84 |    66 |    71 |    73 |

Exit criteria:
  FAIL  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

Where mediocre dies now (300 seeds, scratch diagnostic, shipped content):
reached E1..E9 then won: 300 300 299 258 147 90 71 71 71 71. HP lost per
encounter: 10 26 50 | 33 36 72 | 45 49 92. The wall moved from act 1 to
act 2, and E9 costs mediocre ~92-99 HP in every variant tried.

## Handoff (2026-09-06, session paused by Dean)

Immediate next step: the act-1 wave's single adversarial round (engine
files changed: `types.ts`, `reducer.ts`), then `merge --no-ff` into main
with a ROADMAP entry carrying the two pasted tables above. Then the
act-2 + E9 wave, content only, no gate:

- Targets (Dean): E9 costs mediocre 50-60 HP with a full kit (now ~92),
  greedy 25-35 (now ~54). Act 2 (E4-E6) so that more than 147 of 300
  mediocre runs reach E6. Do not touch act 1. Measure with
  `npx tsx scripts/sim.ts` and paste, never type.
- Levers are `src/content/acts.ts` (hpScale, damageScale per encounter)
  and `src/content/bosses.ts` (base hp 120, dmg 12, lockTiles every 3).
  A separate final-boss definition is allowed (content), a new effect
  type is not.
- Then the length-bonus question (ruling 3: lower exponent before
  linear) only if greedy still runs away after acts 2-3.

## Open questions for Dean (answered 2026-09-06; kept for the record)

Dean's answers, verbatim in substance:

1. Agree. Greedy capped at 7; uncapped `solver` reported, never judged.
2. Override, no. Attacks stay per word played. Pacing by tiles makes
   damage-per-tile the thing that matters and flattens the incentive to
   find long words, which is the core skill expression. If the numbers
   fail under attack-per-word, fix the HP curve and formula. Not a knob.
3. Override on sequencing: cap first, rerun, show tables before
   flattening. If flattening is still needed, a lower exponent before
   fully linear; "long word = event" is a stated goal.
4. Agree on sequencing. When items come up: the pool stays majority
   scoring modifiers. Armour and heal exist for attrition tension across
   the 9 encounters, not as the core. A flat-damage item is the least
   interesting kind of item there is.

Then (same day): A + B both become content; greedy 91% at n=500 is
noise; next wave is act 2 and E9 only, never act 1 again; E9 should cost
mediocre 50-60 HP with a full kit and greedy 25-35 so strong runs can
still die there. The questions as originally asked:


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
