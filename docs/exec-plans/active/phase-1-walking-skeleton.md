# Exec plan: Phase 1 - walking skeleton

Status: ACTIVE (started 2026-09-08). Branch `feat/phase-1-skeleton`.
Spec of record: `docs/lexicell-architecture-pack.md`, Implementation
Roadmap, Phase 1, and ADR-001/002/003/006.

## Goal

The thinnest slice through the real stack: Dean plays one fight on his
phone from a home-screen icon, offline. Nothing about the game is
tuned or pretty in this phase; the engine is the one that already runs
in the sim.

## Dean's decisions on record (2026-09-08)

1. Phase 0 declared met. Greedy at 91.0% against the 90% bar is
   disclosed as noise at n=500 (ROADMAP, Shipped). Phase 1 has the go.
2. The act-2 + E9 tuning wave is deferred until after Phase 1; it is
   content-only and retunes against real play.
3. "Get us up and running before worrying too much about the larger
   process. Game should be playable. This will be iterative."
4. `harness/enforcement` is Dean's to review and merge; the agent does
   not merge changes to its own constraints.

Standing (2026-09-06): no new `Effect` type; no run-structure change;
attacks per word; sim tables pasted, never typed. Phase 1 restores the
full two-reviewer gate for engine changes; this wave touches no file
under `src/engine`, so it ships on `npm test`, `npm run lint`, and the
one-round adversarial review that CLAUDE.md gives waves (see Gate).

## Design

### Scope, deliberately wider than the pack's Phase 1 by two screens

The pack's Phase 1 says "one enemy, no items, no pick screen". The
engine on main opens every run with a starting-kit pick and the run is
nine encounters long. Rendering the real reducer with only a fight
screen would dead-end at the first pick. So the skeleton renders all
three phases the reducer can be in, each as plainly as possible:

- `fight`: 16 tiles, tap to select, Attack, damage number, enemy HP
  bar, player HP, refill. Everything the reducer already reports.
- `pick`: three item names with descriptions, tap one.
- `summary`: won or lost, best word, New run.

No items bar, no animation beyond a hit flash, no boss intro, no
portrait polish. Those are Phase 2.

### Layout of the new code

```
index.html                  Vite entry, viewport meta, theme colour
public/icons/               PWA icons (generated, committed)
src/ui/main.ts              mounts App, boots the browser context
src/ui/context.ts           EngineContext for the browser (dictionary via ?raw import)
src/ui/persist.ts           localStorage save/load, versioned, injectable Storage
src/ui/store.ts             plain TS: current RunState, dispatch(action), subscribe
src/ui/App.svelte           phase switch
src/ui/Fight.svelte         grid, enemy, attack
src/ui/Pick.svelte          three buttons
src/ui/Summary.svelte       outcome + new run
src/ui/*.test.ts            persist and store tests (no DOM needed)
vite.config.ts              svelte + PWA plugins
Dockerfile, nginx.conf      static build served by nginx
.github/workflows/ci.yml    lint + test + build on every push
.github/workflows/docker-publish.yml  edge image on main, filetube pattern
```

### Decisions inside the design

- **Dictionary in the bundle.** `words.txt` (1.6 MB) is imported with
  Vite's `?raw` from a lazily imported module, so the first paint does
  not wait on it and the service worker caches it as part of the app.
  ADR's "fetch once, cached by SW" is satisfied without a second
  request path. Revisit if the bundle size bites on cold start.
- **Store, not components, owns state.** A plain-TS store holds the
  `RunState`; `dispatch(action)` calls `reduce`, then `persist.save`,
  then publishes. App.svelte mirrors it into a `$state.raw` rune.
  Components render state and call `dispatch`. Nothing else mutates.
- **Persist is injectable.** `createPersist(storage: StorageLike)` so
  tests run without a DOM and the UI passes `localStorage`. Load
  refuses any blob whose `v` is not `SAVE_VERSION`, drops it, and
  starts fresh. The schema is unchanged in this wave (still `v: 1`).
- **Seed.** A new run's seed is `Date.now() >>> 0` in the UI, never in
  the engine. The seed shows on the summary screen so a run can be
  replayed in the sim.
- **tsconfig.** `lib` gains `DOM`, `types` gains `vite/client` and
  `svelte`. Engine purity stays enforced by ESLint's restricted
  globals and imports; tsc alone would not catch `document` in the
  engine, and that was already true of `fetch` before this wave.
- **Deploy.** Multi-stage Dockerfile: node:24-alpine builds, nginx:alpine
  serves `dist/` with an SPA fallback and long cache headers on hashed
  assets, no cache on `index.html` and `sw.js`. Image
  `deantammam/lexicell:edge` on every push to main, plus `sha-<short>`;
  the filetube tagging scheme without releases yet. The NUC side is a
  compose file in `docs/deploy.md` for Dean to drop into his stack; the
  agent cannot reach the NUC and Docker is not installed on the dev
  box, so the image is smoke-tested in CI only.
- **HTTPS is Dean's side.** ADR-006: install and the service worker
  silently fail over plain HTTP. `docs/deploy.md` says to check this
  first.

## Task commits

- T1 Scaffold: Vite + Svelte 5 + TypeScript + vite-plugin-pwa;
  eslint-plugin-svelte and svelte-check wired into `npm run lint`;
  `npm run build` produces `dist/`; the engine import wall still
  fires (a test that lints a fixture importing svelte from the engine
  path, or a documented manual check). Existing 86 tests untouched.
- T2 Browser context + persist: `context.ts`, `persist.ts` with tests
  (round-trip, version refusal, corrupt JSON), `store.svelte.ts` with
  tests (dispatch goes through `reduce`, save called per step).
- T3 Screens: Fight, Pick, Summary, App. Played end to end in the dev
  server by the agent (Playwright is not in scope; a manual pass with
  the browser tool, screenshots attached to the report).
- T4 PWA + deploy: manifest, icons, service worker precache,
  Dockerfile, nginx.conf, the two workflows, `docs/deploy.md`.
- T5 Docs: CONTRIBUTING commands and layout rows for `src/ui/`;
  ROADMAP Phase 1 entry.

## Gate

No file under `src/engine` or `src/content` changes. Under the
CLAUDE.md wave rules a wave gets the full gate; Dean's 2026-09-08
direction is to get playable first. Applied: one adversarial round at
the end over the whole branch, briefed on persist (version refusal,
corrupt input, save-per-step), store purity (no state mutation outside
`reduce`), the engine import wall under the new tsconfig, and the
build artefact (does `dist/` actually contain the dictionary and the
service worker). QA seat skipped this wave; disclosed in ROADMAP.

## Risks

- Bundle with the dictionary is ~2 MB of JS. Acceptable for a PWA that
  installs once; measured size goes in the ROADMAP entry.
- Svelte 5 runes + strict TS + `exactOptionalPropertyTypes` may fight
  in `.svelte` files. svelte-check decides; if it is noisy, the UI
  gets its own tsconfig rather than loosening the engine's.
- Service worker over LAN HTTP will not register. This is expected and
  documented, not a bug to chase.

## Acceptance

- `npm run lint`, `npm test`, `npm run build` green; test count and
  bundle size recorded in the merge commit.
- The agent plays a full run in the dev server without a reducer
  rejection it cannot explain; screenshots in the report.
- CI green on the branch; `edge` image published from main.
- Dean: home-screen install over HTTPS, airplane mode, one fight. That
  is the Phase 1 exit and only Dean can tick it.
