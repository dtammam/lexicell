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
  grows by N each turn it is not hit for at least H). No new RunState
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
picker for rest and event is UI; the reducer gets `restChoice` and
`eventChoice` actions.

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

- Step 1 (PR #61): built. Curve G; mediocre 22.6%, greedy 68.4%, solver
  87.8%, criteria pass. The enrage clock was not in the plan: the sim
  found a stalemate and it is the honest fix.

## Acceptance per step

Criteria pass on the balanced cell; every cell within 10 points of it;
determinism replay per step; no dead grids; the intent line never lies
(the number it shows is the number that lands, or the range contains it).
