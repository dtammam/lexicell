# Handoff: 2026-09-06, session paused by Dean

Read this first when resuming. Then `docs/exec-plans/active/phase-0-spike.md`,
whose "Handoff" section has the tuning targets. Everything below was true at
the moment of the pause; verify with `git log --oneline --all -15` and
`git ls-remote --heads origin`.

## State of the branches

| Branch | Head | State |
|--------|------|-------|
| `main` | a6ec1bd + this handoff merge | Phase 0 engine (12 pre-harness commits) + the docs half of the lean-mode harness. Pushed. |
| `harness/enforcement` | 961709e | Hooks, `.claude/settings.json`, git hooks with sim smoke, Node built-ins lint ban. Adversarial gate APPROVE (3 rounds). **Waits for Dean's own review; the agent does not merge it.** Pushed. |
| `tune/greedy-cap` | 2057118 | The act-1 wave: greedy bot capped at 7 letters + `solver` bot, `tuning.startingPicks` engine knob, act 1 eased, A + B as content, `pre-act1` sim variant, plan updated with pasted tables. 86 tests green. **Not merged: engine files changed (`types.ts`, `reducer.ts`), so it owes one adversarial round first.** Pushed. Worktree at the session scratchpad may be gone; re-check out normally. |
| `harness/lean-mode` | 77eac77, local only | Superseded by docs + enforcement. Delete with `git branch -D` once Dean confirms (its content is fully on the two branches; `-d` refuses because the commit objects differ). |

Tech debt: `docs/exec-plans/tech-debt-tracker.md` rows #1 (Phase 0
commits pre-date the harness; retro gate pending) and #2 (staging hook's
measured gaps, hardening frozen).

## Phase 0 exit criteria, on tune/greedy-cap (pasted, 500 runs, seeds 0-499)

| criterion | result |
|-----------|--------|
| mediocre wins 20-40% | PASS, 23.2% |
| greedy (<= 7 letters) wins but < 90% | FAIL by one point, 91.0%; Dean: noise at n=500, revisit after acts 2-3 |
| no zero-word grid | PASS |
| items move win rate | PASS (0% with `--items none`) |

## Immediate next step

1. `git checkout tune/greedy-cap`. Spawn the `adversarial-reviewer` agent
   (or brief its charter inline if the type does not resolve) for ONE round
   over `main..tune/greedy-cap`. Named attack surfaces: `pendingPicks` and
   `advance()` in `reducer.ts` (kit pick must not skip encounter 0 or
   double-advance), JSON round-trip of the new `RunState` field, the
   greedy cap's fallback, the `pre-act1` variant restoring exactly the old
   numbers, and every pasted sim cell (re-run `npx tsx scripts/sim.ts` and
   `--variant pre-act1`).
2. Fix round if needed, then `git checkout main && git merge --no-ff
   tune/greedy-cap`, push, delete the branch local + remote.
3. ROADMAP.md "Shipped" entry for the act-1 wave carrying the two pasted
   tables from the plan (baseline and cap-only are the `pre-act1` table's
   `solver` and `greedy` rows; cap + curve is the shipped-content table).
4. Start the act-2 + E9 wave: content only (`src/content/acts.ts`,
   `src/content/bosses.ts`), no gate, tests + lint + pasted sims. Targets
   in the plan's Handoff section. Do not touch act 1.

## Standing rules in force (Dean, 2026-09-06)

- Gate only for `src/engine` changes and `harness/enforcement`, one round
  per wave at the end. Content/scripts/docs ship on tests + lint + own
  review. Sim tables pasted, never typed. Full rules return at Phase 1.
- No file under `src/ui/`, no new `Effect` type, no run-structure change
  without Dean's explicit go. Phase 1 needs his explicit go.
- Attacks stay per word played. Items later, majority scoring modifiers.
- Stage explicit paths; branch -> merge --no-ff; no em dashes.

## Resume prompt (paste into a new session in this repo)

> Read CLAUDE.md, docs/exec-plans/active/HANDOFF.md and
> docs/exec-plans/active/phase-0-spike.md in full. Confirm the branch
> table in HANDOFF.md against `git log --oneline --all -15` and report any
> drift before doing anything. Then execute the "Immediate next step" in
> HANDOFF.md in order, under the standing rules listed there. Stop and ask
> me before merging harness/enforcement, before any change under
> src/engine beyond what tune/greedy-cap already contains, and before
> starting Phase 1. Report sim results as pasted tables.
