# Roadmap

The phases and their exit criteria are defined in
`docs/lexicell-architecture-pack.md` (Implementation Roadmap). This file
tracks what is planned and what shipped, honestly: what the gate caught
and what is still open ships disclosed here.

## Planned

### Phase 0 - Spike: is the loop fun? (CLOSED 2026-09-08, plan in `docs/exec-plans/completed/phase-0-spike.md`)

- [x] rng, dictionary, solver, scoring, effects, hooks, 10 items, 3 enemies + 1 boss, reducer, sim harness
- [x] Exit criteria: mediocre 23.2% (band 20-40%), no dead grids, items move win rate (0.0% with `--items none`). Greedy 91.0% against the < 90% bar: Dean ruled it noise at n=500 (2026-09-06) and signed Phase 0 off as met on 2026-09-08. Disclosed, not hidden.
- [x] Dean's decisions on the structural finding: greedy capped at 7, attacks stay per word, act 1 eased plus a starting kit, act 2 and E9 next.

### Phase 1 - Walking skeleton (BUILT 2026-09-08, plan `docs/exec-plans/active/phase-1-walking-skeleton.md`)

- [x] Vite + Svelte 5 + PWA scaffold, persist, store, Fight/Pick/Summary screens, nginx image, CI and publish workflows (see Shipped)
- [ ] Exit: Dean plays one fight on his phone from the home-screen icon, offline. Needs HTTPS on the NUC and the Docker Hub secrets on the repo. The plan moves to `completed/` when Dean ticks this.

### Phase 2 - MVP

### Phase 3 - Iterations

## Open

Ordered as Dean set it on 2026-09-08 ("design wave" bookkeeping, then
the landscape fit, the effects wave in full, run history, starting
cells).

- **Effects wave: closed** (PR #47, 200 items, curve F). The plan is
  in `docs/exec-plans/completed/effects-wave.md`. Left for later: a
  10,000-run per-item table to make the two-point reskin rule
  measurable; the 3000-run tables catch degenerate and never-picked
  items only.
- **Run history with export**: built (PR #51), reviewer round pending.
- **Clarity feedback batch** (a tester via Dean, 2026-09-08): names
  shown twice on the fight screen; a busy backdrop; no clear cue that
  a turn ended; no view of the enemy's next action (Slay the Spire
  intent); cells should look more cellular; a visual indicator for
  organelles that fire; a stats HUD later (best and worst word).
  Proposed as one UI PR after run history, before starting cells.
- **Logo, round two** (Dean, 2026-09-08): none of the first three
  landed; B (the amoeba) was closest. Second page of directions.
- **Starting cells**: built (PR #53), reviewer round pending; five cells
  within the band. Next for cells: their own sprites (with the sprite
  pass the tester asked for).
- **Daily seed** as the return hook (Phase 3 in the pack; no
  achievements). **Sound and graphics direction**: deliberately not
  yet (Dean).
- **"Is it fun enough?"**: a measured answer on word length and the
  letter pool, then whatever it points at.
- The enforcement layer of the harness (PreToolUse staging block,
  session-start hook, `.claude/settings.json`, pre-commit sim smoke,
  pre-push hook, the Node built-ins lint ban) sits on branch
  `harness/enforcement` awaiting Dean's own review. Dean's rule: the
  agent does not merge changes to its own constraints. Until it merges,
  CLAUDE.md and CONTRIBUTING describe hooks that are not yet installed.
  Trackers #1 and #2 close with it.
- **Dean's own checks**: the Phase 1 exit (HTTPS on the homelab,
  home-screen install, airplane-mode load); the iPhone playtester's
  portrait clipping after PR #34; greedy's fall to 66% under curve D.
- Sim harness suspicion (adversarial round, not a finding): a scramble
  on an encounter's final turn could be counted twice because the
  `pickItem` batch inherits the previous `lastTurn`. Measured 0
  occurrences over 1500 runs. Pre-dates the act-1 wave.

Settled since this list was first written: the act 2 and E9 tuning
wave (curve C in PR #19, curve D in PR #41); the save schema is v3 and
persist refuses every other version (tracker #3 closed).

## Shipped

### Starting cells (PR #53, 2026-09-08)

Dean's five answers: agree with all. Five cells in `src/content/cells.ts`,
each stats plus always-on hooks in the item vocabulary, gathered before
the items in every hook: Amoeba (100 HP, no traits: the game as it was),
Predator (85 HP, +25% damage, every hit hurts 1 more), Diatom (120 HP,
3 less per hit, -15% damage), Spore (90 HP, 6+ letters +60%, 3-letter
words half), Mycelium (90 HP, one extra kit pick, -15% damage). Picker
after New run, before the intro; the summary's New run keeps the cell;
the cell shows on the summary and in history. `RunState.cell`,
`SAVE_VERSION` 4; a v3 save loads as Amoeba (question 3: a migration,
the first on record). `--cell` on the sim. 229 tests.

Tuning pass against the acceptance (every cell within 10 points of
Amoeba's 25.2% for the mediocre bot, none above 90% greedy). First
draft: Predator (80 HP, +2 per hit) 14.8%, Spore (double on 6+, half on
4 or fewer) 13.6% with greedy at 89.2%, Mycelium (100 HP, 5 shield per
fight) 52.0%: an extra pick is worth 27 points to a bot that reads
offers. Shipped numbers, all PASS:

`npx tsx scripts/sim.ts --cell balanced`, Amoeba (balanced, the default):

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|   greedy |  500 |    57.6% |           9 |       20.7 |         0 |       15 |   100 |   100 |    97 |    90 |    90 |    89 |    62 |    66 |    69 |
| mediocre |  500 |    25.2% |           6 |       30.3 |         0 |        1 |   101 |    94 |    79 |    58 |    55 |    56 |    37 |    46 |    54 |
|   solver |  500 |    80.0% |           9 |       15.9 |         1 |        8 |   100 |   100 |    99 |    96 |    96 |    96 |    80 |    80 |    79 |
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
```

`npx tsx scripts/sim.ts --cell aggro`, Predator (aggro):

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|   greedy |  500 |    61.2% |           9 |       17.9 |         0 |        8 |    85 |    85 |    83 |    78 |    78 |    78 |    56 |    59 |    61 |
| mediocre |  500 |    20.8% |           6 |       25.2 |         2 |        0 |    86 |    80 |    65 |    46 |    45 |    47 |    32 |    43 |    54 |
|   solver |  500 |    82.2% |           9 |       13.9 |         0 |       11 |    85 |    85 |    85 |    83 |    83 |    83 |    71 |    72 |    71 |
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
```

`npx tsx scripts/sim.ts --cell defensive`, Diatom (defensive):

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|   greedy |  500 |    66.6% |           9 |       24.1 |         3 |       18 |   120 |   120 |   118 |   113 |   113 |   112 |    82 |    82 |    84 |
| mediocre |  500 |    30.8% |           7 |       41.2 |         1 |        0 |   121 |   119 |   110 |    91 |    87 |    84 |    50 |    61 |    69 |
|   solver |  500 |    87.6% |           9 |       17.7 |         0 |       13 |   120 |   120 |   120 |   117 |   117 |   117 |   102 |   101 |    99 |
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
```

`npx tsx scripts/sim.ts --cell gambler`, Spore (gambler):

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|   greedy |  500 |    79.2% |           9 |       16.0 |         0 |        7 |    90 |    90 |    89 |    86 |    86 |    86 |    70 |    70 |    71 |
| mediocre |  500 |    23.4% |           6 |       29.2 |         1 |        0 |    91 |    84 |    69 |    49 |    48 |    50 |    35 |    43 |    50 |
|   solver |  500 |    95.0% |           9 |       12.5 |         1 |        1 |    90 |    90 |    91 |    90 |    90 |    91 |    83 |    84 |    83 |
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
```

`npx tsx scripts/sim.ts --cell tinkerer`, Mycelium (tinkerer):

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|   greedy |  500 |    56.0% |           9 |       21.0 |         0 |       39 |    91 |    90 |    88 |    82 |    82 |    80 |    57 |    60 |    62 |
| mediocre |  500 |    34.2% |           7 |       33.9 |         5 |        1 |    92 |    88 |    76 |    60 |    60 |    62 |    41 |    51 |    58 |
|   solver |  500 |    76.4% |           9 |       16.4 |         2 |       11 |    91 |    91 |    90 |    88 |    88 |    88 |    73 |    73 |    74 |
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
```

Gate: adversarial round on the engine, the save migration and persist
(below, once it reports).

### Run history with export (PR #51, 2026-09-08)

Dean's four answers: agree with all. A per-device list under
`lexicell.history` (v1, cap 200, oldest fall off), written once when a
run reaches its summary and once when a live run is abandoned from the
menu; `lexicell.run.started` carries the start time per seed. Export
JSON (lossless) and CSV (RFC 4180, items joined by `;`) as downloads;
History screen from the title and from the summary, newest first, tap a
row for seed, build and the full organelle list; Clear behind a
two-step. The reducer and RunState are untouched. Found on the way: the
title kept offering Continue after a finished run in the same session
(hasSave was set once and never re-derived); it is now derived from
the live run's phase. 218 tests. Gate: adversarial round on history.ts
and the store hook (below).

### Effects wave, content batch 3: the pool reaches 200 (PR #47, 2026-09-08)

The last forty-three items (22 common, 12 uncommon, 8 rare, 1 mythic):
the pool is 200 exactly at the plan's composition, 90 / 60 / 38 / 12.
Rare-letter scaling (Flagellin), the venom capstone (Venom Heart), lock
synergy (Warden), missing-HP (Pressure), cadence (Syncopation,
Clockwork), first-turn (Pulsar), finishers (Scalpel), a shuffle economy
(Slipstream), trades (Ballast, Wellspring), and Protocell as the twelfth
mythic. Curve F, the one tuning pass promised for the final pool: act 3
damage 2.4 / 2.7 / 2.8 (was 2.8 / 3.1 / 3.2; hp unchanged), because the
bigger pool and the lock removals had pulled greedy to 53.6% on curve D.
Measured on the way: curve D 53.6 / 31.4, act 3 damage minus 0.2 each
56.8 / 32.6, minus 0.4 each (curve F, shipped) 59.4 / 33.6.

The 3000-run per-item table on curve F then caught a family, not an
item: lifesteal. With the greedy bot's big words, Siphon at a quarter
(common) won 90%, Hemolymph 92%, Zooxanthellae 93%, Osmoregulator 91%,
Glutton 99%; every lifesteal fraction came down (Siphon and Glutton to
15%, Zooxanthellae 25%, Hemolymph 30%, Osmoregulator and Phage 15%;
the mythics keep theirs). Pressure, an uncommon, won 87% for the
mediocre bot in 294 runs: now +2 per missing tenth and no heal on hit.
The low-HP heal-on-hit locks (Endospore 96%, Second Wind 99%,
Membrane Pump 90% for greedy) were trimmed. Draw-bias traps got a
flat bonus to stand on (Vowel Magnet 1.2 and +3, Chemotaxis 1.3 and
+3, Lodestone 1.5, Patience heals 6). Curve F before those edits:
greedy 59.4%, mediocre 33.6%, solver 81.0%.

`npx tsx scripts/sim.ts` on curve F with 200 items, shipped:

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    57.6% |           9 |       20.7 |         0 |       15 |   100 |   100 |    97 |    90 |    90 |    89 |    62 |    66 |    69 |
| mediocre |  500 |    25.2% |           6 |       30.3 |         0 |        1 |   101 |    94 |    79 |    58 |    55 |    56 |    37 |    46 |    54 |
|   solver |  500 |    80.0% |           9 |       15.9 |         1 |        8 |   100 |   100 |    99 |    96 |    96 |    96 |    80 |    80 |    79 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

All three criteria pass with the whole pool. Mediocre sits lower in
its band than before the lifesteal and Pressure fixes; those items had
been carrying it. Per-item table at 3000
runs per bot: `docs/sim/batch-3-impact.md`. The effects wave closes:
plan moved to `docs/exec-plans/completed/effects-wave.md`.

### Effects wave, content batch 2 and harness fixes (PR #45, 2026-09-08)

Forty-five items in synergy pairs (22 common, 13 uncommon, 8 rare, 2
mythic) for 157: venom you make yourself and then feed on (Venom
Reservoir, Antivenin, Venom Loop, Venom Crown, with Scavenger from
batch 1), missing-HP scaling (Crust, Adrenaline, Frenzy), turn cadence
(Circadian Clock, Overclock, Hourglass, Metronome, Lantern), consonant
or vowel sides, first-turn bursts (Sprint, Ambush), finishers (Reaper),
and two mythics (Singularity: +1 per letter per organelle; Eternal
Return). Harness, as the gate disclosed: the sim table gains a
`shuffles` column and no longer counts shuffles as scrambles; the bots'
free-shuffle rule fires (greedy and solver below six letters, mediocre
when it has no 4-5 letter word); `scripts/item-impact.ts` is in the
repo with `--runs` and `--bot`. No curve change.

The first per-item table (3000 runs per bot) caught three more
degenerate items and four traps. Numbing Barb (stun on every 6+ word)
and Neurotoxin (stun on every 5+ word) were permanent locks for the
greedy bot at 98% each, the same shape as Paralytic: Numbing Barb now
poisons, Neurotoxin's stun fires every second turn. Zooxanthellae at
half lifesteal was a full heal every word (100% greedy): now 35%.
Endospore (pre-existing, 92% greedy) 7 to 5 reduction. Traps, all well
under base for both bots: Venom Loop (venom 2 and heal 3 lost to its
own bites) now venom 1 and heal 4; Vowel Magnet 1.8 to 1.4; Chemotaxis
2.0 to 1.5; Bait 1.5 to 1.3 plus +3 damage. A heavy draw bias narrows
the grid more than it helps.

`npx tsx scripts/sim.ts` before those edits: greedy 57.0%, mediocre
22.4%, solver 79.4%. After (shipped):

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    53.4% |           9 |       20.2 |         2 |       10 |   100 |   100 |    97 |    90 |    90 |    89 |    63 |    66 |    68 |
| mediocre |  500 |    22.0% |           6 |       32.0 |         8 |        1 |   101 |    94 |    79 |    58 |    57 |    59 |    38 |    45 |    55 |
|   solver |  500 |    79.6% |           9 |       15.4 |         0 |       10 |   100 |   101 |   100 |    97 |    97 |    97 |    82 |    81 |    80 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

All three pass, but both rates fell with the bigger pool and the lock
removals (mediocre 30.8 to 22.0, greedy 66.0 to 53.4): a larger pool
dilutes the strong picks, several new items are trades, and the greedy
bot had been leaning on the locks. Curve D is left alone until batch 3
completes the pool, when one tuning pass covers the final 200 and
brings greedy back toward the sixties; if act 3 feels like a wall in
Dean's runs before then, that is the lever. Per-item table at 3000 runs per bot: `docs/sim/batch-2-impact.md`.

### Effects wave, UI and content batch 1 (PR #41, 2026-09-08)

Stacked on PR #39 as PR #40, which GitHub closed when the stacked base
branch was deleted at #39's merge; #41 is the same branch against main. UI: the shield rides the HP bar as a second segment
with a "+n" label, poison and stun badge the enemy sprite, the shuffle
button reads "Free xN" in the life colour while a charge is held and
needs no arming, report lines for poison, stun, shield and redraws,
redrawn tiles blink in place, the compendium states the two-commons
rule; `--shield` token. Content: forty items on the new verbs (20
common, 12 uncommon, 7 rare, 1 mythic) for 112 in total, glyphs from
the templates. Curve D: act 2 damage 1.2 / 1.4 / 1.9 (was 1.1 / 1.3 /
1.7), act 3 hp 3.1 / 3.5 / 3.0 and damage 2.8 / 3.1 / 3.2 (was 2.8 /
3.2 / 2.6 and 2.2 / 2.5 / 2.5), because the new pool and the offer
rule made act 3 a cruise for the mediocre bot (HP rising through acts
3 on curve C). Act 1 untouched. 193 tests.

`npx tsx scripts/sim.ts` on curve C with the 112 items (before the
curve change; mediocre out of band, tracker #7):

```
|   greedy |  500 |    81.6% |           9 |       20.7 |        16 |   100 |   100 |    98 |    92 |    92 |    92 |    74 |    76 |    77 |
| mediocre |  500 |    45.8% |           9 |       37.1 |        13 |   101 |    95 |    80 |    59 |    59 |    60 |    47 |    56 |    63 |
|   solver |  500 |    95.6% |           9 |       14.9 |         6 |   100 |   101 |   100 |    98 |    98 |    99 |    88 |    89 |    89 |
```

The first per-item table (1500 runs per bot) caught a degenerate item:
Paralytic stunned on every word, a permanent lock against every-turn
attackers, 98% wins for the mediocre bot in the 154 runs that held it.
It now stuns every second turn. Carapace 8 to 12 shield and Chrysalis 3
to 4 shield were the two shield items with n > 100 sitting under the
base rate. Mediocre on curve D before those three edits: 35.2%.

`npx tsx scripts/sim.ts` on curve D with the three edits (shipped):

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    66.0% |           9 |       20.6 |        13 |   100 |   100 |    98 |    92 |    91 |    91 |    70 |    72 |    74 |
| mediocre |  500 |    30.8% |           6 |       34.0 |        10 |   101 |    95 |    79 |    58 |    57 |    58 |    38 |    45 |    53 |
|   solver |  500 |    85.0% |           9 |       15.3 |         6 |   100 |   101 |   100 |    98 |    98 |    98 |    85 |    84 |    83 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

All three criteria pass; tracker #7 closes. Greedy fell from 78% to
66%: the harder act 3 costs the strong human too, and 66% is inside
the criterion but worth watching in Dean's own runs. Per-item table:
`docs/sim/batch-1-impact.md` (1500 runs per bot, pasted). The plan's
cut rule (an item within 2 points of base for both bots is a reskin)
is not measurable at this sample: an item is held in roughly 100 of
1500 runs, so its win-with rate carries about plus or minus 10 points.
At 1500 runs the table catches degenerate items (Paralytic) and items
the mediocre bot never takes (seven, all gated on conditions its 4-5
letter words cannot meet), not two-point reskins. A 10,000-run table
is a batch-2 job.

### Effects wave, engine PR (PR #39, 2026-09-08)

Dean agreed all six plan questions. Nine verbs (poisonEnemy, stun,
shield, lifesteal, freeShuffle, redrawTiles, letterWeight, maxHp,
perUnit), seven conditions (startsWith, endsWith, uniqueLetters,
repeatLetter, enemyHpBelow, minVowels, firstTurn), the onPick hook,
save v3 (v2 dropped), an offer that holds at most two commons. Bots:
offerScore reads the new verbs and breaks ties by rarity (closes
tracker #6); greedy and solver spend a free shuffle rather than play a
word under five letters. No content changed: the 72 items are as
before. 192 tests.

`npx tsx scripts/sim.ts` at 1b99bf1 (offer rule on, rarity tiebreak on):

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    78.0% |           9 |       18.5 |         8 |   100 |    99 |    97 |    91 |    91 |    89 |    68 |    69 |    69 |
| mediocre |  500 |    48.4% |           9 |       34.3 |        12 |   100 |    94 |    80 |    60 |    59 |    60 |    37 |    44 |    49 |
|   solver |  500 |    94.4% |           9 |       13.6 |         4 |   100 |   100 |    99 |    97 |    96 |    96 |    86 |    86 |    85 |

Exit criteria:
  FAIL  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

The mediocre criterion FAILS. Measured one variable at a time
(`--bot mediocre`, same seeds, edits reverted after each run):

```
== A: rarity tiebreak off (offer rule on)
| mediocre |  500 |    39.8% |         7.5 |       33.4 |         7 |   100 |    94 |    79 |    57 |    55 |    56 |    32 |    38 |    41 |
== B: offer rule off (tiebreak on)
| mediocre |  500 |    44.2% |           9 |       33.9 |        12 |   100 |    94 |    80 |    59 |    58 |    59 |    33 |    39 |    44 |
== C: both off
| mediocre |  500 |    36.4% |           7 |       33.4 |         7 |   100 |    93 |    79 |    57 |    56 |    56 |    31 |    34 |    37 |
```

Gate (adversarial, two rounds): round one found the perUnit cap
skipping count one and per-child instead of total (fixed: every child
under a perUnit scales, the scalers' addMult is capped as a total), and
six binding gaps (RNG advance in redraw and free-shuffle scramble, stun
cadence on a two-turn attacker, pure-perUnit preview, conditionCtx
wiring, onPick target), all bound by tests; persist now rejects an
enemy without poison/stunned; turnEvery never fires at turn 0. Round
two APPROVEd with three one-assertion follow-ups, landed in the merge.
Disclosed (S7): the bots' free-shuffle rule is nearly inert (0 shuffles
in full greedy runs holding 500 charges) and the sim's "scrambles"
column counts every shuffle, so once free-shuffle items ship it
conflates shuffles with dead-grid scrambles; both are harness work for
batch 2.

So the offer rule (Dean's design, question 2) is worth about 3.5
points and the bot reading rarity about 8. The second is a change to
the instrument, not the game: a casual player who takes the glowing
item was always winning more than the old bot said. Both ship. The
plan's acceptance line ("criteria pass after the engine PR with the
existing 72 items") is NOT met and is moved to content batch 1, which
reworks the 72 anyway and lands with the UI PR (tracker #7).

### Small PRs under iteration mode (one line each, newest first)

- PR #50 (2026-09-08): the missed-word reveal names only words that are
  gone from the new grid, never one still spellable (Dean: it read as
  a cheat).
- PR #49 (2026-09-08): "tiles do not need to touch" said outright on the
  How to play card and in the first-fight hint (a player assumed Boggle
  adjacency).
- PR #46 (2026-09-08): readability after a tester's session: tiles
  carry two signals (vowel fill, rare edge; the mid tier and `--mid`
  are gone), a How to play card from the title with the legend at
  real point values, a first-fight hint line, a per-device Readable
  type toggle (system sans), Pixelify Sans ligatures off ("find" had
  read as "And").
- PR #44 (2026-09-08): landscape fight bounded to the viewport (side
  and board columns; the report absorbs the squeeze). Dean: "landscape
  requires scrolling". Not verified on a device.
- PR #43 (2026-09-08): bookkeeping; Open list in Dean's order; the
  three design pillars written into the pack.
- PR #42 (2026-09-08): keyboard play on desktop: letters select tiles
  (venomed first), Backspace undoes, Enter attacks, Escape clears; hint
  on fine-pointer devices only. Dean's ask, queued behind the wave.
- PR #38 (2026-09-08): Dean's type-lab readout shipped: Press Start 2P
  for tiles, the word line, HUD and buttons; Pixelify Sans for
  headings, names and prose. Silkscreen and DotGothic16 removed; two
  vendored faces. The armed shuffle label shortened to fit the wide
  face.
- PR #37 (2026-09-08): playtest-log row for the type lab.
- PR #36 (2026-09-08): DotGothic16 vendored as the HUD face (Dean's
  pick from seven faces); Silkscreen keeps tiles, the word line and
  headings; no digit under 16 px; tabular digits.
- PR #35 (2026-09-08): CI runs once per commit (pull_request only);
  the push twin of a green run had failed jobless and tripped the
  merge watcher, which had not gated the merge on it. Chains gate now.
- PR #34 (2026-09-08): fit any viewport after an iPhone 17 playtest
  (top lost in portrait, actions lost in landscape): hidden-scrollbar
  fallback, two-column landscape fight, grid floor 160 px, capped items
  sheet, no double-tap zoom. Not verified on the device.
- PR #33 (2026-09-08): v1 scope changed to a 200-item pool (pack
  updated); effects wave exec plan opened with six questions for Dean.
- PR #32 (2026-09-08): intro grid reads LONG WORD HITS HARD.

### Mythic tier and 72 items (PR #31, 2026-09-08)

Dean: even more items, and a mythic pool, explicitly powered. `Rarity`
gains `mythic` at offer weight 0.35 (engine touch, one adversarial
round). Fourteen more regulars to 64, then eight mythics that break
the rules on purpose within the vocabulary: triple damage, heal to
full, 25 a turn, immunity on even turns. Measured at 500 mediocre
runs: 22% of runs pick a mythic and those win 65% against 37% overall.
Shipped content, `npx tsx scripts/sim.ts`:

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    77.8% |           9 |       18.6 |         8 |   100 |    99 |    97 |    91 |    91 |    90 |    69 |    70 |    71 |
| mediocre |  500 |    37.0% |           7 |       33.5 |         7 |   100 |    93 |    79 |    57 |    56 |    56 |    31 |    35 |    38 |
|   solver |  500 |    94.4% |           9 |       13.7 |         4 |   100 |   100 |    99 |    97 |    96 |    96 |    85 |    85 |    84 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

Mediocre sits at the top of its band; the per-item table shows the
mythics winning between 50% and 100% of the runs that hold them, which
is the intent.

Gate (adversarial, one round): the reduceDamage floor at zero had no
test and Tardigrade's 999 made it load-bearing (a mutant dropping it
turned an enemy hit into a full heal); Sheath's text said odd turns
but turnEvery 1 fires every turn, now even turns; the mythic offer
weight had no binding test. All three fixed in the round. Disclosed:
the mediocre bot's offer score rates five of the eight mythics no
higher than an ordinary two-effect common and passed on 43% of the
mythics it was offered, so "22% pick a mythic" is a bot artefact, not
the items' pull (tracker #6).

### Item pool 24 to 50 (PR #30, 2026-09-08)

Dean: "a ton more items." Twenty-six more from the existing effect
vocabulary, with identities the first two dozen lacked: thorns
(Spine, Hydra), self-venom for power (Toxin Sac), chaos for damage
(Flagellar Motor), a glass cannon that bleeds (Apoptosis), HP and turn
gates, letter families. Glyphs for the new ones are procedural from a
few organelle templates in scripts/sprites.py, seeded by id; any can
be replaced by a hand-drawn map. Three sustain items that made greedy
unbeatable (Regeneration, Cyst, Membrane Pump at 98 to 100% with) were
trimmed. Shipped content, `npx tsx scripts/sim.ts`:

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    76.4% |           9 |       18.5 |         3 |   100 |    99 |    97 |    91 |    91 |    91 |    71 |    72 |    72 |
| mediocre |  500 |    25.2% |           6 |       32.2 |         6 |   100 |    94 |    78 |    54 |    52 |    52 |    23 |    28 |    32 |
|   solver |  500 |    95.0% |           9 |       13.6 |         4 |   100 |   100 |    99 |    97 |    97 |    97 |    87 |    88 |    88 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

With fifty items the mediocre bot, which reads offers, is back inside
its band; greedy dropped because offense is spread thinner. Both pass.

### Item pool 10 to 24 (PR #24, 2026-09-08)

Dean: the first offer was always the same commons. Fourteen items from
the existing effect vocabulary (six common, five uncommon, three rare,
two of them trade-offs), each with a hand-drawn glyph. Balance by
measurement: Regeneration and Cyst were near-100% wins (heal on every
hit) and were trimmed; the wider pool diluted sustain and offense, so
flat items were raised across the board. The mediocre bot now reads
an offer and prefers items whose conditions it can meet, as a casual
human does; the random picker wasted picks on 6+ letter items.

Shipped content, `npx tsx scripts/sim.ts`:

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    86.6% |           9 |       17.4 |         3 |   100 |    99 |    97 |    92 |    92 |    92 |    75 |    77 |    79 |
| mediocre |  500 |    17.8% |           6 |       29.3 |        16 |   100 |    93 |    77 |    54 |    53 |    53 |    23 |    27 |    26 |
|   solver |  500 |    95.6% |           9 |       13.0 |         5 |   100 |   100 |    99 |    97 |    97 |    97 |    89 |    90 |    91 |

Exit criteria:
  FAIL  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

Disclosed: mediocre sits at 17.8% at 500 runs, below the 20-40 band
by 2.2 points (a 300-run sweep read 20.0%). Softening act 3 or E9 did
not move it and pushed greedy past 90, so curve C stays; the miss is
the price of a pool a human can build with, and the next lever is
rule-bending effects, not numbers.

### Tuning wave (PR #19, 2026-09-08): the boss lock lands, venom, acts 2 and 3

The boss's lock now skips the tiles of the word just played, so it
locks its full count (tracker #5 closed). Venom is the first tile
hazard: the Polyp venoms one tile every third turn; it bites at each
turn start and grows to `tuning.venomMax` (4) until spent, shuffled or
scrambled. Save version is 2; v1 saves are dropped on load, no
migration (no users yet). The bots now spend a venomed tile when a
word allows, as any human would; without that venom took mediocre from
22% to 9%. Curve C from a 300-run sweep: act 2 softer, act 3 harder.

Shipped content, `npx tsx scripts/sim.ts`:

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    87.2% |           9 |       21.2 |         8 |   100 |    99 |    97 |    91 |    91 |    91 |    62 |    64 |    65 |
| mediocre |  500 |    24.6% |           5 |       34.9 |        10 |   100 |    92 |    70 |    35 |    32 |    30 |    17 |    19 |    20 |
|   solver |  500 |    98.8% |           9 |       15.4 |         5 |   100 |   100 |    99 |    96 |    97 |    98 |    83 |    86 |    86 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

All three measurable Phase 0 criteria pass at 500 runs for the first
time. Dean's E9 targets: greedy's E9 costs 32.6 HP (25 to 35 asked);
48.7% of mediocre runs reach E6 (49% asked); the mediocre E9 cost is
not measurable with bots, since the only mediocre runs that reach E9
are the ones that win. `--variant pre-act1` (act 1 at full strength)
now reads greedy 56.8%, mediocre 8.8%, solver 89.2%.

### Gravity and cleaner tiles (PR #3, 2026-09-08)

Used tiles leave, survivors rise in their column, fresh letters land at
the bottom and animate in; a shuffle settles the same way. Plain tiles
lost the corner value (it read as a count); only the lock countdown
remains. Engine change (`settle` after refill, `used` on the turn
report), one adversarial round. Shipped content, `npx tsx scripts/sim.ts`:

```
|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    91.2% |           9 |       21.1 |         4 |   100 |    99 |    97 |    91 |    88 |    85 |    58 |    63 |    66 |
| mediocre |  500 |    24.2% |           4 |       33.2 |         7 |   100 |    92 |    71 |    34 |    25 |    19 |    18 |    20 |    20 |
|   solver |  500 |    99.2% |           9 |       15.3 |         4 |   100 |   100 |    99 |    96 |    96 |    96 |    81 |    86 |    89 |

Exit criteria:
  PASS  mediocre wins 20-40%
  FAIL  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

Shifts from the act-1 tables, measured by the gate: base mediocre win
rate +1.0 points (5 runs), mean turns +0.6, HP columns up to +2;
pre-act1 solver -0.6 points, greedy -0.4, HP up to -2. Boss locks and
vowel-floor swaps land on different letters now that positions move.
Criteria unchanged. The gate also found that the boss's lock is lost on
most specials, on main as well; tracker #5, fixed with the tuning wave.

### Feel wave (PR #1, merged 2026-09-08)

Dean played the skeleton and asked for clarity and feel. Shipped:
green-means-valid tiles with values and selection order; WordNet
definitions for played words (61.5% of ENABLE, 1.4 MB gzip lazy chunk)
and a word of the day; title screen with Continue and a two-step
abandon (tracker #4 closed); items panel; an arena with generated
pixel sprites, act backgrounds, hit flash, shake and floating damage;
shuffle that costs the turn (the one engine change); rotation-proof
tile sizing; a dependency diet (no Workbox or PWA plugin, no testing
library, 557 to 233 packages, hand-written service worker).

What the gate caught (one adversarial round): the green-word test
could not tell isWord from a length check; abandoning from a fresh
load did not clear the save; the service worker would have cached a
502 page as the offline index; sprite paths ignored Vite's base on
the LAN route; two shuffle mutants unbound. All fixed in the PR.
Replay against main's reducer: 40,276 steps, 0 mismatches; both sim
tables reproduced cell for cell (unchanged from the entry below).
Measured at merge: 142 tests, lint clean. Iteration mode (CLAUDE.md)
starts after this wave: reviewer only for engine and persistence.

### Phase 1 walking skeleton (`feat/phase-1-skeleton`, merged 2026-09-08)

Vite 7 + Svelte 5 + TypeScript scaffold with the engine import wall
verified by probe; dictionary bundled as a lazy `?raw` chunk;
versioned localStorage persist behind an injectable Storage; a
plain-TS store that is the only caller of `reduce`; Fight, Pick and
Summary screens; PWA manifest and service worker precaching the
dictionary; generated icons; nginx image; CI on branches; Docker
publish on main (`deantammam/lexicell:edge`). Dean's 2026-09-08
direction: playable first, iterate after. Scope is the pack's Phase 1
plus the bare pick and summary screens the real reducer needs.

No browser extension was available, so the promised manual pass
became a jsdom suite that mounts the real App with the real
dictionary and reducer and plays a run through the DOM.

What the gate caught (one adversarial round, APPROVE with two
warnings, fix round, re-APPROVE): a save with the right keys and
wrong types loaded, threw in render and came back on every reload
(now refused by a typed shape check, with a render boundary that
drops the save and starts fresh as the net); Pick's index binding was
unbound by the suite (bound at seed 20260918); the turn-start report
rendering was unbound (same test); a false claim about workbox's
default file-size cap in a comment; and the plan named a file that
did not exist.

Measured at merge: `npm test` 111 passed, `npm run lint` clean
(eslint, tsc, svelte-check), build 59 kB app + 1,665.56 kB dictionary
chunk (440.03 kB gzip), service worker precaches 14 entries. CI green
on the branch. The Docker image is unbuilt on the dev box (no Docker);
the publish workflow builds, smokes and pushes it in CI once Dean adds
`DOCKER_USERNAME` and `DOCKER_PASSWORD` to the repository secrets.

Still open: the Phase 1 exit is Dean's alone (HTTPS on the NUC, home
screen install, airplane mode, one fight). Locked tiles are disabled
in the UI but no test binds that; the reducer rejects a locked tile
anyway. `npm run sim -- --runs 10` in CI is a smoke, not a gate: it
exits 0 when a criterion prints FAIL.

### Act-1 wave (`tune/greedy-cap`, merged 2026-09-08)

Greedy bot capped at 7 letters with an uncapped `solver` reported as
the upper bound; `tuning.startingPicks` engine knob (shipped at 1, the
starting kit); act 1 eased; `--variant pre-act1` restores the previous
content so the baseline stays reproducible. Engine files changed
(`types.ts`, `reducer.ts`), so the wave took one adversarial round.

What the gate caught: every sim cell reproduced, but three test-binding
gaps. The kit's empty-offer path could revert to skipping encounter 0
with 86/86 green; the greedy cap could change to 6 or 8 unnoticed
while the criterion label still said 7; the sim usage block named a
variant that did not exist. All bound with mutation-tested fixes, plus
the clamp on `startingPicks` and a content guard against non-finite
knobs. 91 tests.

Shipped content, `npx tsx scripts/sim.ts`:

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 10 items, variant base. 127.5s

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

Previous content, `npx tsx scripts/sim.ts --variant pre-act1` (the
`solver` row is the old uncapped greedy, i.e. the Phase 0 baseline;
`greedy` is the cap alone):

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 10 items, variant pre-act1. 110.3s

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

### Phase 0 engine (main through 9f63d34, pre-harness)

Landed before the harness existed; see tech-debt #1.
