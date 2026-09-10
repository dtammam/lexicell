# Exec plan: the variety wave

Status: ACTIVE 2026-09-09. Dean's brief: testers finish runs and share
screenshots; the game now needs variety. Nine levers were listed, Dean
answered all nine; this plan is the order he agreed. Each engine step
gets one adversarial round and a pasted sim table; content steps ship
on the table.

## Dean's answers (2026-09-09)

1. Enemy roster: 12 enemies in three act pools plus 3 bosses; three new
   enemy verbs (armour, regeneration, hunger). Yes.
2. Damage ranges rolled per hit from the run RNG, shown in the intent
   line. Yes.
3. Encounter types inside the nine: one elite, one rest, one event per
   run, placed by the seed. Yes.
4. Evolution: a trait pick after each boss, three offered. Yes.
5. Grid rules: gold tiles and cracked tiles now, a dead letter later. Yes.
6. "Normal, Endless?": read as two modes, Normal (nine encounters) and
   Endless (the run continues past nine on a scaling curve), both from
   the first run. This changes the pack's "not endless in v1" line;
   recorded as Dean's ruling, to be corrected with a word if misread.
7. Curses: paired offers, one in three picks after act 1. Yes.
8. Share card and copy-seed on the summary. Yes.
9. Order: enemies and ranges, encounter types, evolution, grid rules,
   modes, curses, share card, daily seed. Yes.

## Steps

### 1. Enemies and ranges (engine + content, one round)

- `EnemyDef` gains `act` (which pool), `variance` (a hit rolls in
  `[round(d*(1-v)), round(d*(1+v))]` from the run RNG, so seeds replay),
  and `traits`: `armour` (words under N letters deal half), `regen`
  (heals N at its turn start, never above max), `hunger` (its damage
  grows by N every turn from turn 2; the plan first said "each turn it
  is not hit", the simpler rule shipped and the gate caught the drift). No new RunState
  fields: regen and hunger act on `enemy.hp` and `enemy.damage`, which
  exist; variance uses `state.rng`. Save schema unchanged.
- Content: 12 enemies (4 per act) and 3 bosses, one per act, each boss
  with a distinct special and a trait. Sprites from `scripts/sprites.py`
  specs. `startEncounter` picks from the act's pool.
- Intent line shows the range ("hits 3-6"), the trait in one word.
- Sim: criteria on the balanced cell; curve retune if needed; the
  per-cell table again.

### 2. Encounter types (engine, one round)

`EncounterDef.kind`: `fight` (as now), `elite` (an enemy from the next
act's pool at this act's scale, a rare guaranteed in the offer), `rest`
(a screen: heal 30% or take an item from a three-offer), `event` (a
small forced trade from a content list). The seed places one elite,
one rest and one event among slots 2 to 8, never a boss slot. The
picker for rest and event is UI; the reducer gets `restHeal` and
`eventChoice` actions (the rest's pick is `pickItem`).

### 3. Evolution (engine, one round)

After each boss: an offer of three traits (`TraitDef`, item hooks
without an id in the item pool), one picked, kept on
`player.traits`, gathered after the cell and before the items. Save
bump with migration (empty traits).

### 4. Grid rules (engine, one round)

`Tile.gold` (adds N damage when played), `Tile.cracked` (vanishes after
two turns, refilled), an enemy special for each. Dead letter deferred.

### 5. Modes (engine, one round; pack updated)

`RunState.mode: 'normal' | 'endless'`; Endless continues past index 8
with acts 4+ generated from the act-3 pools at a scaling curve, bosses
every third; the summary and history record the encounter reached.
Chosen on the title with the cell.

### 6. Curses (content)

Offers where a strong item carries a curse item that must be taken with
it; the curse is an item with negative hooks and a `curse` flag so the
compendium and the offer show it.

### 7. Share card and copy-seed (UI)

The summary as a card: cell sprite, act colour, seed, best word, items
as glyphs, outcome; a copy-seed button; New run can take a pasted seed.

### 8. Daily seed (UI)

The day's seed on the title, one run per day recorded in history with a
daily flag.

## Progress

- Step 1 (PR #61): built. Curve G; mediocre 22.6%, greedy 68.6%, solver
  88.0%, criteria pass. Cells retuned to the new roster (Diatom, Spore,
  Mycelium); all five within ten points of Amoeba, greedy max 82.0%. The enrage clock was not in the plan: the sim
  found a stalemate on the pre-retune roster and it is a backstop against the next one. It ends any fight in which
  the enemy attacks; a permanent stun lock is outside it (tracker #8). Gate round: the preview now applies armour
  (engine), seven surviving mutants bound, regen-before-poison pinned. Tables re-pasted after the preview fix.
- Step 2 (PR #62): built. `RunState.kinds` placed by three draws at newRun (save v6, v5 migrates with
  empty kinds); elite from the next act's pool (act 3: act-3 at 1.3x/1.15x) with a rare-first offer; rest
  = heal 30% or a pick; eight events in content, a trade never kills. Actions are `restHeal` and
  `eventChoice` (the plan said `restChoice`; the rest's pick reuses `pickItem`). Gate round: a dropped
  event id soft-locked a save (now the walk-away), event effects apply in written order, damage taken
  ignores max-HP cuts, persist tightened and tested on rest/event saves. Tables re-pasted after.
- Step 3 (PR #64): built. Twelve traits, `player.traits` (save v7, v6 migrates with none), `evolve`
  phase after the first two bosses, `pickTrait`, gathered after the cell and before the items. Curve H
  (acts 2 and 3 up) absorbs the traits: balanced greedy 68.2%, mediocre 22.2%, solver 87.6%; cells 18.0
  (Spore, by design) to 29.2 mediocre, greedy max 84.8%. Gate round: persist drops item and trait ids content no
  longer has (a held one would have thrown from every hook); four tests and chooseTrait bound.
- Step 4 (PR #65): built. `Tile.gold` and `Tile.cracked` (save v8, v7 migrates with plain tiles), verbs
  `goldTiles` and `crackTiles`, the Midas Membrane trait and the Diatom Swarm's crack special, gold-aware
  candidates and an exact `scoreSelection` preview. Dead letter deferred as planned; gold is a trait, not an
  enemy special (an enemy gilding the player's tiles makes no sense); the crack special fires every second turn
  after the gate measured every third never landing against a strong player. No retune: balanced
  greedy 66.8%, mediocre 21.0%, solver 87.6%; cells 17.8 (Spore, by design) to 29.6 mediocre, greedy max 83.2%.
- Step 5 (PR #66): built on top of step 4. `RunState.mode` (save v9, v8 migrates as normal), chosen with the
  cell; `encounterDefFor` generates slots past the ninth from the act-3 fight/boss scale grown by
  `endlessHpGrowth` 1.06 and `endlessDamageGrowth` 1.08 per slot (damage faster than HP: at 1.1 / 1.06 the
  strong bot out-healed 600-turn fights), a boss every third, an evolve after each; `extendKinds` draws one
  detour per block of three as the block is reached; Endless never wins, history keeps the encounter reached
  uncapped. Three engine rules Endless exposed and this step fixes: a hit to 0 HP is death before the rest of
  onDamageTaken (an on-hit heal made the player unkillable by attacks, so every earlier table was tuned against
  that bug), rage breaks a stun past `enrageAfter` (tracker #8 closed), a turn-start redraw that leaves a dead
  grid scrambles. Closing the first cost ten points each on curve H (mediocre 21.0 to 10.6, greedy 66.8 to 57.2);
  curve J (acts 2 and 3 softened) restores balanced mediocre 24.4%, greedy 84.0%, solver 96.8%; cells 19.8
  (Spore, now failing both criteria) to 37.0 mediocre, greedy max 95.6% (Spore, over the cap: Dean's lever).
  Endless over 200 runs, median encounter reached: greedy 30, mediocre 8.5, solver 36.

### Step 5 sim tables (re-run after merging main, PR #65; the Diatom Swarm now cracks every second turn)

`npx tsx scripts/sim.ts` (balanced, Amoeba):

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 200 items, variant base, cell balanced, mode normal. 80.7s

|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    84.4% |           9 |       16.2 |       105 |       28 |   100 |   100 |    96 |    89 |    88 |    88 |    83 |    82 |    81 |
| mediocre |  500 |    24.4% |           9 |       28.5 |       277 |        2 |   101 |    95 |    83 |    58 |    63 |    68 |    59 |    69 |    75 |
|   solver |  500 |    96.6% |           9 |       11.8 |        24 |       14 |   100 |   101 |    98 |    95 |    95 |    94 |    93 |    91 |    90 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

`npx tsx scripts/sim.ts --cell aggro` (Predator):

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 200 items, variant base, cell aggro, mode normal. 75.9s

|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    87.0% |           9 |       13.9 |        48 |       24 |    85 |    85 |    82 |    77 |    76 |    76 |    73 |    72 |    71 |
| mediocre |  500 |    24.0% |           8 |       23.4 |       181 |        1 |    86 |    80 |    70 |    48 |    55 |    59 |    51 |    58 |    65 |
|   solver |  500 |    97.8% |           9 |       10.3 |         1 |       11 |    85 |    86 |    84 |    82 |    81 |    81 |    80 |    78 |    77 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

`npx tsx scripts/sim.ts --cell defensive` (Diatom):

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 200 items, variant base, cell defensive, mode normal. 97.3s

|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    89.4% |           9 |       18.3 |       162 |       38 |   115 |   115 |   112 |   105 |   105 |   105 |    99 |    97 |    95 |
| mediocre |  500 |    35.0% |           9 |       34.8 |       377 |        2 |   116 |   113 |   103 |    79 |    82 |    87 |    73 |    81 |    86 |
|   solver |  500 |    98.4% |           9 |       13.2 |        58 |       14 |   115 |   116 |   113 |   110 |   110 |   109 |   108 |   107 |   106 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

`npx tsx scripts/sim.ts --cell gambler` (Spore):

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 200 items, variant base, cell gambler, mode normal. 78.9s

|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    95.4% |           9 |       12.5 |        28 |       11 |    90 |    91 |    88 |    84 |    84 |    83 |    82 |    80 |    80 |
| mediocre |  500 |    19.8% |           8 |       27.0 |       238 |        2 |    91 |    85 |    73 |    50 |    55 |    61 |    54 |    63 |    68 |
|   solver |  500 |    99.6% |           9 |        9.4 |         4 |        4 |    90 |    91 |    89 |    88 |    87 |    87 |    87 |    85 |    85 |

Exit criteria:
  FAIL  mediocre wins 20-40%
  FAIL  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

`npx tsx scripts/sim.ts --cell tinkerer` (Mycelium):

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 200 items, variant base, cell tinkerer, mode normal. 95.8s

|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    77.8% |           9 |       17.4 |       132 |       41 |    86 |    85 |    82 |    75 |    75 |    75 |    71 |    70 |    71 |
| mediocre |  500 |    29.2% |           9 |       29.6 |       299 |        1 |    87 |    83 |    74 |    57 |    61 |    66 |    60 |    67 |    70 |
|   solver |  500 |    93.6% |           9 |       12.8 |        47 |       23 |    86 |    86 |    83 |    81 |    80 |    80 |    79 |    78 |    78 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

`npx tsx scripts/sim.ts --mode endless --runs 200` (the deep):

```
Lexicell sim: 200 runs per bot, seeds 0..199, all 200 items, variant base, cell balanced, mode endless. 319.1s

|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  200 |     0.0% |          30 |       51.3 |       197 |      189 |   100 |   100 |    96 |    89 |    89 |    88 |    82 |    82 |    80 |
| mediocre |  200 |     0.0% |         8.5 |       42.0 |       258 |        3 |   101 |    95 |    84 |    59 |    66 |    70 |    60 |    69 |    76 |
|   solver |  200 |     0.0% |          36 |       65.2 |       394 |      181 |   100 |   101 |    98 |    95 |    95 |    94 |    93 |    91 |    91 |

Endless: the criteria judge Normal; here the number that matters is the median encounter reached.
```


## Acceptance per step

Criteria pass on the balanced cell; every cell within 10 points of it;
determinism replay per step; no dead grids; the intent line never lies
(the number it shows is the number that lands, or the range contains it).
