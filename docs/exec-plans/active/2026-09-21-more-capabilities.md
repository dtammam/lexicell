---
plan: more-capabilities
harness: v2 · lean
branch: feat/more-capabilities
anchor: spec
status: Building
next: commit the branch, then run the gate (Adversary briefed on replay + QA)
design: Approved 2026-09-21 @2266092
gate: pending
---

# Exec plan: more capabilities (dilute the wildcard)

Branch `feat/more-capabilities`, base main at `2266092`.

## Problem (Dean, 2026-09-21)

The wildcard capability is "too powerful too often." Root cause found by
reading the reducer, not by feel: the post-boss capability offer is
**deterministic** — `makeCapabilityOffer` (reducer.ts) offers *every capability
the player does not yet hold*, in fixed content order, consuming **zero RNG**.
There are exactly 3 bosses (encounters 2/5/8) and 3 capabilities, so every run
collects all three, and wildcard — first in the list and the strongest — is
grabbed at boss 1 of literally every run.

So the fix is two parts, and adding capabilities *alone* fixes nothing:

1. Make the offer a **random draw** of up to `OFFER_SIZE` (3) from the unheld
   pool, so wildcard is one option among many rather than a guaranteed pick.
2. Deepen the pool with **10 new capabilities** so a 3-slot draw feels varied
   and wildcard appears in a minority of offers.

## Dean's decisions (intake 2026-09-21, agreed)

- **R1 — Passive, not verbs.** The 10 new caps are pure declarative hooks
  (item/trait effect system). The 3 existing caps (wildcard, transmute,
  letter-bank) keep their hard-coded verb behavior and carry no hooks. **No new
  hand-coded mechanics.**
- **R2 — No save-version bump.** New caps are stateless: their ids live in the
  existing `evolution.caps` string array, and `persist.dropUnknownIds` already
  filters unknown cap ids. Only the `Capability` union is extended. v11 stays
  v11, no migration.
- **R3 — Random offer on the RNG path.** `makeCapabilityOffer` becomes a random
  3-of-unheld draw. This consumes seed RNG at each boss, so every seeded run
  that reaches a boss changes and the golden replay hashes in
  `evolution.test.ts` are regenerated. Top attack surface: Adversary briefed to
  break replay. Mandatory-pick semantics unchanged (you still must take one).
- **R4 — Full gate + sim.** Adversary (always) + QA. No Security seat (no auth,
  network, secrets, or dependency touched). Balance judged by `npm run sim`
  against the exit criteria, tables pasted, never typed.

## Acceptance (anchor: spec)

- `CapabilityDef` gains an optional `hooks?: Partial<Record<Hook, readonly
  Effect[]>>` field, mirroring `TraitDef`. `gatherEffects` (hooks.ts) reads
  capability hooks for the held caps, gathered in a fixed, documented order
  relative to cell/traits/items (order is part of determinism — pick one and
  test it).
- The `Capability` union and `CAPABILITIES` const (types.ts) gain the 10 new
  ids. `content.capabilities` (content/capabilities.ts) gains the 10 defs with
  `hooks`.
- `makeCapabilityOffer` draws up to `OFFER_SIZE` unheld caps by the run RNG,
  using the same withRng plumbing as `drawOffer`/`makeEvolve`; fewer than 3
  unheld -> offer what remains; 0 -> fall through to the item offer exactly as
  today. The pick stays mandatory.
- Replay: same seed + same build = byte-identical (the evolution.test.ts golden
  hashes are regenerated to the new build and pinned). A run that never reaches
  a boss still never draws capability RNG.
- `persist` still strips unknown cap ids; a save carrying a now-known new id
  loads intact. No save-version change.
- Balance: `npm run sim` holds the exit criteria — every cell's greedy bot
  < 90%, mediocre bot 20-40%, no dead grids, endless terminates. Table pasted
  into this doc before merge.
- Per-merge discipline: release-notes entry (build = last + 1, sha pending),
  ROADMAP line, playtest-log row, memory update after merge.

## The 10 capabilities (numbers are placeholders; sim sets them)

Built entirely from existing effect verbs / conditions — zero new engine code.

| # | id | Name | Hook | Effect (placeholder) | Axis |
|---|----|------|------|----------------------|------|
| 1 | `osmosis` | Osmosis | onWordScored | lifesteal 0.15 | sustain |
| 2 | `chitin` | Chitin | onDamageTaken | reduceDamage 5 | mitigation |
| 3 | `catalyst` | Catalyst | onWordScored | perUnit rareLetter: addFlat 12 | synergy (pairs Transmute) |
| 4 | `mitosis` | Mitosis | onTurnStart | freeShuffle 1 | tempo — WATCH |
| 5 | `vesicle` | Vesicle | onWordScored | words <=5 letters heal 5 | short-word sustain (greedy-proof) |
| 6 | `cilia` | Cilia | onWordScored | words <=5 letters deal +8 | short-word offense (greedy-proof) |
| 7 | `vacuole` | Vacuole | onWordScored | poisonEnemy 5 | damage-over-time |
| 8 | `spines` | Spines | onDamageTaken | damageEnemy 8 | reflect / thorns |
| 9 | `elongation` | Elongation | onWordScored | minLength 6 -> addMult 0.5 | long-word — WATCH |
| 10 | `first-contact` | First Contact | onWordScored | firstTurn -> addFlat 25 | opening burst — WATCH |

Naming stays cell/word-themed (consistent with the existing three). Flavor: one
line each, no mechanics (mechanics live in `description`).

### Balance risk flags (measure hardest)
- **#9 Elongation** is the exact long-word-multiplier shape that pushed Spore's
  greedy over 90% before (see ROADMAP build 90). Likely the first number cut.
- **#4 Mitosis** — a permanent +1 shuffle/turn is a tempo powerhouse; could
  rival wildcard for "too strong."
- **#10 First Contact** rewards fast kills; strong against short act-1 fights.
- General: capabilities raise the greedy ceiling. If the pasted sim breaches
  90%, trim the offending number or swap the axis, re-sim, paste again.

## Attack surfaces for the gate
- **Replay determinism (top).** The offer now consumes RNG. Adversary: confirm
  same-seed/same-build byte-identical; confirm the offer draw order and count
  are seed-stable; confirm a no-boss run draws no capability RNG; confirm the
  golden hashes were regenerated (not hand-edited to pass).
- **Save schema.** Adversary: a save with a new cap id loads; an unknown id is
  still stripped; no field added to `Evolution` (passive caps hold no state).
- **Engine/content boundary.** No Svelte/DOM/`Math.random` in the new code
  (ESLint-enforced). Capability hooks resolve through the same
  `collectEffects` path as items/traits.
- **Balance.** QA/Adversary read the pasted `npm run sim` table, not prose.

## Sim (measured, not typed)

Base sha `2266092` (main, before this wave), greedy ceiling per cell, npm run sim:
- balanced greedy 86.5%, aggro greedy 89.8% (400 runs each). aggro sits at the
  90% cap on main already - a knife-edge cell by design.

First cut (Membrane/Photosynthesis as unconditional survival caps), after two
value trims, 1000 runs each: balanced greedy 91.1% FAIL, aggro 90.8% FAIL. The
breach was STRUCTURAL, not value-sensitive: five SURVIVAL axes in the pool the
greedy bot draws from lift its floor regardless of the individual numbers (two
~30% trims moved greedy < 1pp), because survival is what caps a greedy win rate.

Ruling (Dean, 2026-09-21): reduce survival DENSITY. Swap the two UNCONDITIONAL
survival caps (Membrane +HP, Photosynthesis heal/turn) for two caps gated on
`maxLength: 5` - Vesicle (heal 5) and Cilia (+8 damage). Greedy plays 6-7 letter
words so the gate never fires for it; the mediocre bot's 4-5 letter words always
trigger it. So the swap removes greedy uplift while keeping (even lifting) the
mediocre/human payoff. This keeps the wave content-only and still 13 caps.

Final sweep (post-swap), all cells 1000 runs normal, plus endless termination,
`npm run sim`, all exit criteria PASS:

| cell      | greedy | mediocre | dead grids |
|-----------|--------|----------|------------|
| balanced  | 88.4%  | 34.0%    | none       |
| aggro     | 89.1%  | 32.4%    | none       |
| defensive | 87.4%  | 35.5%    | none       |
| gambler   | 89.4%  | 29.5%    | none       |
| tinkerer  | 82.2%  | 35.0%    | none       |
| endless (balanced, 200 runs) | greedy 0.0% (terminates) | mediocre 0.0% | none |

Baseline for reference (main @2266092): balanced greedy 86.5%, aggro 89.8%. aggro
sits at the cap by design; the wave leaves it at 89.1%, at or below its baseline.

## Status log
- 2026-09-21 Approved @2266092. Design agreed in intake (R1-R4, 10 caps).
- 2026-09-21 Built by subagent (offer randomization + 10 passive caps, golden
  hashes regenerated). Tests 390/390, lint clean. Subagent looped on the sim and
  never committed; the Architect took over, verified, and ran the balance sweep.
- 2026-09-21 Sim shows greedy > 90% on balanced/aggro, structural. Not committed.
  Surfaced the open decision above to Dean.
- 2026-09-21 Dean ruled: reduce survival density. Swapped Membrane/Photosynthesis
  for Vesicle/Cilia (maxLength 5, greedy-proof); onPick wiring removed (no cap
  uses it now); ids renamed in the union/const/tests, sprites regenerated. Tests
  390/390, lint clean. Final 1000-run sweep: every cell PASSES all exit criteria
  (table above). Ready to commit and gate.
