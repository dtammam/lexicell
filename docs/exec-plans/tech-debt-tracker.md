# Tech Debt Tracker

Accepted residuals, each with a revisit trigger. A row is OPEN or CLOSED
in its last cell; the session-start hook counts OPEN rows. Numbers are
never reused.

| # | Description | Severity | Added | Source | Revisit trigger | Status |
|---|-------------|----------|-------|--------|-----------------|--------|
| 1 | Phase 0 commits (through 9f63d34) landed directly on main with `git add -A` staging and no reviewer gate; the harness that forbids both arrived after them. The Phase 0 gate (exec plan `phase-0-spike.md`) reviews that whole range retroactively. | Medium | 2026-09-06 | harness adoption | Closes when the Phase 0 gate APPROVEs the range or files its findings as rows here | OPEN |
| 2 | The staging-block hook (`.claude/hooks/block-git-add-all.sh` on `harness/enforcement`) is a text scanner, not a shell, and Dean froze further hardening on 2026-09-06. Measured gaps at 7f0dba3 (adversarial rounds 1-3, 250+ payloads): a `git add` nested inside `$(...)` or backticks; `${PWD}`/`${HOME}` forms (the brace splitter cuts them); a trailing slash on `$PWD`; `src/..` parent traversal; `--u`/`--up` abbreviations; `xargs -I{} git add {}`; a blanket argument hidden in a shell variable or built by eval/printf/`${IFS}`; interpreter wrappers; git aliases; a literal absolute toplevel path. The hook is a backstop; the discipline is the session's. | Low | 2026-09-06 | harness gate rounds 1-3 | If a blind stage ever lands in a commit again, or at Phase 1 when the gate rules return | OPEN |
