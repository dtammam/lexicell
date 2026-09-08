# Roadmap

The phases and their exit criteria are defined in
`docs/lexicell-architecture-pack.md` (Implementation Roadmap). This file
tracks what is planned and what shipped, honestly: what the gate caught
and what is still open ships disclosed here.

## Planned

### Phase 0 - Spike: is the loop fun? (CLOSED 2026-09-08, plan in `docs/exec-plans/completed/phase-0-spike.md`)

- [x] rng, dictionary, solver, scoring, effects, hooks, 10 items, 3 enemies + 1 boss, reducer, sim harness
- [x] Exit criteria: mediocre 23.2% (band 20-40%), no dead grids, items move win rate (0.0% with `--items none`). Greedy 91.0% against the < 90% bar: Dean ruled it noise at n=500 (2026-09-06) and signed Phase 0 off as met on 2026-09-08. Disclosed, not hidden.
- [x] Dean's decisions on the structural finding: greedy capped at 7, attacks stay per word, act 1 eased plus a starting kit, act 2 and E9 next.

### Phase 1 - Walking skeleton (BUILT 2026-09-08, plan `docs/exec-plans/active/phase-1-walking-skeleton.md`)

- [x] Vite + Svelte 5 + PWA scaffold, persist, store, Fight/Pick/Summary screens, nginx image, CI and publish workflows (see Shipped)
- [ ] Exit: Dean plays one fight on his phone from the home-screen icon, offline. Needs HTTPS on the NUC and the Docker Hub secrets on the repo. The plan moves to `completed/` when Dean ticks this.

### Phase 2 - MVP

### Phase 3 - Iterations

## Open

- **Act 2 and E9 tuning wave, deferred behind Phase 1 (Dean,
  2026-09-08).** Content only. Targets in the closed Phase 0 plan's
  Handoff section: E9 costs mediocre 50-60 HP with a full kit (now
  ~92), greedy 25-35 (now ~54); more than 147 of 300 mediocre runs
  reach E6. Act 1 is not touched again.
- The enforcement layer of the harness (PreToolUse staging block,
  session-start hook, `.claude/settings.json`, pre-commit sim smoke,
  pre-push hook, the Node built-ins lint ban) sits on branch
  `harness/enforcement` awaiting Dean's own review. Dean's rule: the
  agent does not merge changes to its own constraints. Until it merges,
  CLAUDE.md and CONTRIBUTING describe hooks that are not yet installed.
- Save schema stays `v: 1` although `RunState` gained `pendingPicks` in
  the act-1 wave. No persistence layer exists and no save has ever been
  written, so there is nothing to migrate; `v: 1` is the shape at the
  moment `persist.ts` lands. Tech-debt #3 holds the revisit trigger.
- Sim harness suspicion (adversarial round, not a finding): a scramble
  on an encounter's final turn could be counted twice because the
  `pickItem` batch inherits the previous `lastTurn`. Measured 0
  occurrences over 1500 runs. Pre-dates the act-1 wave.

## Shipped

### Feel wave (PR #1, merged 2026-09-08)

Dean played the skeleton and asked for clarity and feel. Shipped:
green-means-valid tiles with values and selection order; WordNet
definitions for played words (61.5% of ENABLE, 1.4 MB gzip lazy chunk)
and a word of the day; title screen with Continue and a two-step
abandon (tracker #4 closed); items panel; an arena with generated
pixel sprites, act backgrounds, hit flash, shake and floating damage;
shuffle that costs the turn (the one engine change); rotation-proof
tile sizing; a dependency diet (no Workbox or PWA plugin, no testing
library, 557 to 233 packages, hand-written service worker).

What the gate caught (one adversarial round): the green-word test
could not tell isWord from a length check; abandoning from a fresh
load did not clear the save; the service worker would have cached a
502 page as the offline index; sprite paths ignored Vite's base on
the LAN route; two shuffle mutants unbound. All fixed in the PR.
Replay against main's reducer: 40,276 steps, 0 mismatches; both sim
tables reproduced cell for cell (unchanged from the entry below).
Measured at merge: 142 tests, lint clean. Iteration mode (CLAUDE.md)
starts after this wave: reviewer only for engine and persistence.

### Phase 1 walking skeleton (`feat/phase-1-skeleton`, merged 2026-09-08)

Vite 7 + Svelte 5 + TypeScript scaffold with the engine import wall
verified by probe; dictionary bundled as a lazy `?raw` chunk;
versioned localStorage persist behind an injectable Storage; a
plain-TS store that is the only caller of `reduce`; Fight, Pick and
Summary screens; PWA manifest and service worker precaching the
dictionary; generated icons; nginx image; CI on branches; Docker
publish on main (`deantammam/lexicell:edge`). Dean's 2026-09-08
direction: playable first, iterate after. Scope is the pack's Phase 1
plus the bare pick and summary screens the real reducer needs.

No browser extension was available, so the promised manual pass
became a jsdom suite that mounts the real App with the real
dictionary and reducer and plays a run through the DOM.

What the gate caught (one adversarial round, APPROVE with two
warnings, fix round, re-APPROVE): a save with the right keys and
wrong types loaded, threw in render and came back on every reload
(now refused by a typed shape check, with a render boundary that
drops the save and starts fresh as the net); Pick's index binding was
unbound by the suite (bound at seed 20260918); the turn-start report
rendering was unbound (same test); a false claim about workbox's
default file-size cap in a comment; and the plan named a file that
did not exist.

Measured at merge: `npm test` 111 passed, `npm run lint` clean
(eslint, tsc, svelte-check), build 59 kB app + 1,665.56 kB dictionary
chunk (440.03 kB gzip), service worker precaches 14 entries. CI green
on the branch. The Docker image is unbuilt on the dev box (no Docker);
the publish workflow builds, smokes and pushes it in CI once Dean adds
`DOCKER_USERNAME` and `DOCKER_PASSWORD` to the repository secrets.

Still open: the Phase 1 exit is Dean's alone (HTTPS on the NUC, home
screen install, airplane mode, one fight). Locked tiles are disabled
in the UI but no test binds that; the reducer rejects a locked tile
anyway. `npm run sim -- --runs 10` in CI is a smoke, not a gate: it
exits 0 when a criterion prints FAIL.

### Act-1 wave (`tune/greedy-cap`, merged 2026-09-08)

Greedy bot capped at 7 letters with an uncapped `solver` reported as
the upper bound; `tuning.startingPicks` engine knob (shipped at 1, the
starting kit); act 1 eased; `--variant pre-act1` restores the previous
content so the baseline stays reproducible. Engine files changed
(`types.ts`, `reducer.ts`), so the wave took one adversarial round.

What the gate caught: every sim cell reproduced, but three test-binding
gaps. The kit's empty-offer path could revert to skipping encounter 0
with 86/86 green; the greedy cap could change to 6 or 8 unnoticed
while the criterion label still said 7; the sim usage block named a
variant that did not exist. All bound with mutation-tested fixes, plus
the clamp on `startingPicks` and a content guard against non-finite
knobs. 91 tests.

Shipped content, `npx tsx scripts/sim.ts`:

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 10 items, variant base. 127.5s

|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    91.0% |           9 |       21.1 |         5 |   100 |    99 |    97 |    91 |    88 |    85 |    58 |    63 |    66 |
| mediocre |  500 |    23.2% |           4 |       32.6 |         8 |   100 |    92 |    71 |    34 |    25 |    19 |    16 |    19 |    19 |
|   solver |  500 |    99.2% |           9 |       15.3 |         4 |   100 |   100 |    99 |    96 |    96 |    96 |    81 |    86 |    89 |

Exit criteria:
  PASS  mediocre wins 20-40%
  FAIL  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

Previous content, `npx tsx scripts/sim.ts --variant pre-act1` (the
`solver` row is the old uncapped greedy, i.e. the Phase 0 baseline;
`greedy` is the cap alone):

```
Lexicell sim: 500 runs per bot, seeds 0..499, all 10 items, variant pre-act1. 110.3s

|      bot | runs | win rate | median enc. | mean turns | scrambles | HP@E1 | HP@E2 | HP@E3 | HP@E4 | HP@E5 | HP@E6 | HP@E7 | HP@E8 | HP@E9 |
|----------|------|----------|-------------|------------|-----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
|   greedy |  500 |    59.4% |           9 |       21.2 |         4 |   100 |    96 |    89 |    62 |    60 |    58 |    39 |    44 |    47 |
| mediocre |  500 |     8.4% |           3 |       21.2 |         1 |   100 |    65 |    33 |     8 |    11 |    13 |    14 |    16 |    18 |
|   solver |  500 |    92.4% |           9 |       17.1 |         9 |   100 |    99 |    96 |    85 |    85 |    84 |    66 |    71 |    73 |

Exit criteria:
  FAIL  mediocre wins 20-40%
  PASS  greedy (best word of <= 7 letters) wins, but < 90%
  PASS  no run hit a grid with zero valid words
  ----  win rate moves with items: compare against --items none
```

### Phase 0 engine (main through 9f63d34, pre-harness)

Landed before the harness existed; see tech-debt #1.
