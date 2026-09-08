# Exec plan: run history with export

Status: DRAFT 2026-09-08 (PR #48), awaiting Dean's answers to the four
numbered questions. Opened as the effects wave closed (PR #47), per
Dean's order: wave in full, then run history, then starting cells.
Touches persistence, so a plan and one adversarial round under
iteration mode.

## Dean's ask

"Run history with export" (2026-09-08, deferred behind features the
same day; re-queued after the wave). Retention per the pack is a
daily seed plus run history, no achievements, no accounts.

## Design

- A second localStorage key, `lexicell.history`, separate from the
  run save. Versioned like the save: `{ v: 1, runs: HistoryEntry[] }`.
  Never inside RunState: the reducer stays ignorant of history.
- `HistoryEntry` (plain JSON): `seed`, `startedAt` and `endedAt`
  (ISO strings written by the UI layer, never the engine),
  `outcome`, `encounterReached`, `turns`, `damageDealt`,
  `damageTaken`, `bestWord`, `bestWordDamage`, `items` (ids in
  acquisition order), `build` (the build number string). Written once
  when a run reaches the summary phase; an abandoned run is written
  with outcome `abandoned` and the encounter it was left at.
- Cap: the last 200 runs on the device; the oldest fall off.
- Export: a JSON file and a CSV file, built in the page and handed
  to the browser as a download (`<a download>` on a Blob URL; no
  clipboard dependency, no backend). The CSV carries one row per run
  with items joined by `;`.
- Screen: a History entry on the title (next to Organelles), a list
  newest first (date, outcome, encounter, best word, items as
  glyphs), a tap opens the run's detail, Export JSON and Export CSV
  buttons at the top, Clear history behind a two-step confirm.
- Summary screen gains a line linking to History.
- No sync, no sharing, no leaderboard (pack).

## Engine and persistence changes

- None to the reducer or RunState. `persist.ts` gains a sibling
  `history.ts` with `loadHistory`, `appendRun`, `clearHistory`,
  `exportJson`, `exportCsv`, shape-checked on load like the save
  (a bad blob is dropped, never thrown on).
- The store writes an entry when phase becomes `summary` and when
  New run abandons a live run.

## Gate

Adversarial round on `history.ts` and the store hook: the entry is
written exactly once per run (replay a run to summary twice through
the store), an abandoned run writes `abandoned`, the cap drops the
oldest, a corrupt blob loads as empty and is replaced on the next
write, export output round-trips (JSON parses to the same entries,
CSV has one row per run and escapes commas and quotes in words), the
save key is untouched by every history write.

## Questions for Dean

1. Record abandoned runs (recommend yes, as `abandoned`, so the
   history is honest about quitting).
2. Cap at 200 runs (recommend yes).
3. Export formats JSON and CSV (recommend both; CSV opens in a
   spreadsheet, JSON is lossless).
4. Where: History on the title next to Organelles, plus a link from
   the summary (recommend yes).

## Acceptance

- A finished run appears in History on the next title visit with the
  right outcome, encounter, best word and items.
- Export JSON re-imports (by hand, in a test) to identical entries;
  CSV has header plus one line per run.
- Clearing site data clears history; nothing else stores it.
- 0 new runtime dependencies.
