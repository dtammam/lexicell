# Playtest log

Every perception or request Dean shares while playing, logged the day
it lands, with one next step. Status is one of: **to do**,
**implemented (PR #n)**, **no longer needed** (with the reason). This
is the intake for waves; nothing Dean says gets lost in a chat scroll.

| Date | Perception / request | Next step |
|------|----------------------|-----------|
| 2026-09-08 | Something graphical at the top: you, the thing you fight, health, a background | implemented (PR #1 arena, PR #7 backdrop) |
| 2026-09-08 | Toggle to see all carried items | implemented (PR #1 items panel) |
| 2026-09-08 | Letters hard to tell apart, hard to look at | implemented (PR #1 legibility, PR #6 colour by class and serif capitals) |
| 2026-09-08 | Shuffle button with a cost | implemented (PR #1, costs the turn) |
| 2026-09-08 | Tile hazards that hurt you and get worse (blood cell) | to do: act-2 + E9 tuning wave, first tile-touching status effect |
| 2026-09-08 | Selected tiles should turn green when the word is valid, before Attack | implemented (PR #1) |
| 2026-09-08 | Eras and locations affecting backgrounds, items, letter pools, thematic words | no longer needed for v1: pack rules eras cosmetic; backgrounds and palettes per act shipped (PR #7), the rest is Phase 3 art, not mechanics |
| 2026-09-08 | Items should have flavor, some absurdly strong, some weak | to do: Phase 2 item set (20 to 30, rule-benders, designed in synergy pairs); rename shipped (PR #8) |
| 2026-09-08 | 8-bit look that sharpens as you evolve; Isaac vibe | to do: art direction, decide sprite size and palette when real art starts; not before |
| 2026-09-08 | Something to come back for: daily challenge | to do: daily seed (Phase 3), no achievements per pack |
| 2026-09-08 | Main menu | implemented (PR #1 title screen) |
| 2026-09-08 | Definition for every played word; word of the day at run start | implemented (PR #1); word of the day comes from the whole dictionary, not the grid |
| 2026-09-08 | Fewer dependencies, nothing that forces open source | implemented (PR #1 dependency diet; all licences permissive) |
| 2026-09-08 | Rotating the phone breaks the tile layout | implemented (PR #1 fix round) |
| 2026-09-08 | New tiles should come from the bottom and push the others up | implemented (PR #3 gravity) |
| 2026-09-08 | "I with a 2" seems to count down; hated that dynamic | no longer needed: it was the letter value, never a count; values removed from plain tiles (PR #3) |
| 2026-09-08 | Which build am I on? | implemented (PR #4 build stamp on the title) |
| 2026-09-08 | Never scroll; everything on one screen | implemented (PR #5); Dean to confirm on the phone |
| 2026-09-08 | Font: serif, I versus L obvious, Wordle-like not cartoony | implemented (PR #6 ui-serif) |
| 2026-09-08 | Earthbound-style battle backgrounds behind the fighters | implemented (PR #7) |
| 2026-09-08 | Bookworm's Qu tile; different tile types per level | no longer needed: gem tiles from long words (Phase 3) are the tile variety; no Qu tile, no per-level tiles |
| 2026-09-08 | What to borrow from Isaac | to do: rule-bending items, synergy pairs, run summary as a story; no unlocks |
| 2026-09-08 | Item names more word or evolution themed | implemented (PR #8) |
| 2026-09-08 | Run history with export | to do, deferred behind more features (Dean, same day) |
| 2026-09-08 | Graphics and sound direction | to do, deliberately not yet (Dean) |
| 2026-09-08 | Design pillars | to do: write the three into the pack once Dean confirms them (long word = event; attrition is the tension; vocabulary is the character) |
| 2026-09-08 | Boss lock mostly lost (found by the gate, not by Dean) | to do: tracker #5, with the tuning wave |
| 2026-09-08 | Log everything I say as perception / request with a next step | implemented (this file; CLAUDE.md intake rule) |
| 2026-09-08 | Build sha is hard to read at a glance; is this normal? | implemented (PR #10: `build 42 · a1b0b52`, run number plus sha; sha-stamped builds are standard, the counter is the readable part) |
| 2026-09-08 | The amoeba should evolve into other things as the run progresses, not always the same path | implemented in part (PR #11: your sprite changes per act); to do: the act-2 and act-3 form chosen by the items carried, once the item set is bigger |
| 2026-09-08 | Is it fun enough? Stuck with four-letter words; is it the word pool, the letter distribution, too easy or too hard; no outer story like Bookworm | to do: measured answer first (letter distribution and word-length histogram from real grids), then the tuning wave; see the reply of 2026-09-08 for the reasoning |
| 2026-09-08 | Cookie or token per device so several people on the same network can play separately | no longer needed: the save is localStorage, which is already per browser per device; nothing is shared through the server |
| 2026-09-08 | Damage preview before Attack, missed-word reveal after (to fix the four-letter-word feeling) | implemented (PR #12 preview, PR #13 missed word) |
| 2026-09-08 | Backdrop should be more Earthbound: brighter, cycling palette, wavy | implemented (PR #14) |
| 2026-09-08 | Backdrop loop visibly resets; must be seamless | implemented (PR #14: each layer loops on its own period or alternates; nothing jumps) |
| 2026-09-08 | Enemies should float too, each with a different motion | implemented (PR #14: squish, sway, pulse, wobble by enemy) |
| 2026-09-08 | Wife playtest: the first pick screen made no sense, what am I doing here; wants a silly one-screen intro with the cell dividing | to do (PR #16: onboarding screen after New run, and an instruction line on the pick screen); built as onboarding, not story, per the pack |
| 2026-09-08 | A public URL via GitHub Pages so people can play from a link without Docker | implemented (PR #15: https://dtammam.github.io/lexicell/ on every merge to main) |
