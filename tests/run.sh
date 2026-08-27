#!/usr/bin/env bash
# the-office self-test. This is the-office's own sensor: it is the thing that
# lets the Office Manager onboard this repo without circular reasoning.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OFFICE="node $ROOT/payload/bin/office.mjs"
PASS=0; FAIL=0
export NO_COLOR=1

ok()   { PASS=$((PASS+1)); printf '  \033[32mpass\033[0m  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; }

# expect_exit <code> <desc> <dir> <args...>
expect_exit() {
  local want=$1 desc=$2 dir=$3; shift 3
  local out; out=$(cd "$dir" && $OFFICE "$@" 2>&1); local got=$?
  if [ "$got" -eq "$want" ]; then ok "$desc"; else bad "$desc" "exit $got, wanted $want: $(echo "$out" | head -3 | tr '\n' ' ')"; fi
}

# expect_match <pattern> <desc> <dir> <args...>
expect_match() {
  local pat=$1 desc=$2 dir=$3; shift 3
  local out; out=$(cd "$dir" && $OFFICE "$@" 2>&1)
  if echo "$out" | grep -qi -- "$pat"; then ok "$desc"; else bad "$desc" "no match for '$pat' in: $(echo "$out" | head -3 | tr '\n' ' ')"; fi
}

echo
echo "validate — the board's own sensor"
expect_exit 0 "accepts a well-formed board"                "$ROOT/tests/fixtures/good"       validate
expect_exit 1 "rejects a dependency cycle"                 "$ROOT/tests/fixtures/cycle"      validate
expect_exit 1 "rejects a duplicate id"                     "$ROOT/tests/fixtures/dup-id"     validate
expect_exit 1 "rejects a task with no executable DoD"      "$ROOT/tests/fixtures/no-checks"  validate
expect_exit 1 "rejects an orphan dependency"               "$ROOT/tests/fixtures/orphan-dep" validate
expect_match "cycle"        "names the cycle"              "$ROOT/tests/fixtures/cycle"      validate
expect_match "duplicate"    "names the duplicate"          "$ROOT/tests/fixtures/dup-id"     validate
expect_match "not executable" "explains the empty checks"  "$ROOT/tests/fixtures/no-checks"  validate

echo
echo "next — dependency ordering"
expect_match "sample/task-01" "picks the only unblocked task" "$ROOT/tests/fixtures/good" next

echo
echo "check — executable definition of done"
expect_exit 0 "passes when every check exits 0"  "$ROOT/tests/fixtures/good" check sample/task-01
expect_exit 1 "refuses a task with no checks"    "$ROOT/tests/fixtures/no-checks" check sample/task-01

echo
echo "lifecycle — state transitions"
WORK=$(mktemp -d); cp -r "$ROOT/tests/fixtures/good/.the-office" "$WORK/"
expect_exit 0 "claim pending -> in-progress"     "$WORK" claim sample/task-01
expect_exit 1 "refuses to claim twice"           "$WORK" claim sample/task-01
expect_exit 0 "review in-progress -> review"     "$WORK" review sample/task-01
expect_exit 0 "done review -> completed"         "$WORK" done sample/task-01
if grep -q '^attempts: 1$' "$WORK/.the-office/features/sample/task-01.md"; then ok "increments attempts"; else bad "increments attempts"; fi
if grep -q '^status: completed$' "$WORK/.the-office/features/sample/task-01.md"; then ok "persists status"; else bad "persists status"; fi
if grep -q '^## Notes$' "$WORK/.the-office/features/sample/task-01.md"; then ok "preserves the body across rewrites"; else bad "preserves the body across rewrites"; fi
expect_match "sample/task-02" "next advances once the dep completes" "$WORK" next
expect_exit 1 "block requires a reason"          "$WORK" block sample/task-02
expect_exit 0 "block with a reason escalates"    "$WORK" block sample/task-02 --reason "needs a human"
if grep -q 'blocked:' "$WORK/.the-office/features/sample/task-02.md"; then ok "writes the reason into Notes"; else bad "writes the reason into Notes"; fi
rm -rf "$WORK"

echo
echo "scope — allowlist enforcement"
WORK=$(mktemp -d); cd "$WORK" && git init -q . && cd - >/dev/null
cp -r "$ROOT/tests/fixtures/good/.the-office" "$WORK/"
mkdir -p "$WORK/src" "$WORK/.claude/agents" "$WORK/other"
echo "ok" > "$WORK/src/a.txt"
echo "payload" > "$WORK/.claude/agents/office-swe.md"
python3 - "$WORK" <<'PYEOF'
import sys, pathlib
p = pathlib.Path(sys.argv[1], '.the-office/features/sample/task-01.md')
p.write_text(p.read_text().replace('scope:\n  - src/**', 'scope:\n  - src/**'))
PYEOF
expect_exit 0 "passes when changes are inside scope" "$WORK" scope sample/task-01
echo "stray" > "$WORK/other/b.txt"
expect_exit 1 "fails when a change escapes scope"    "$WORK" scope sample/task-01
expect_match "other/b.txt" "names the offending file" "$WORK" scope sample/task-01
if (cd "$WORK" && $OFFICE scope sample/task-01 2>&1) | grep -q 'src/a.txt'; then
  bad "does not flag in-scope files" "src/a.txt was listed as out of scope"
else ok "does not flag in-scope files"; fi
if (cd "$WORK" && $OFFICE scope sample/task-01 2>&1) | grep -q '\.claude/'; then
  bad "ignores the installed harness payload" ".claude/ was counted as task work"
else ok "ignores the installed harness payload"; fi
rm -rf "$WORK"

echo
echo "findings — the steering loop's input"
WORK=$(mktemp -d); mkdir -p "$WORK/.the-office/features"; : > "$WORK/.the-office/findings.jsonl"
(cd "$WORK" && $OFFICE findings add --class unclosed-session --task t1 --lens maintainability >/dev/null 2>&1)
(cd "$WORK" && $OFFICE findings add --class unclosed-session --task t2 --lens maintainability >/dev/null 2>&1)
expect_exit 1 "no recurrence below the threshold"   "$WORK" findings recur
(cd "$WORK" && $OFFICE findings add --class unclosed-session --task t3 --lens maintainability >/dev/null 2>&1)
expect_exit 0 "detects recurrence at the threshold" "$WORK" findings recur
expect_match "unclosed-session" "names the recurring class" "$WORK" findings recur
rm -rf "$WORK"

echo
echo "audit — computational harness assessment"
expect_exit 0 "audits a repo with no harness"  "$ROOT/tests/fixtures/good" audit --json
expect_match "harnessability" "reports a score" "$ROOT/tests/fixtures/good" audit --json
expect_match "\"class\"" "classifies greenfield vs legacy" "$ROOT/tests/fixtures/good" audit --json

echo
echo "payload integrity — this repo's own sensors"
if node --check "$ROOT/payload/bin/office.mjs" 2>/dev/null; then ok "office.mjs parses"; else bad "office.mjs parses"; fi

for f in "$ROOT"/packs/*/pack.json; do
  if node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null; then
    ok "$(basename "$(dirname "$f")")/pack.json is valid JSON"
  else bad "$(basename "$(dirname "$f")")/pack.json is valid JSON"; fi
done

# Every control a pack declares must name files that exist, or declare none.
missing=""
for f in "$ROOT"/packs/*/pack.json; do
  d=$(dirname "$f")
  for want in $(node -e "
    const p=JSON.parse(require('fs').readFileSync('$f','utf8'));
    for(const c of p.controls) for(const x of (c.files||[])) console.log(x);
  "); do
    [ -e "$d/$want" ] || missing="$missing $(basename "$d")/$want"
  done
done
if [ -z "$missing" ]; then ok "every pack control's files exist"; else bad "every pack control's files exist" "missing:$missing"; fi

# Agents and skills are useless to Claude Code without frontmatter.
badfm=""
for f in "$ROOT"/payload/agents/*.md; do
  head -1 "$f" | grep -q '^---$' || badfm="$badfm $(basename "$f")"
  grep -q '^name: ' "$f" || badfm="$badfm $(basename "$f"):name"
  grep -q '^description: ' "$f" || badfm="$badfm $(basename "$f"):description"
done
for f in "$ROOT"/payload/skills/*/SKILL.md; do
  head -1 "$f" | grep -q '^---$' || badfm="$badfm $(basename "$(dirname "$f")")"
  grep -q '^description: ' "$f" || badfm="$badfm $(basename "$(dirname "$f")")):description"
done
if [ -z "$badfm" ]; then ok "every agent and skill has frontmatter"; else bad "every agent and skill has frontmatter" "$badfm"; fi

# An agent whose model is not a known alias silently falls back.
badmodel=$(grep -h '^model: ' "$ROOT"/payload/agents/*.md | sort -u | grep -vE '^model: (haiku|sonnet|opus|inherit)$' || true)
if [ -z "$badmodel" ]; then ok "every agent declares a known model alias"; else bad "every agent declares a known model alias" "$badmodel"; fi

# The tier -> agent mapping in the office skill must resolve to real agents.
for t in office-swe-fast office-swe office-swe-deep; do
  [ -f "$ROOT/payload/agents/$t.md" ] || bad "tier variant $t exists"
done
ok "all three SWE tier variants exist"

echo
echo "ci — workflow integrity"
for f in "$ROOT"/.github/workflows/*.yml; do
  if python3 -c "import yaml,sys; yaml.safe_load(open('$f'))" 2>/dev/null; then
    ok "$(basename "$f") is valid YAML"
  else bad "$(basename "$f") is valid YAML"; fi
done

# shellcheck is not always installed locally; bash -n catches syntax errors
# either way, and CI runs the full shellcheck pass.
for f in "$ROOT/install.sh" "$ROOT/tests/run.sh" "$ROOT/scripts/bump.sh" "$ROOT/.githooks/pre-commit"; do
  if bash -n "$f" 2>/dev/null; then ok "$(basename "$f") parses"; else bad "$(basename "$f") parses"; fi
done
if command -v shellcheck >/dev/null 2>&1; then
  if shellcheck -S warning "$ROOT/install.sh" "$ROOT/scripts/bump.sh" "$ROOT/.githooks/pre-commit" >/dev/null 2>&1; then
    ok "shellcheck clean"
  else bad "shellcheck clean" "run: shellcheck -S warning install.sh scripts/bump.sh .githooks/pre-commit"; fi
else
  ok "shellcheck skipped (not installed; CI runs it)"
fi

# The release workflow extracts notes by awk. If that yields nothing, the tag
# publishes an empty release — which is only discovered after it is pushed.
NOTES="$(awk -v v="$(cat "$ROOT/VERSION")" '
  $0 ~ "^## \\["v"\\]" {f=1; next}
  f && /^## / {exit}
  f {print}
' "$ROOT/CHANGELOG.md" | grep -c . || true)"
if [ "$NOTES" -gt 0 ]; then ok "release notes extract for the current VERSION ($NOTES lines)"
else bad "release notes extract for the current VERSION" "the awk in release.yml would publish an empty release"; fi
echo
echo "versioning — one source of truth, three consumers"
V="$(cat "$ROOT/VERSION")"
CLI="$(grep -oP "const VERSION = '\K[^']+" "$ROOT/payload/bin/office.mjs")"
PKG="$(node -e "console.log(require('$ROOT/package.json').version)")"

if [ "$V" = "$CLI" ]; then ok "VERSION matches the CLI constant"
else bad "VERSION matches the CLI constant" "VERSION=$V office.mjs=$CLI — run scripts/bump.sh"; fi

if [ "$V" = "$PKG" ]; then ok "VERSION matches package.json"
else bad "VERSION matches package.json" "VERSION=$V package.json=$PKG — run scripts/bump.sh"; fi

if echo "$V" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then ok "VERSION is semver"
else bad "VERSION is semver" "got '$V'"; fi

if grep -qE "^## \[$V\]" "$ROOT/CHANGELOG.md"; then ok "CHANGELOG has a section for $V"
else bad "CHANGELOG has a section for $V" "a release with no notes cannot produce release notes"; fi

if grep -q '^## \[Unreleased\]' "$ROOT/CHANGELOG.md"; then ok "CHANGELOG has an Unreleased section"
else bad "CHANGELOG has an Unreleased section" "bump.sh needs it to cut a release"; fi

echo
printf '\n%s passed, %s failed\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
