<!-- harness:region:start id=doc -->
# Reliability

*Schema template. `/seed` fills the placeholder tokens from the detected
project; every `## ` heading is fixed — a section may read "N/A — none" but is
never renamed or reordered. The `keep` region at the bottom is yours and
survives every harness update.*

How reliability is defined and measured here — so a change can be judged against
it, not against a vibe. Referenced from `AGENTS.md` for "how reliability is
defined and measured here."

## What "reliable" means here

*The concrete definition for this system: the behavior it must uphold, and the
bar it is held to. Not a platitude — something a change can be checked against.*

"Reliable" here has two faces. (1) Correctness / determinism: a run replays byte-for-byte from its seed, so the daily challenge is identical for everyone on a build and a shared or pasted seed round-trips; saves migrate forward without dropping an in-progress run; a grid never presents zero playable words. (2) Balance: the game stays within measured difficulty targets — a mediocre bot wins 20-40%, a length-capped "greedy" bot wins but under 90%, and no run hits a dead grid. A change is judged against these, not against feel.

## How it's measured

*The signals and thresholds that say whether the bar is being met — tests,
metrics, SLOs, error budgets, or the manual checks that stand in for them.*

- `npm test` — Vitest (380+ tests), including byte-identical replay/determinism tests and save-migration tests.
- `npm run lint` — ESLint + `tsc --noEmit` + `svelte-check --fail-on-warnings`; also enforces the engine/content framework-free boundary.
- `npm run sim` — the headless bot simulator; prints per-bot win rates and PASS/FAIL against the exit criteria (results are pasted from output, never typed). `npm run power [-- --mode endless]` measures one-shot rate and overkill for balance.
- CI (`.github/workflows/ci.yml`, Node 24) runs lint + test + build on every push; the Docker publish additionally runs a 10-run sim smoke before it ships on merge to main.

## Failure modes & blast radius

*The ways this system fails, and how far each failure spreads — what breaks,
who's affected, and what stays contained.*

- RNG divergence: any change that alters how much RNG a seed consumes (for example grid generation reading a different word list) silently breaks daily/shared-seed reproducibility across builds. Contained to reproducibility, not crashes; caught by determinism tests and the adversarial review.
- Save-schema break: adding or removing a `RunState` field without a migration drops a player's in-progress run on their next load. Blast radius: that one device's current run.
- Balance drift: a content or tuning change can make the game trivial or unwinnable. Contained to feel; caught by `npm run sim` against the exit criteria.
- Layout overflow: a UI change can push a screen past the single no-scroll viewport on a small phone (verified with a headless 390px render before shipping).
- Missing generated asset (e.g. a cell sprite) falls back gracefully via `onerror`; it never crashes the app.

## Startup / smoke checks

*The fast checks that confirm the system is up and sane after a start or deploy —
what to run, and what a healthy result looks like.*

- Local: `npm run lint && npm test && npm run build` should all pass; the pre-commit hook (`.githooks`, wired via `core.hooksPath`) refuses a red tree.
- Balance sanity after any engine/content change: `npm run sim` shows all exit criteria PASS (and `npm run power` for one-shot rate / overkill).
- The build prints `service worker: N files precached`; a healthy app then loads offline (airplane mode) from the cached bundle.
- Deployed: the Pages build at https://dtammam.github.io/lexicell/ loads to the title screen with a word of the day.

## Degradation & recovery

*How the system degrades under stress rather than falling over, and the steps to
bring it back — retries, fallbacks, rollback, and the recovery runbook pointer.*

There is no server to fall over; the app degrades within the client. A saved run that passes the shape check but still breaks a screen is dropped and a fresh one started (a bounded auto-recovery in `App.svelte`) rather than showing a white screen. Share degrades share-sheet -> download -> copy-text; audio is optional (a 404 leaves it silently off); missing sprites fall back to a placeholder. Recovery from a bad release is a redeploy: every merge to main republishes the Docker image and Pages, so the path is to roll forward with a fix (revert the commit, merge). There is no data migration to undo, since state is per-device localStorage.
<!-- harness:region:end id=doc -->

<!-- harness:region:start id=project keep -->
## Reliability notes

*This region is yours. The harness never regenerates it on update. Record here
the hard-won operational lessons: incidents and their rulings, known-fragile
areas, environment quirks, and the checks that exist because something once
broke.*

- If a build breaks on the main line, fix it before any new feature work.
- _(incidents and dated rulings accrete here — the seed step and your own edits
  fill this in)_
<!-- harness:region:end id=project -->
