# Exec plan: the mythic tier

Status: CLOSED 2026-09-08 (PR #31). Branch `feat/mythic`. Results in ROADMAP. Engine touch (the
rarity type and the offer weights), so a plan and one adversarial
round under iteration mode.

## Dean's ask

"Even more items, and then a mythic item pool as well, explicitly
powered."

## Design

- `Rarity` gains `mythic`. `RARITY_WEIGHT` gains `mythic: 0.35`. With
  64 regular items (common 3, uncommon 2, rare 1) and 8 mythics, a
  mythic fills about 2% of offer slots (8 x 0.35 over a fresh pool
  weight of 141.8 is 1.97%; the gate measured 2.0-2.1% over 500 runs),
  so roughly 6% of offers and 35-43% of runs see one. The plan's first
  draft said 2.5% / 7% / half; the reviewer's measurement corrected it.
  Rare enough to be an event, common enough to be real.
- Mythics are overpowered on purpose and bounded by the vocabulary:
  triple damage on everything, heal to full after each fight, an enemy
  that takes heavy damage every turn, immunity on even turns. No new
  effect types; the numbers do the talking.
- Fourteen more regular items (to 64) with the same identity rule as
  the last batch: no reskins.
- Glyphs: mythics get a gold tone with a glow; new regulars use the
  templates. UI: a `mythic` colour token and label everywhere rarity
  shows (offers, panel, compendium).
- The mediocre bot's offer scoring is unchanged; mythics score high
  by construction.

## Gate

The round measures: the type and weight are the only engine changes;
weighted pick still threads the RNG; a mythic appears in offers at
the predicted rate (count over 500 runs); sim criteria; the per-item
table for both bots (mythics may sit near 100%, that is the point,
but the base rates must stay in band).
