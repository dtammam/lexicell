#!/usr/bin/env bash
# PreToolUse(Bash) hook - hard-blocks blind git staging.
#
# The standing norm in CLAUDE.md is "stage EXPLICIT paths only". On FileTube a
# `git add -A` once swept scratch files into a release commit, and the first
# session on this repo used it on every commit. This enforces the norm
# mechanically so it cannot lapse under time pressure. Exit 2 => the Bash call
# is refused and the message is fed back to the agent; exit 0 => allowed.
#
# Mechanism (ported from github.com/dtammam/filetube, then hardened after this
# repo's first adversarial gate fuzzed 130 payloads through it):
#   1. Drop heredoc BODIES (data, not commands) so a commit message may
#      document this rule. The opener scan is quote-aware.
#   2. Join backslash-newline continuations, then split into statement
#      segments on ; & | && || newline ( ) { } and backticks.
#   3. Per segment: strip command prefixes (env, sudo, time, then, do, !,
#      VAR=val ...) and git global options (-C dir, -c k=v, --git-dir=...),
#      then shlex the rest so quoted arguments are real tokens.
#   4. `git add|stage` with any blanket argument (-A, --all and its
#      abbreviations --a/--al, -u, --update, a cluster containing A or u,
#      ., ./, ./*, *, **, :/, :(top), $PWD, $HOME..., $(...), --renormalize,
#      --pathspec-from-file) and `git commit` with an auto-stage cluster
#      (-a, -am, --all) are refused. `sh -c "..."` strings are scanned
#      recursively; a `git add` fed by xargs or find -exec is refused.
# Known evasions, accepted and listed in the tech-debt tracker: a blanket
# argument hidden in a shell variable or built by eval/printf/${IFS}; an
# interpreter wrapper (python -c, node -e, busybox); a git alias; an
# absolute path equal to the repository toplevel (~+, $(pwd) is caught,
# a literal /home/... path is not).
#
# The payload arrives on stdin as {"tool_name":"Bash","tool_input":{"command":"..."}}.

set -euo pipefail

payload="$(cat)"

exec python3 - "$payload" <<'PY'
import sys, json, re, shlex

try:
    cmd = (json.loads(sys.argv[1]).get("tool_input") or {}).get("command", "") or ""
except Exception:
    sys.exit(0)  # unparseable payload -> don't block

def heredoc_opener(line):
    q, i, n = None, 0, len(line)
    while i < n:
        c = line[i]
        if q:
            if c == q:
                q = None
            i += 1
            continue
        if c in "'\"":
            q = c; i += 1; continue
        if c == "<" and i + 1 < n and line[i + 1] == "<":
            j = i + 2
            if line[j:j + 1] == "<":
                i += 3
                continue
            dedent = line[j:j + 1] == "-"
            if dedent:
                j += 1
            while line[j:j + 1] in (" ", "\t"):
                j += 1
            if line[j:j + 1] in ("'", '"'):
                j += 1
            m = re.match(r"\w+", line[j:])
            if m:
                return m.group(0), dedent
        i += 1
    return None, False

def strip_heredocs(text):
    lines = text.split("\n")
    kept, i = [], 0
    while i < len(lines):
        line = lines[i]
        kept.append(line)
        delim, dedent = heredoc_opener(line)
        if delim is not None:
            i += 1
            while i < len(lines):
                probe = lines[i].lstrip("\t") if dedent else lines[i]
                if probe.strip() == delim:
                    break
                i += 1
        i += 1
    return "\n".join(kept)

PREFIX = re.compile(r"^(?:(?:env|command|exec|time|nice|sudo|then|do|else|if|elif|while|until|!)\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+")
BLANKET = {"-A", "--all", "--al", "--a", "-u", "--update", "--renormalize", ".", "./", "./*", "*", "**", ":/", ":(top)", "$PWD", "${PWD}", "~+"}
BLANKET_PREFIX = ("$(", "$HOME", "${HOME}", "--pathspec-from-file", ":(top", "--all=", "--update=", "__CMDSUBST__", "__PATHSPEC_MAGIC__")
GIT_GLOBAL_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}

def refuse(msg):
    sys.stderr.write("BLOCKED: " + msg + " (CLAUDE.md git hygiene norm).\n")
    sys.stderr.write("Stage explicit paths, e.g. 'git add src/engine/reducer.ts src/engine/reducer.test.ts'.\n")
    sys.exit(2)

def check_segment(seg):
    seg = PREFIX.sub("", seg.strip())
    try:
        toks = shlex.split(seg)
    except ValueError:
        toks = seg.split()
    if not toks:
        return
    if toks[0].rsplit("/", 1)[-1] in ("sh", "bash", "zsh", "dash"):
        for t in toks[1:]:
            if "git" in t:
                scan(t)
        return
    if toks[0] in ("xargs", "find") and "git" in toks:
        g = toks.index("git")
        if g + 1 < len(toks) and toks[g + 1] in ("add", "stage"):
            refuse("'git add' fed by " + toks[0] + " stages whatever the pipeline finds")
    if toks[0].rsplit("/", 1)[-1] != "git":
        return
    i = 1
    while i < len(toks):
        t = toks[i]
        if t in GIT_GLOBAL_WITH_ARG:
            i += 2; continue
        if t.startswith("-"):
            i += 1; continue
        break
    if i >= len(toks):
        return
    sub, args = toks[i], toks[i + 1:]
    if sub in ("add", "stage"):
        for a in args:
            if a in BLANKET or a.startswith(BLANKET_PREFIX) or "__CMDSUBST__" in a or re.fullmatch(r"-[A-Za-z]*[Au][A-Za-z]*", a) or a.endswith("/.") or a.endswith("/*") or a.endswith("/**"):
                refuse("'git add' with a blanket argument (" + a + ") is forbidden")
    elif sub == "commit":
        for a in args:
            if a == "--all" or re.fullmatch(r"-[A-Za-z]*a[A-Za-z]*", a):
                refuse("'git commit' with an auto-stage flag (" + a + ") is forbidden")

def scan(text):
    text = strip_heredocs(text).replace("\\\n", " ")
    # Command substitution and pathspec magic carry parentheses that the
    # segment splitter would otherwise cut through; collapse them to marker
    # tokens first. Both are blanket arguments to `git add` by construction.
    text = re.sub(r"\$\([^)]*\)", "__CMDSUBST__", text)
    text = re.sub(r":\([^)]*\)[^\s'\"]*", "__PATHSPEC_MAGIC__", text)
    for seg in re.split(r"\|\||&&|[\n;&|(){}`]", text):
        if seg.strip():
            check_segment(seg)

scan(cmd)
sys.exit(0)
PY
