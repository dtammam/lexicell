# Lexicell

Mobile-first PWA word-battle roguelike inspired by Bookworm Adventures. Single player, no backend, no meta-progression. Full brief: `docs/lexicell-architecture-pack.md`. Read it before non-trivial work.

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

Vite + Svelte 5 + TypeScript, a hand-written service worker (`scripts/lib/service-worker.ts`), vitest, ESLint. Static build -> nginx container on the homelab via GitHub Actions, published to Docker Hub on every merge to main. localStorage for the single saved run. Dependencies are a cost (Dean, 2026-09-08): nothing third-party ships on the device except Svelte's runtime; a new runtime dependency needs Dean's go.

## Phase gate

Phase 0 (headless engine + sim harness) must meet its exit criteria before any UI code exists. Report sim results to Dean as a table.

## How we work: lean mode

Ported from github.com/dtammam/filetube (`docs/references/lean-mode-methodology.md` there). You, the main session, run the whole lifecycle: design, implement, test, review, merge. Subagents are used for exactly two things: the **two-reviewer gate** (codified in `.claude/agents/`) and optional design exploration on big waves. Dean's trust rests on two pillars, never traded for speed: work is never merged on your own say-so, and failures are reported verbatim.

### Lifecycle of a wave

1. **Intake.** For anything non-trivial, ask Dean numbered questions with your recommendation inline so he can reply "agree" or override per number. Challenge the framing before solutioning. Every perception or request Dean shares goes into `docs/playtest-log.md` the same day, with a next step of to do / implemented (PR #n) / no longer needed (reason); update the row when its status changes.
2. **Design (big waves).** A written exec plan in `docs/exec-plans/active/<name>.md`: goal, Dean's decisions, design, task commits, risks, acceptance. It is the reviewers' spec and survives context compaction. Measured numbers in a plan are predictions the tools re-verify.
3. **Implement** in small task commits on a branch, each with its tests, each green. Commit messages describe the decision and record MEASURED results, never projected ones.
4. **Gate.** Full gate (QA seat + adversarial seat) for waves; slim gate (adversarial alone) for docs, hotfixes, harness tweaks. Anything touching the RNG, the reducer's turn order, `RunState`, or the save schema gets the full gate with the adversarial seat briefed to break replay. **Phase 0 dial-back (Dean, 2026-09-06, until the exit criteria are met):** a reviewer is spawned only when a file under `src/engine` changes or for `harness/enforcement`, one round per wave at its end. Content, scripts, docs and tuning waves ship on `npm test`, `npm run lint` and your own review. Sim tables in ROADMAP and exec plans are pasted from `npm run sim` output, never typed; that rule replaces the gate for content. Full rules return at Phase 1.
5. **Fix round.** Apply every finding, including non-blocking ones when cheap. Delta re-confirm with the SAME reviewer agents via SendMessage until both APPROVE. Verify their prescriptions too.
6. **Merge.** `git merge --no-ff` into main. Move the exec plan to `completed/` when the wave closes. ROADMAP.md gets an honest entry: what shipped, what the gate caught, what is still open.
7. **Memory + report.** Update persistent memory, then report: outcome first, then what the gate caught, then what Dean should check himself.

### Iteration mode (Dean, 2026-09-08, in force until anchored back)

Dean's ruling after playing the first build: "I want to iterate way
more quickly now than the ceremony will allow. This game is not
critical; it will not hold mission-critical data. It does not warrant
such thorough review for every change." The full lifecycle above
stays the reference; while iteration mode is in force it is applied as
follows. Anchor back (return to the full rules) when the game is live
with real users, or when Dean says so; at that point test quality and
review depth change, not before.

1. **Reviewer only for engine and persistence.** Spawn the
   `adversarial-reviewer` only when a change touches `src/engine/`,
   the save schema, or `src/ui/persist.ts`. One round, at the end.
   The `quality-assurance` seat is benched. UI, content, docs, scripts
   and tooling ship on `npm test`, `npm run lint`, CI green, and your
   own review.
2. **Full sim reruns only when the engine or content changes.** CI's
   ten-run smoke runs on everything. When a rerun happens, tables are
   still pasted, never typed.
3. **One task per PR, merged as soon as CI is green.** Small PRs,
   merged through GitHub (`gh pr merge --merge` keeps the merge
   commit), so Dean's container gets something new every hour rather
   than at the end of a wave. Direct pushes to main stay forbidden.
4. **Exec plans only for waves that touch the engine or the save.**
   Everything else gets a one-line ROADMAP entry at merge.
5. **Short commit messages.** Decision and measured result in a few
   lines; no essays.

Unchanged: failures reported verbatim, known gaps disclosed, explicit
staging, no `--no-verify`, no force-push, no em dashes, every engine
module tests in the same commit, `scripts/sim.ts` still runs.

### The two-reviewer gate

Spawn the seats by agent type, never as ad-hoc prompts: `quality-assurance` (correctness, regressions, engine contract, standards, comment accuracy; has Bash, runs the instruments) and `adversarial-reviewer` (assumes both you and QA missed something; measures every claim, mutation-tests bindings, leaves the tree byte-identical). Your task prompt carries the wave brief: branch, commit range, exec plan, and the named attack surfaces. Both report CRITICAL/WARNING/SUGGESTION with a concrete failure scenario each, then APPROVE or REQUEST CHANGES. Both must APPROVE before merge. If an agent type does not resolve yet (registry refresh lag), brief the discipline inline from the agent file.

### Standing norms (non-negotiable)

- Every change goes branch -> gate (as iteration mode defines it) -> pull request -> merge commit on main. No direct-to-main commits, no exceptions for size.
- Test failures and sim results are reported verbatim, with counts and the command, before any framing. A regression is a regression even when inconvenient.
- Known gaps ship DISCLOSED in ROADMAP.md and the report. Accepted residuals go in `docs/exec-plans/tech-debt-tracker.md` with a revisit trigger.
- Stage explicit paths only. A PreToolUse hook refuses the common blanket spellings (`git add -A`, `.`, `-u`, `*`, `$(...)`, `xargs`, `git commit -a`, through prefixes or `sh -c`); its measured blind spots are in tracker #2. The hook is a backstop, the discipline is yours. Confirm the branch before every commit. Verify every commit landed with `git log`; the pre-commit hook refuses red.
- Never `--no-verify`, never force-push, never `git checkout --` a dirty tree blind.
- No em dashes in any new text. Use a spaced hyphen.
- Mutation-test against a commit, never the dirty tree. Never switch branches under an active reviewer.

### Where the rest lives

| What | Where |
|------|-------|
| Architecture, ADRs, roadmap, exit criteria | `docs/lexicell-architecture-pack.md` |
| Coding standards, commands, git conventions | `docs/CONTRIBUTING.md` |
| Active exec plans / tech debt | `docs/exec-plans/active/`, `docs/exec-plans/tech-debt-tracker.md` |
| What shipped, what is open | `ROADMAP.md` |
| Hard-won lessons, current state | Persistent memory (auto-loaded) |

## Working style

Dean is a capable engineer who prefers blunt, skeptical collaboration. Push back on scope creep, including his own. Don't praise; report. Lead with the outcome; he reads on his phone.
