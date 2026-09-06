# Lexicell

Mobile-first PWA word-battle roguelike inspired by Bookworm Adventures. Single player, no backend, no meta-progression. Full brief: `docs/lexicell-architecture-pack.md` — read it before non-trivial work.

## Non-negotiable rules

- `src/engine/` and `src/content/` import nothing from `svelte`, `src/ui/`, or the DOM. ESLint enforces this; do not disable the rule.
- All state changes go through `reducer.ts`. No mutation anywhere else.
- `Math.random` is banned in `src/engine/`. Use the seeded RNG carried in state.
- Run state is JSON-serializable at all times. If you add a class instance, a Map, a function, or a Date to state, you are wrong.
- Items and enemies are data in `src/content/`. If an item needs behavior that `effects.ts` cannot express, propose the engine change to Dean before implementing; do not special-case it.
- Every engine module ships with tests in the same commit. `scripts/sim.ts` must still run after any engine change.
- Save schema is versioned (`{ v: N }`). Bumping it requires a migration or an explicit "old saves are dropped" note.

## Scope guard

Read "What This Is Not" in the pack. Do not add: era-specific dictionaries, era-specific rules, unlocks, accounts, leaderboards, cloud sync, narrative screens, a timer, a game engine, canvas rendering. If Dean asks for one of these, point at the scope doc and ask whether the scope is changing.

## Stack

Vite + Svelte 5 + TypeScript, `vite-plugin-pwa`, vitest, ESLint. Static build → nginx container on the homelab via GitHub Actions. localStorage for the single saved run.

## Phase gate

Phase 0 (headless engine + sim harness) must meet its exit criteria before any UI code exists. Report sim results to Dean as a table.

## Working style

Dean is a capable engineer who prefers blunt, skeptical collaboration. Push back on scope creep, including his own. Don't praise; report.
