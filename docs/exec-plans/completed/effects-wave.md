# Exec plan: the effects wave (the road to 200 items)

Status: CLOSED 2026-09-08 (PR #47: the pool is 200, all three criteria
pass on curve F). Opened the same day. Dean answered all six questions "agree"
(1 "I like", 2 "Agree", 3 "Yep looks good", 4 "Okay", 5 "Seems good
agree", 6 "yep works"). Engine wave: new effect types, new hooks, new
state, save v3. One adversarial round at the end of the engine PR
under iteration mode; content batches ship on the sim table.

## Dean's ask

"I mean I think we need a 200-item item pool honestly." Then, asked
whether v1 scope changes: "Yes v1 changes to 200 item pool." The pack's
"What This Is Not" line is updated in this PR.

## Why an engine wave comes first

Every one of the 72 items is a combination of twelve effects, five
conditions and five hooks. The last two batches already reuse shapes
(flat bonus gated on length, letter bonus on a letter group, heal on
encounter end). At 200 the pool would be reskins with different
numbers, and the compendium would read as padding. Widening the
vocabulary multiplies the space of distinct items; filling to 200 is
then mechanical and measurable.

## Design

### New state (save v3; v2 saves dropped on load, as v1 was)

- `EnemyState.poison: number`: damage the enemy takes at the start of
  each turn; shrinks by one per tick (venom in reverse: poison 5 deals
  5, 4, 3, 2, 1). Stacks by addition, capped by `tuning.poisonMax`.
- `EnemyState.stunned: number`: enemy attacks skipped. An attack turn
  consumes one; specials still fire (a stun is not a silence).
- `PlayerState.shield: number`: absorbs damage before HP. Persists
  until spent, capped by `tuning.shieldMax` (recommend 30).
- `PlayerState.freeShuffles: number`: a shuffle with a charge does not
  hand the turn to the enemy.
- `TurnReport` gains `poison`, `stunned`, `shielded` so the UI and the
  sim can report them.

### New effects (`effects.ts`, each reviewed as an engine change)

| Effect | Fields | Hooks | What it opens up |
|---|---|---|---|
| `poisonEnemy` | value | onWordScored, onTurnStart, onPick | damage over time, "long word poisons" |
| `stun` | value (attacks) | onWordScored | control: "a 7-letter word skips the next hit" |
| `shield` | value | onWordScored, onTurnStart, onEncounterEnd | defence that is not flat reduction |
| `lifesteal` | fraction | onWordScored | heal scaled by the damage just dealt |
| `freeShuffle` | value (charges) | onPick, onEncounterEnd, onTurnStart | grid agency without the turn cost |
| `redrawTiles` | count | onWordScored, onTurnStart | "after a word, redraw 3 random tiles" |
| `letterWeight` | letters, value | onTileDraw | draw bias on any letter group (vowelWeight becomes the vowel case) |
| `maxHp` | value | onPick, onEncounterEnd | permanent growth, the evolution fantasy |
| `perUnit` | unit, then | any (a modifier, like condition) | scaling: the child's value times a count |

`perUnit` units: `item` (items held), `letter` (word length),
`vowel`, `consonant`, `rareLetter` (K J X Q Z), `turn`, `missingTenth`
(each 10% of HP missing), `venomedTile`, `lockedTile`. One modifier,
nine axes, every numeric effect as a child: this is where most of the
200 identities come from.

New conditions: `startsWith` (letters), `endsWith` (letters),
`uniqueLetters` (no repeats), `repeatLetter` (at least one repeat),
`enemyHpBelow` (fraction), `minVowels` (count), `firstTurn`.

New hook: `onPick`, fired once when the item is taken (heal, maxHp,
freeShuffle, scramble, poisonEnemy on the next fight is NOT allowed:
onPick effects apply to the player only, since no encounter exists).

Enemy side: enemies and bosses get `stun`? No. Enemies keep their
vocabulary (lockTiles, venomTiles, scramble, damagePlayer). The wave is
about items; more enemies are a separate content ask.

### Offer rule (question 2)

At 200 items a run sees 24 of them (8 picks x 3). The weighted draw
stays; the change is that an offer holds at most two commons: the third
slot is drawn from uncommon + rare + mythic when the first two came up
common. A run never sees a pick with nothing interesting in it.

### Pool composition (question 5)

| Rarity | Count | Weight | Share of a fresh pool |
|---|---|---|---|
| common | 90 | 3 | 60.0% |
| uncommon | 60 | 2 | 26.7% |
| rare | 38 | 1 | 8.4% |
| mythic | 12 | 0.35 | 0.9% (before the offer rule) |

The offer rule lifts the non-common share of slots; the gate measures
the actual figure.

### Bots and the sim

- `offerScore` learns the new verbs and uses rarity as the tiebreak
  (closes tracker #6).
- The greedy bot spends free shuffles when its best word is under five
  letters; the mediocre bot never shuffles (it plays what it sees).
- `item-impact.ts` stays the per-item instrument; an item whose
  win-with rate sits within 2 points of the base rate for both bots is
  a reskin and is cut or reworked before the batch merges.

### UI (separate PR, ships on CI)

Shield as a second segment on the HP bar; poison and stun as badges on
the enemy; free-shuffle count on the shuffle button and the button in
the life colour when a charge is up; onPick effects reported on the
pick screen; new report lines in the report colours.

## Task commits

1. `feat/effects-engine`: types (state, tuning, report), effects (new
   variants, conditions, perUnit), hooks (onPick), reducer (poison
   tick, stun, shield, free shuffle, redraw, letterWeight through
   refill, maxHp, lifesteal, onPick dispatch), `SAVE_VERSION = 3`,
   persist's shape check, tests for every verb, the offer rule and its
   test, bots updated, sim runs. One adversarial round, then merge.
2. `feat/effects-ui`: the UI above. CI.
3. `content/batch-1` .. `content/batch-4`: forty items each, glyphs
   via the templates, flavor lines, per-item table pasted, sim
   criteria pasted, each merged on the numbers. Batch 1 also reworks
   the existing 72 where a new verb expresses an item's identity
   better than its current numbers do.

## Risks

- Poison and stun make the enemy's damage curve softer; curve C was
  tuned without them. Expect act 2 to need a nudge; the sim decides.
- `perUnit` children with `addMult` can explode (0.1 x 12 items = x2.2
  on everything). Cap the resolved multiplier from perUnit at
  `tuning.perUnitMultCap` (recommend 1.5).
- Free shuffles remove the dead-grid tension; keep charges scarce
  (one to two per item, never regenerating every turn).
- The save bump drops in-progress runs on Dean's device once.

## Questions for Dean (reply by number, "agree" or an override)

1. The nine verbs, seven conditions and the `onPick` hook above.
   Recommend: agree; each is a distinct axis, none special-cases an
   item.
2. Offer rule: at most two commons per offer. Recommend: agree.
3. Shield persists across encounters, capped at 30. Alternative: clears
   at encounter end. Recommend: persists; it makes shield-on-kill
   items a build.
4. Save v3 drops v2 saves, no migration, same as v1 to v2. Recommend:
   agree; nothing is live.
5. Pool composition 90 / 60 / 38 / 12. Recommend: agree.
6. Order: engine PR, then UI PR, then four content batches. The first
   batch lands with the UI so you play the new verbs early. Recommend:
   agree.

## Progress

- Task 1 `feat/effects-engine` (PR #39, 1b99bf1): shipped. Sim with
  the untouched 72 items: greedy 78.0%, mediocre 48.4% (FAIL, band
  20-40), solver 94.4%. One-variable measurements in ROADMAP: the
  offer rule lifts mediocre ~3.5 points, the bot's rarity tiebreak ~8.
  Acceptance line 1 is therefore not met at the engine PR and moves
  to batch 1 (tracker #7).
- Task 2 `feat/effects-ui` + content batch 1 (PR #41, stacked on
  #39): shipped together. Forty items (20/12/7/1) to 112; curve D
  (act 2 damage +0.1/+0.1/+0.2, act 3 hp and damage raised) brings
  mediocre to 35.2%; the per-item table then caught Paralytic as a
  permanent stun lock (98% wins), reworked to every second turn, and
  two shield buffs; shipped numbers mediocre 30.8%, greedy 66.0%,
  solver 85.0%: all three criteria PASS. Tracker #7 closed.
- Batch 2 (PR #45): 45 items in synergy pairs to 157 (46+22 / 35+13 /
  22+8 / 9+2 = 68 / 48 / 30 / 11); harness fixes from the gate
  (shuffles column, free-shuffle rule that fires, item-impact in the
  repo). The 3000-run table caught Numbing Barb and Neurotoxin as stun
  locks (98% greedy) and Zooxanthellae as a full heal (100%): fixed.
  Sim after: mediocre 22.0%, greedy 53.4%, solver 79.6%, all PASS;
  both rates fell with the pool and the lock removals, curve left for
  the final pass at batch 3 (target: greedy back in the sixties).
- Batch 3 (PR #47): 43 items to 200 at exactly 90 / 60 / 38 / 12.
  Curve F (act 3 damage 2.4 / 2.7 / 2.8): greedy 59.4%, mediocre
  33.6%, solver 81.0% before the table; the table then caught the
  lifesteal family and Pressure (see ROADMAP); shipped: greedy 57.6%,
  mediocre 25.2%, solver 80.0%, all PASS. Per-item table at 3000 runs in
  docs/sim/batch-3-impact.md. Wave closed. Batch 3 finishes the pool: 22 / 12 / 8 / 1 to 200. The rework of the original 72 onto the new
  verbs did not happen in this batch; none of them needed a new verb
  to keep its identity, and the per-item table decides cuts.

## Acceptance

- All three sim criteria pass after content batch 1 (which reworks the
  72 and lands with the UI PR), and after every later batch. The first
  draft required this at the engine PR; the engine PR also changed the
  mediocre bot, and the measured result is in Progress above.
- Every new verb has a reducer test that a mutant deleting its
  application fails.
- Determinism: replay of 3 bots x 30 seeds byte-identical (the mythic
  round's script).
- At 200 items: no item within 2 points of base for both bots; the
  compendium loads in one screen per rarity group with scroll inside
  the sheet, not the page.
