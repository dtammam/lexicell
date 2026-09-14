# Exec plan: dictionary expansion (accept far more words)

Status: ACTIVE, opened 2026-09-14. Touches `src/engine` (the reducer's
validation path and the EngineContext shape) so it takes a plan and one
adversarial round under iteration mode, with the adversarial seat briefed
to break replay determinism.

## Dean's ask

2026-09-14: "add a silly amount of words to the game. brewmaster isn't
in it. My friends who play these games seriously find it frustrating to
encounter valid words that aren't acknowledged." The current list is
ENABLE (168,411 words, length 3-15); `brewmaster` is absent.

## Dean's decisions (numbered questions, 2026-09-14)

1. Source: `words_alpha` (dwyl/english-words), public domain, single
   file, contains `brewmaster`. He first chose SCOWL when the framing
   was "a raw dump's junk would surface in the best-there suggestions";
   the pinned-grid design below makes that impossible, so he switched to
   words_alpha.
2. Preserve seed replay: pin grid generation to the current word list;
   grow only the set of words a player may successfully spell.

## The determinism hazard this design avoids

Grid generation is in the RNG path. `freshGrid` (src/engine/grid.ts)
rerolls a fresh grid until `longestWord(solver.solve(playableLetters)) >=
FRESH_GRID_MIN_WORD` (4); `isDead` also consults the solver. The solver
is built from the dictionary. So if the solver's word list grows, the
number of RNG draws a seed consumes to satisfy the solvability check
changes, and every downstream grid and RNG event diverges. That would
break the daily challenge ("the same run for everyone"), "Replay this
seed", and pasted-seed round-trips, and it would shift balance (the sim
bots would find better words).

## Design: two tiers, one deterministic

- **Baseline** = the current ENABLE `words.txt`, unchanged. It remains
  the list the **solver** is built from. Everything that must stay
  deterministic or balanced reads the solver, so all of it is untouched:
  `freshGrid`, `isDead`, the "best there" reveal, word-of-the-day, and
  `scripts/sim.ts`.
- **Full validation set** = union(ENABLE, words_alpha filtered to length
  3-15, `^[a-z]+$`, existing blocklist applied). Used ONLY by
  `ctx.dictionary.has()` — validating the word a player played and
  resolving a wild tile. 380,021 words vs 168,411 today; the supplement
  (union minus ENABLE) is ~211,610 words, ~2.26 MB raw, lazy-loaded and
  cached by the service worker like the baseline already is.
- Consequence: a supplement word can only ever be **accepted** when a
  player types it. It is never generated onto a grid, never suggested as
  the best word, never shown as word-of-the-day, never played by a sim
  bot. So junk in words_alpha cannot taint suggestions or balance, and
  the sim output is expected byte-identical (the solver is unchanged);
  the rerun is a confirmation, not a retune.
- `isDead` stays on the baseline solver deliberately: moving it to the
  full set would change the auto-reshuffle decision and diverge the RNG.
  The residual cost, disclosed: a grid whose only 3+ letter words are
  supplement-only gets auto-reshuffled even though the player could have
  spelled one. On a 16-tile grid this is vanishingly rare (a 4+ letter
  ENABLE word is almost always present) and it only ever hands the
  player a fresh grid, never a wrong result.

## Engine and content changes

- `EngineContext` (src/engine/reducer.ts) keeps `{ dictionary, solver,
  content }`. `dictionary` becomes the FULL union (validation); `solver`
  is built from a SEPARATE baseline dictionary (ENABLE only). No new
  field, so no ripple through the many `EngineContext` consumers; only
  the wiring in `context.ts` and `sim.ts`/tests changes what each is
  built from.
- `src/ui/context.ts`: load baseline `words.txt` and `supplement.txt`,
  build `baselineDict = createDictionary(baselineText)`, `fullDict =
  createDictionary(baselineText + '\n' + supplementText)`, return
  `{ dictionary: fullDict, solver: createSolver(baselineDict), content }`.
- `scripts/lib/load-dictionary.ts` (used by sim and tests): add a way to
  load baseline vs full. The sim builds its solver from baseline (so its
  numbers do not move) and may validate against full (harmless; bots
  only ever play solver words anyway).
- Content: `src/content/dictionary/words.txt` unchanged; add
  `src/content/dictionary/supplement.txt` and a source license note
  (`WORDS-ALPHA-LICENSE.txt`, Unlicense / public domain).
- Build: `scripts/build-supplement.ts` mirrors `build-dictionary.ts`:
  fetch words_alpha from a pinned URL with a pinned sha256, filter to
  length 3-15 and `^[a-z]+$`, apply `blocklist.txt`, subtract every word
  already in `words.txt`, sort, write `supplement.txt`. Fails loudly on a
  hash mismatch. `npm run supp:build`.

## Task commits (each green, tests in the same commit)

1. `scripts/build-supplement.ts` + `supp:build` script + the generated
   `supplement.txt` and license file. A unit test on the filter
   (`filterSupplement`) mirroring the dictionary build test.
2. Engine + context split: `context.ts` two-file load, solver from
   baseline, dictionary from full; `load-dictionary.ts` baseline/full
   helpers; `sim.ts` on baseline. Tests: `has('brewmaster')` true on the
   full dict and false on the baseline; the solver's word set equals the
   baseline (no supplement word appears in `solver.words`); a grid for a
   fixed seed is byte-identical built from baseline vs full solver
   (the replay guard).
3. Release notes + ROADMAP entry; fill PR #103's now-known merge sha
   (`c22d14a`... use the short sha) in release-notes.ts.

## Sim

Reran `npm run sim` (500 runs/bot). Byte-identical to the last run
(greedy 85.2%, mediocre 26.0%, solver 97.0%), confirming the solver path
is untouched; all three exit criteria pass. Pasted from the output:

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 210 items, variant base, cell balanced, mode normal. 254.9s

|      bot | runs | win rate | median enc. | mean turns | scrambles | shuffles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    85.2% |           9 |       15.2 |        87 |       30 |   100 |   100 |    96 |    89 |    89 |    89 |    86 |    84 |    84 |
| mediocre |  500 |    26.0% |         8.5 |       28.4 |       272 |        4 |   101 |    94 |    81 |    56 |    62 |    67 |    59 |    67 |    74 |
|   solver |  500 |    97.0% |           9 |       10.8 |        32 |       25 |   100 |   101 |    98 |    95 |    94 |    94 |    94 |    93 |    92 |

Exit criteria:
  PASS  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
```

If a future rerun differs, the baseline path was touched by mistake and
the change is wrong.

## Risks

- The one that matters: any path that lets the FULL dictionary reach the
  solver or grid generation silently reintroduces the determinism break.
  The adversarial seat should try exactly this: prove `freshGrid`/`isDead`
  see only baseline, and that a fixed seed produces identical grids
  before and after the supplement is added.
- Bundle growth ~2.26 MB raw (~600 KB gzip) on a lazy chunk. Acceptable;
  definitions.txt is already 6 MB lazy.
- Offensive/abbreviation entries in words_alpha become *accepted*. The
  blocklist is applied; the rest is acceptable for a single-player game
  with no leaderboard and is aligned with the ask.

## Acceptance

- `brewmaster` (and a sample of other real words ENABLE lacked) is
  accepted in a real fight when spellable.
- A fixed seed produces byte-identical grids to `main`; the daily and a
  pasted seed replay identically. Proven by a test and by the adversarial
  seat.
- `npm run sim` table unchanged from the last run.
- `npm test` and `npm run lint` green; CI green.
