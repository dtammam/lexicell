# Exec plan: the tuning wave (acts 2 and 3, the first tile hazard, the boss lock)

Status: ACTIVE (started 2026-09-08). Branch `feat/tuning-wave`.
Engine wave, so it carries a plan and one adversarial round (iteration
mode, CLAUDE.md). Spec of record: the pack's Phase 2 ("at least one
enemy status effect that touches tiles"), the Phase 0 plan's Handoff
targets, tracker #5, and the playtest log.

## Goal

Make acts 2 and 3 the game they are meant to be: a boss whose mechanic
actually lands, one hazard that makes a tile a decision, and a curve
where E9 can kill a strong run without walling a mediocre one.

## Dean's decisions on record

- 2026-09-06: attacks stay per word; act 1 is never touched again; E9
  should cost mediocre 50-60 HP with a full kit and greedy 25-35; more
  than 147 of 300 mediocre runs should reach E6.
- 2026-09-08: tile hazards that hurt you and get worse ("blood cell")
  wait for this wave; a shuffle costs the turn; keep going.
- Save schema: bumping needs a migration or an explicit "old saves are
  dropped" note (CLAUDE.md). This wave drops them, disclosed below.

## Design

### T1 The boss lock lands (tracker #5)

`lockTiles` runs in the enemy turn, before the refill, and picked from
every playable index, which still included the tiles of the word just
played; the refill then overwrote the lock. Fix: candidates exclude the
current selection. Measured by the gate before: exactly 3 locked in 32
of 137 boss specials; after: every special locks its full count when
enough tiles are free. Locks also ride gravity correctly (PR #3).

### T2 Venom, the first tile hazard (new Effect type, proposed here)

`Tile` gains `venom: number` (0 = none). New effect
`venomTiles { count, value }`: the enemy's special picks `count`
playable, unselected, unvenomed tiles and sets `venom = value`. At the
start of every player turn, each venomous tile bites for its venom and
then its venom grows by one. The only cures: play the tile (the refill
replaces it), shuffle (costs the turn, redraws every unlocked tile), or
a dead-grid scramble. So a venomed tile is a decision every turn: spend
it now in a short word, or hold out for a long one while it bites.
`TurnReport` gains `venom: number` (damage bitten this turn) for the
screen. The Polyp carries it (every 3 turns, 1 tile at 2); the Colony
keeps its lock.

Why a new effect type rather than reusing `damagePlayer`: the damage is
per tile and grows, and the cure is grid play; no existing vocabulary
expresses "this tile hurts until you use it".

Save schema: `Tile` and `TurnReport` change shape, so `SAVE_VERSION`
becomes 2 and old saves are dropped on load (persist already refuses a
wrong version). No migration: the game has no users yet and Dean's
ruling is that the save is not precious. Disclosed in ROADMAP.

### T3 The curve

Levers: `hpScale` and `damageScale` for E4 to E9 in `acts.ts`, the
boss's base numbers. Method: a scratch sweep at 200 runs per candidate
over a small grid of scalings, scored against Dean's three targets,
then the winner rerun at 500 and pasted. Act 1 untouched.

### T4 Screen and docs

Venom badge on the tile (a green count) and a "venom bit you for N"
line in the report. ROADMAP entry with the pasted tables; tracker #5
closed; playtest-log rows updated; plan to completed.

## Gate

One adversarial round. Attack surfaces: the lock exclusion (a boss
special after a word must lock exactly `count` fresh survivors, none
of them the played tiles); venom selection (never a locked, selected,
or already venomed tile; RNG threaded), venom bite at turn start
(exactly once per turn, grows by one, kills at 0 HP, reported), cure
paths (play, shuffle, scramble); save version 2 refusing v1 blobs;
JSON round-trip and replay determinism with venom on; sim tables
reproducing.

## Risks

- Venom plus the lock could make the Polyp and Colony too hard together
  in act 3; the sweep measures it and the curve absorbs it.
- The bots do not shuffle, so a human's escape route is untested by the
  sim; disclosed.
