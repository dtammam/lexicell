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
  mythic fills about 2.5% of offer slots, so roughly 7% of offers and
  about half of all runs see one. Rare enough to be an event, common
  enough to be real.
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
