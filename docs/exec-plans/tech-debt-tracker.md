# Tech Debt Tracker

Accepted residuals, each with a revisit trigger. A row is OPEN or CLOSED
in its last cell; the session-start hook counts OPEN rows. Numbers are
never reused.

| # | Description | Severity | Added | Source | Revisit trigger | Status |
|---|-------------|----------|-------|--------|-----------------|--------|
| 1 | Phase 0 commits (through 9f63d34) landed directly on main with `git add -A` staging and no reviewer gate; the harness that forbids both arrived after them. The Phase 0 gate (exec plan `phase-0-spike.md`) reviews that whole range retroactively. | Medium | 2026-09-06 | harness adoption | Closes when the Phase 0 gate APPROVEs the range or files its findings as rows here | OPEN |
| 2 | The staging-block hook (branch `harness/enforcement`) is a text scanner, not a shell. Measured residuals after two fuzz rounds (192 payloads): a blanket argument hidden in a shell variable or built by eval/printf/`${IFS}`; interpreter wrappers (`python3 -c "os.system('git add -A')"`, `node -e`, busybox); a git alias (`git config alias.a 'add -A'`); a literal absolute path equal to the repository toplevel. Command substitution, `--a`/`--al` abbreviations, `:(top)`, `**`, `--pathspec-from-file`, and `xargs`/`find -exec` feeds are refused. | Low | 2026-09-06 | harness gate rounds 1-2 (adversarial WARNING) | If a blind stage ever lands in a commit again | OPEN |
