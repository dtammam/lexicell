# Contributing

Coding standards and conventions for Lexicell. All agents read this file.
The architecture contract is `docs/lexicell-architecture-pack.md`; this
file is the mechanics.

## Language & framework

- **Language:** TypeScript, strict, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`. ES modules.
- **Runtime:** Node 24 (pinned in `.nvmrc` and `package.json` engines)
  for tests and the sim. The browser target arrives
  with Phase 1 (Vite + Svelte 5); nothing under `src/engine` or
  `src/content` may depend on either environment.
- **Package manager:** npm. `npm install` runs `prepare`, which points
  `core.hooksPath` at `.githooks/`.

## Commands

| Action | Command |
|--------|---------|
| Install | `npm install` |
| Lint + typecheck | `npm run lint` |
| Test | `npm test` (`npm run test:watch` for the loop) |
| Sim | `npm run sim -- [--runs N] [--bot greedy\|mediocre] [--items none\|a,b] [--seed S] [--json]` |
| Rebuild dictionary | `npm run dict:build` |

## Layout

| Path | Owns |
|------|------|
| `src/engine/` | Pure rules. Reducer, RNG, solver, scoring, hooks, effects, grid, candidates. No framework, no DOM, no Node built-ins. |
| `src/content/` | Data only: items, enemies, bosses, acts (the encounter curve and tuning), the word list. |
| `src/ui/` | Svelte 5 components. EMPTY until Phase 0 exit criteria are met and reported. |
| `scripts/` | Node-side tooling: the sim, the dictionary build, Node loaders. May import the engine; the engine never imports it. |
| `docs/` | The architecture pack, this file, exec plans, the tech-debt tracker. |

## Code style

- 2-space indent, semicolons, single quotes, trailing commas. No
  formatter is configured; match the surrounding file.
- `camelCase` for values and functions, `PascalCase` for types,
  `SCREAMING_SNAKE_CASE` for module-level constants.
- Every engine function that draws randomness takes an `Rng` and returns
  `[value, nextRng]`. Never reuse an `Rng` for two draws.
- State types are `readonly` all the way down. Build new objects with
  spread; never assign into an existing state object.
- Comment the WHY. A comment that restates the code is noise; a comment
  that explains a non-obvious decision (why mulberry32, why flat lands
  after the length bonus) is load-bearing. Keep numbers in comments
  true: a stale number is a finding in review.
- Content records carry a `description` a player could read.

### No em dashes, anywhere

No em dashes in any new text: code, comments, docs, commit messages, UI
copy. Use a spaced hyphen (` - `) or restructure the sentence. A line
you edit loses its em dashes as part of the edit.

## Testing

- Framework: vitest. Tests sit beside the module: `foo.ts` and
  `foo.test.ts`. Test files may read fixtures from disk via
  `scripts/lib/`; non-test engine code may not.
- **Every engine module ships with tests in the same commit.**
- A test binds behaviour, not presence. If deleting the guard the test
  is about leaves the test green, the test is wrong.
- Full-run tests assert invariants on EVERY state: HP in range, live
  grid, JSON round-trip equality. Add to `assertInvariants` in
  `reducer.test.ts` rather than writing a one-off.
- Sim numbers quoted anywhere (commit, exec plan, ROADMAP) are measured
  with the command that produced them written next to them.

## Git conventions

- Branches: `feat/<name>`, `fix/<name>`, `harness/<name>`,
  `tune/<name>`. Every change, including docs, goes branch -> gate ->
  `git merge --no-ff` into main. No direct-to-main commits.
- Commit messages describe the DECISION, not the diff: why this shape,
  what was rejected, what was measured. Imperative summary line under
  72 characters, then prose.
- Trailers on every commit:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: <url>`.
- Stage explicit paths. Blanket staging (`git add -A`, `.`, `-u`, `*`,
  `:/`, `git commit -a` and their spellings through prefixes, global
  options, continuations and `sh -c`) is blocked by a PreToolUse hook;
  its known blind spot is a variable-hidden argument (tracker #2). Run
  `git status --porcelain` and confirm the branch before every commit.
- Never `--no-verify`. Never force-push. Never `git checkout --` a
  dirty tree blind.
- `.githooks/pre-commit` runs lint, typecheck, the test suite, and a
  short sim smoke. `.githooks/pre-push` runs the same with a longer sim.

## Definition of done

- [ ] `npm run lint` clean
- [ ] `npm test` green, new behaviour covered, sim still runs
- [ ] Engine contract intact (see CLAUDE.md non-negotiables)
- [ ] Two-reviewer gate APPROVE x2 (slim gate for docs/hotfixes)
- [ ] Exec plan updated; residuals filed in the tech-debt tracker
- [ ] No TODO/FIXME without a tracker row
