#!/usr/bin/env bash
#
# the-office installer.
#
#   ./install.sh [target-repo] [--link] [--uninstall] [--force]
#
# Copies the payload into <target>/.claude/ and leaves a VERSION stamp so an
# upgrade can tell what it is replacing. Board state under .the-office/ is never
# touched by install or uninstall — it belongs to the repo, not to this tool.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(cat "$SRC/VERSION")"

TARGET=""
MODE="copy"
ACTION="install"
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --link)      MODE="link" ;;
    --uninstall) ACTION="uninstall" ;;
    --force)     FORCE=1 ;;
    -h|--help)
      sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *)  TARGET="$arg" ;;
  esac
done

TARGET="${TARGET:-$PWD}"
TARGET="$(cd "$TARGET" && pwd)"
CLAUDE="$TARGET/.claude"
OFFICE="$CLAUDE/office"

say()  { printf '\033[36m%s\033[0m %s\n' "$1" "$2"; }
warn() { printf '\033[33mwarn\033[0m %s\n' "$1"; }
die()  { printf '\033[31merror\033[0m %s\n' "$1" >&2; exit 1; }

[ "$TARGET" = "$SRC" ] && [ "$ACTION" = "install" ] && \
  die "refusing to install the-office into its own repo — pass a target, or use --link from the target."

# --------------------------------------------------------------- uninstall
if [ "$ACTION" = "uninstall" ]; then
  removed=0
  for d in agents skills commands; do
    [ -d "$CLAUDE/$d" ] || continue
    # Only ours. A user's own agents and skills live in the same directories.
    for f in "$CLAUDE/$d"/office*; do
      [ -e "$f" ] || continue
      rm -rf "$f"; removed=$((removed+1))
    done
  done
  [ -d "$OFFICE" ] && { rm -rf "$OFFICE"; removed=$((removed+1)); }
  say "uninstalled" "$removed item(s) from $CLAUDE"
  [ -d "$TARGET/.the-office" ] && \
    warn "kept .the-office/ — board state, harness manifest, and findings ledger are yours. Delete it by hand if you mean to."
  exit 0
fi

# ----------------------------------------------------------------- install
[ -d "$TARGET/.git" ] || warn "$TARGET is not a git repository — office done cannot record branch or commit."

PREV=""
[ -f "$OFFICE/VERSION" ] && PREV="$(cat "$OFFICE/VERSION")"
if [ -n "$PREV" ] && [ "$PREV" != "$VERSION" ]; then
  say "upgrading" "$PREV -> $VERSION"
elif [ -n "$PREV" ] && [ "$FORCE" -eq 0 ]; then
  say "reinstalling" "$VERSION (already at this version)"
fi

mkdir -p "$CLAUDE"/{agents,skills,commands} "$OFFICE/bin"

place() { # place <src> <dst>
  rm -rf "$2"
  if [ "$MODE" = "link" ]; then ln -s "$1" "$2"; else cp -R "$1" "$2"; fi
}

n=0
for f in "$SRC"/payload/agents/*.md; do
  place "$f" "$CLAUDE/agents/$(basename "$f")"; n=$((n+1))
done
for d in "$SRC"/payload/skills/*/; do
  place "${d%/}" "$CLAUDE/skills/$(basename "${d%/}")"; n=$((n+1))
done
for f in "$SRC"/payload/commands/*.md; do
  place "$f" "$CLAUDE/commands/$(basename "$f")"; n=$((n+1))
done

place "$SRC/payload/bin/office.mjs" "$OFFICE/bin/office.mjs"
chmod +x "$OFFICE/bin/office.mjs" 2>/dev/null || true
place "$SRC/packs"     "$OFFICE/packs"
place "$SRC/templates" "$OFFICE/templates"
echo "$VERSION" > "$OFFICE/VERSION"

# Convenience shim so humans can type `office` without remembering the path.
cat > "$OFFICE/bin/office" <<SHIM
#!/usr/bin/env bash
exec node "\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)/office.mjs" "\$@"
SHIM
chmod +x "$OFFICE/bin/office"

say "installed" "the-office $VERSION -> $CLAUDE ($MODE, $n items)"

if [ ! -d "$TARGET/.the-office" ]; then
  echo
  echo "  This repo has no board yet. Next:"
  echo "    /office-onboard      audit the harness and propose controls"
  echo "    /office <request>    run a request through the pipeline"
else
  echo
  node "$OFFICE/bin/office.mjs" validate 2>&1 | sed 's/^/  /' || \
    warn "existing board does not validate — see above before continuing."
fi
