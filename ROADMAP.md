# Roadmap

The phases and their exit criteria are defined in
`docs/lexicell-architecture-pack.md` (Implementation Roadmap). This file
tracks what is planned and what shipped, honestly: what the gate caught
and what is still open ships disclosed here.

## Planned

### Phase 0 - Spike: is the loop fun? (ACTIVE, exec plan `docs/exec-plans/active/phase-0-spike.md`)

- [x] rng, dictionary, solver, scoring, effects, hooks, 10 items, 3 enemies + 1 boss, reducer, sim harness
- [ ] Exit criteria: mediocre 20-40%, greedy < 90%, no dead grids, items move win rate
- [ ] Decision from Dean on the structural finding (see exec plan)

### Phase 1 - Walking skeleton

Blocked on Phase 0 exit criteria and Dean's explicit go. No file under
`src/ui/` before then.

### Phase 2 - MVP

### Phase 3 - Iterations

## Open

- The enforcement layer of the harness (PreToolUse staging block,
  session-start hook, `.claude/settings.json`, pre-commit sim smoke,
  pre-push hook, the Node built-ins lint ban) sits on branch
  `harness/enforcement` awaiting Dean's own review. Dean's rule: the
  agent does not merge changes to its own constraints. Until it merges,
  CLAUDE.md and CONTRIBUTING describe hooks that are not yet installed.

## Shipped

Nothing tagged yet. Phase 0 engine work is on main through 9f63d34
(pre-gate; see tech-debt #1).
