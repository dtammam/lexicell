<!-- harness:region:start id=doc -->
# Architecture

*Schema template. `/seed` fills the placeholder tokens by scanning the
codebase; every `## ` heading is fixed — a section may read "N/A — none" but is
never renamed or reordered. The `keep` region at the bottom is yours and
survives every harness update.*

What kind of system this is and how it's shaped. Referenced from `AGENTS.md` for
"what kind of system this is and how it's shaped." Read it before touching a part
you don't own end-to-end.

## System purpose

*What this system is for, in one or two sentences — the problem it exists to
solve, not how.*

Lexicell is a mobile-first, single-player word-battle roguelike (inspired by Bookworm Adventures crossed with Balatro / Slay the Spire): you spell words on a 16-tile grid to fight through a run of encounters, drafting mutations and evolving as you go. It runs entirely in the browser as a PWA, with no backend, no accounts, and no meta-progression.

## Shape / topology

*The overall form: monolith, service set, CLI, library, batch job — and how the
pieces are deployed and talk to each other.*

A static single-page PWA (Vite + Svelte 5 + TypeScript). Vite builds `src/` into a static bundle served two ways from one CI pipeline: an nginx Docker image published to Docker Hub on every merge to main, and GitHub Pages at https://dtammam.github.io/lexicell/. There is no server or API; the app is self-contained and plays offline via a hand-written service worker (`scripts/lib/service-worker.ts`). All persistence is the browser's localStorage.

## Key components

*The parts that carry real responsibility, each with a one-line charter.*

- `src/engine/` — the headless game rules. A single reducer (`reducer.ts`) is the only place state changes; a seeded RNG (`rng.ts`), scoring (`scoring.ts`), grid generation (`grid.ts`), the dictionary/solver. Framework-free (no Svelte, no DOM) and deterministic.
- `src/content/` — the game as DATA: mutations/items, enemies and bosses, starting cells, the act/encounter tuning curve (`acts.ts`), and the ENABLE dictionary plus a words_alpha supplement. Also framework-free.
- `src/ui/` — the Svelte 5 view layer: renders `RunState` and dispatches actions to the reducer; the screens (Title/Fight/Summary/…), persistence (`persist.ts`), share cards (`shareCard.ts`), audio, run history.
- `scripts/` — the tuning and tooling harness, run with `tsx`: a headless bot simulator (`sim.ts`), the power-scaling metric (`power-scaling.ts`), and the dictionary/definition builders.
- `.github/workflows/` — CI (lint/test/build), Docker publish (with a 10-run sim smoke), and the GitHub Pages deploy.

## Data & state

*What data the system owns, where state lives, and what is authoritative vs.
derived.*

The authoritative game state is `RunState`, a plain JSON object produced only by the reducer. It persists to localStorage as the single saved run under a versioned envelope `{ v: N }` with explicit migrations (`persist.ts`, currently v11). Separate localStorage keys hold run history, per-device settings, and the last-seen build. Everything the UI shows is derived from `RunState`. The engine reads a seeded RNG carried inside the state, so a given seed reproduces the same run (this powers the daily challenge and shared/pasted seeds). Content (items, enemies, tuning) is authored in `src/content/`, never stored in state; the word list and definitions ride in the bundle as text, loaded lazily.

## External dependencies & boundaries

*Systems, services, and APIs this depends on, and the line where this system's
responsibility ends and theirs begins.*

Effectively none at runtime: `package.json` declares zero runtime `dependencies` — only Svelte's runtime ships on the device, a deliberate constraint (a new runtime dependency needs an explicit decision). No backend, database, or third-party API is called. Build/dev tooling only: Vite ^7, TypeScript ^5.9, Vitest ^3 + jsdom, ESLint (+ svelte-check), and tsx. The boundary: the app owns everything a player touches; its only external surfaces are the static hosts it deploys to (Docker Hub image, GitHub Pages) via GitHub Actions.

## Invariants

*Things that must always hold — the properties a change is never allowed to
break. Violating one is a correctness bug, not a preference.*

- `src/engine/` and `src/content/` import nothing from Svelte, `src/ui/`, or the DOM (enforced by ESLint in `eslint.config.js`).
- All state changes go through `reducer.ts`; there is no mutation anywhere else.
- `Math.random` is banned in `src/engine/` — only the seeded RNG carried in state (ESLint-enforced).
- `RunState` is JSON-serializable at all times: no class instances, Maps, functions, or Dates.
- The save schema is versioned (`{ v: N }`); a shape change requires a migration or an explicit "old saves dropped" note.
- A given seed reproduces a given run byte-for-byte (replay determinism); the daily challenge and shared seeds depend on it.
- Every engine module ships with tests in the same commit, and `scripts/sim.ts` still runs after any engine change.
<!-- harness:region:end id=doc -->

<!-- harness:region:start id=project keep -->
## Architectural decisions

*This region is yours. The harness never regenerates it on update. Record here
the significant, dated design decisions and the trade-offs behind them — the
context a fresh session needs to avoid re-litigating settled choices or breaking
one by accident.*

- _(none recorded yet — the seed step and your own edits fill this in)_
<!-- harness:region:end id=project -->
