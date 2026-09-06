# Tech Debt Tracker

Accepted residuals, each with a revisit trigger. A row is OPEN or CLOSED
in its last cell; the session-start hook counts OPEN rows. Numbers are
never reused.

| # | Description | Severity | Added | Source | Revisit trigger | Status |
|---|-------------|----------|-------|--------|-----------------|--------|
| 1 | Phase 0 commits (through 9f63d34) landed directly on main with `git add -A` staging and no reviewer gate; the harness that forbids both arrived after them. The Phase 0 gate (exec plan `phase-0-spike.md`) reviews that whole range retroactively. | Medium | 2026-09-06 | harness adoption | Closes when the Phase 0 gate APPROVEs the range or files its findings as rows here | OPEN |
| 2 | The staging-block hook cannot see a blanket argument hidden in a shell variable (`X=-A; git add $X`) or built by eval/printf. Everything the first adversarial gate fuzzed (130 payloads: global options, prefixes, continuations, backticks, clusters, `./*`, `:/`, `$PWD`, `sh -c`) now blocks. | Low | 2026-09-06 | harness gate round 1 (adversarial WARNING) | If a blind stage ever lands in a commit again | OPEN |
