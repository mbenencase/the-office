#!/usr/bin/env bash
#
# Propagate a version across every place that records one, then tag it.
#
#   scripts/bump.sh patch|minor|major|X.Y.Z [--no-tag] [--dry-run]
#
# VERSION is the source of truth. This script is what keeps package.json and the
# VERSION constant in office.mjs from drifting away from it — tests/run.sh fails
# the build if they ever do, so this is the only supported way to change it.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUMP="${1:-}"
DRY=0
TAG=1
for a in "${@:2}"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --no-tag)  TAG=0 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

die() { printf '\033[31merror\033[0m %s\n' "$1" >&2; exit 1; }
say() { printf '\033[36m%s\033[0m %s\n' "$1" "$2"; }

[ -n "$BUMP" ] || die "usage: scripts/bump.sh patch|minor|major|X.Y.Z [--no-tag] [--dry-run]"

CURRENT="$(cat VERSION)"
IFS=. read -r MA MI PA <<< "$CURRENT"

case "$BUMP" in
  major) NEW="$((MA+1)).0.0" ;;
  minor) NEW="$MA.$((MI+1)).0" ;;
  patch) NEW="$MA.$MI.$((PA+1))" ;;
  [0-9]*.[0-9]*.[0-9]*) NEW="$BUMP" ;;
  *) die "not a bump keyword or a semver: $BUMP" ;;
esac

[ "$NEW" != "$CURRENT" ] || die "already at $NEW"

# An Unreleased section with nothing under it means the release notes would be
# empty. Catch it here rather than after the tag is pushed.
if ! awk '/^## \[Unreleased\]/{f=1;next} /^## /{f=0} f && NF && !/^###/ {found=1} END{exit !found}' CHANGELOG.md; then
  die "CHANGELOG.md has no content under [Unreleased] — write the notes before bumping."
fi

if [ "$DRY" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
  die "working tree is dirty — commit or stash first."
fi

DATE="$(date +%Y-%m-%d)"
say "bumping" "$CURRENT -> $NEW ($DATE)"

if [ "$DRY" -eq 1 ]; then
  echo "  would write: VERSION, package.json, payload/bin/office.mjs, CHANGELOG.md"
  [ "$TAG" -eq 1 ] && echo "  would commit and tag v$NEW"
  exit 0
fi

echo "$NEW" > VERSION
# Deliberately narrow patterns: a broad s/$CURRENT/$NEW/ would rewrite version
# strings inside changelog prose and pack configs too.
sed -i "s/^  \"version\": \".*\",$/  \"version\": \"$NEW\",/" package.json
sed -i "s/^const VERSION = '.*';$/const VERSION = '$NEW';/" payload/bin/office.mjs

python3 - "$NEW" "$DATE" <<'PY'
import re, sys, pathlib
new, date = sys.argv[1], sys.argv[2]
p = pathlib.Path('CHANGELOG.md'); s = p.read_text()

# Move everything under [Unreleased] into a dated release section, and leave a
# fresh empty Unreleased behind.
s = s.replace('## [Unreleased]\n', f'## [Unreleased]\n\n## [{new}] — {date}\n', 1)

# Refresh the link refs at the foot of the file.
s = re.sub(r'^\[Unreleased\]: .*$',
           f'[Unreleased]: https://github.com/mbenencase/the-office/compare/v{new}...HEAD',
           s, count=1, flags=re.M)
s = re.sub(r'^(\[Unreleased\]: .*\n)',
           rf'\1[{new}]: https://github.com/mbenencase/the-office/releases/tag/v{new}\n',
           s, count=1, flags=re.M)
p.write_text(s)
PY

say "verifying" "the sensor suite must pass before this is tagged"
bash tests/run.sh >/dev/null || die "tests failed — not tagging a broken release."

if [ "$TAG" -eq 1 ]; then
  git add VERSION package.json payload/bin/office.mjs CHANGELOG.md
  git commit -qm "Release v$NEW"
  git tag -a "v$NEW" -m "v$NEW"
  say "tagged" "v$NEW"
  echo
  echo "  git push && git push origin v$NEW"
  echo "  (the release workflow publishes from the tag)"
else
  say "written" "$NEW — not committed or tagged"
fi
