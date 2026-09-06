#!/usr/bin/env bash
# SessionStart hook - injects repo context at the start of every conversation.
# Keep this fast (<500ms). No network calls. Ported from github.com/dtammam/filetube.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'detached')"
DIRTY="$(git status --short 2>/dev/null | wc -l | tr -d ' ' || echo '0')"

ACTIVE_DIR="$ROOT/docs/exec-plans/active"
PLANS=""
if [ -d "$ACTIVE_DIR" ]; then
  PLANS="$(find "$ACTIVE_DIR" -maxdepth 1 -name '*.md' -not -name 'README.md' -not -name '.*' -exec basename {} \; 2>/dev/null | sort)"
fi
PLAN_COUNT="$(echo "$PLANS" | grep -c . || true)"

# Open tech-debt rows: every table row whose last cell starts with OPEN.
DEBT_FILE="$ROOT/docs/exec-plans/tech-debt-tracker.md"
DEBT_COUNT=0
if [ -f "$DEBT_FILE" ]; then
  DEBT_COUNT="$(grep -E '^\| *[0-9]+ \|' "$DEBT_FILE" | grep -cE '\| *[*_]*OPEN[^|]*\| *$' || true)"
fi

# Phase gate: src/ui must stay empty until Phase 0 exit criteria are met (CLAUDE.md).
UI_FILES=0
if [ -d "$ROOT/src/ui" ]; then
  UI_FILES="$(find "$ROOT/src/ui" -type f 2>/dev/null | wc -l | tr -d ' ')"
fi

echo "=== Session Context ==="
echo "Branch: $BRANCH ($DIRTY uncommitted changes)"
echo "Active plans: $PLAN_COUNT"
if [ -n "$PLANS" ]; then
  echo "$PLANS" | sed 's/^/  - /'
fi
echo "Tech debt items open: $DEBT_COUNT"
echo "Phase gate: src/ui has $UI_FILES files (must be 0 until Phase 0 exit criteria are met and reported)"
echo "======================"
