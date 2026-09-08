# Exec plan: starting cells

Status: DRAFT 2026-09-08 (PR #48), awaiting Dean's answers to the five
numbered questions. Builds after run history (Dean's order).
Engine and save schema: numbered questions first, then a plan and an
adversarial round.

## Dean's ask

"A few potential types of cells to start (like base characters with
certain things like a balanced one, a more aggro one, a more
defensive one, etc.)" (2026-09-08). Scope check: the pack forbids
unlocks and meta-progression. Starting cells are a choice at run
start, all available from the first run, nothing carried between
runs. That is inside scope; an unlock path for them would not be.

## Design

- Content: `src/content/cells.ts`, a `CellDef[]` in the same data
  style as items: `id`, `name`, `description`, `flavor`, `maxHp`,
  `startingItems` (item ids granted before the kit pick), `traits`
  (a `Partial<Record<Hook, Effect[]>>` exactly like an item's hooks,
  applied as if the cell were an item at index -1), `sprite`.
  No new effect types: a cell is stats plus an always-on item.
- Engine: `RunState.cell: string` (id). `newRun(seed, ctx, cellId)`;
  the reducer's `collectEffects` prepends the cell's traits to the
  player's items. `player.maxHp` starts at the cell's. Save v4, v3
  dropped (or the cell defaults to `balanced` on load: question 3).
- Sim: `--cell <id>` and a per-cell table; the exit criteria hold for
  the balanced cell; the others are reported and must each sit within
  10 points of it for the mediocre bot (a cell is a style, not a
  difficulty setting).
- UI: a cell picker after New run (before the intro? after: question
  4) with sprite, name, one-line description, traits; the arena's
  player sprite comes from the cell; the summary and history record
  the cell.

## First cells (Dean names them; these are the starting proposal)

| id | name | max HP | traits | fantasy |
|---|---|---|---|---|
| balanced | Amoeba | 100 | none | the current game |
| aggro | Predator | 80 | +25% damage; take 2 more damage from every hit | kill it before it kills you |
| defensive | Diatom | 120 | take 3 less damage from every hit; -15% damage | outlast |
| gambler | Spore | 90 | words of 6+ letters deal double; words of 4 or fewer deal half | long words or nothing |
| tinkerer | Mycelium | 100 | starts with one extra kit pick; shield 5 after each fight | build-first |

## Questions for Dean

1. Five cells to start, as above (recommend yes; names are yours to
   change).
2. All cells available from the first run, no unlocks (recommend yes;
   the pack forbids unlocks).
3. Save v4 dropping v3, or default old saves to `balanced` (recommend
   default to balanced: nothing lost, no migration code).
4. Picker placement: after New run, before the intro scene (recommend
   before, so the intro's arrival shows your cell).
5. Cells are stats plus always-on item hooks, no new effect types
   (recommend yes; a cell that needs a new verb waits for one).

## Acceptance

- Sim per cell: balanced passes all three criteria; every other cell
  within 10 points of balanced for the mediocre bot, none above 90%
  for greedy.
- Determinism replay with each cell.
- A run's cell is visible on the arena, the summary and in history.
