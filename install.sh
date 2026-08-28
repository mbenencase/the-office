#!/usr/bin/env bash
#
# the-office installer.
#
#   ./install.sh [target-repo] [--link] [--uninstall] [--force] [--runtime claude|cursor|both]
#
# Copies the payload into <target>/.claude/ and/or .cursor/ and leaves a VERSION
# stamp so an upgrade can tell what it is replacing. Board state under
# .the-office/ is never touched by install or uninstall — it belongs to the
# repo, not to this tool.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(cat "$SRC/VERSION")"
TRANSFORM="node $SRC/scripts/runtime-transform.mjs"

say()  { printf '\033[36m%s\033[0m %s\n' "$1" "$2"; }
warn() { printf '\033[33mwarn\033[0m %s\n' "$1"; }
die()  { printf '\033[31merror\033[0m %s\n' "$1" >&2; exit 1; }

TARGET=""
MODE="copy"
ACTION="install"
FORCE=0
RUNTIME="claude"

while [ $# -gt 0 ]; do
  case "$1" in
    --link)      MODE="link"; shift ;;
    --uninstall) ACTION="uninstall"; shift ;;
    --force)     FORCE=1; shift ;;
    --runtime)
      shift
      [ $# -gt 0 ] || die "--runtime requires a value (claude, cursor, or both)"
      RUNTIME="$1"; shift
      ;;
    --runtime=*) RUNTIME="${1#--runtime=}"; shift ;;
    -h|--help)
      sed -n '3,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown flag: $1" ;;
    *)
      [ -z "$TARGET" ] || die "unexpected extra argument: $1"
      TARGET="$1"; shift
      ;;
  esac
done

TARGET="${TARGET:-$PWD}"
TARGET="$(cd "$TARGET" && pwd)"
CLAUDE="$TARGET/.claude"
CURSOR="$TARGET/.cursor"

case "$RUNTIME" in
  claude|cursor|both) ;;
  *) die "unknown --runtime: $RUNTIME (expected claude, cursor, or both)" ;;
esac

[ "$TARGET" = "$SRC" ] && [ "$ACTION" = "install" ] && \
  die "refusing to install the-office into its own repo — pass a target, or use --link from the target."

uninstall_runtime() { # uninstall_runtime <dir>
  local root="$1" removed=0
  local office="$root/office"
  for d in agents skills commands; do
    [ -d "$root/$d" ] || continue
    for f in "$root/$d"/office*; do
      [ -e "$f" ] || continue
      rm -rf "$f"; removed=$((removed+1))
    done
  done
  [ -d "$office" ] && { rm -rf "$office"; removed=$((removed+1)); }
  echo "$removed"
}

# --------------------------------------------------------------- uninstall
if [ "$ACTION" = "uninstall" ]; then
  removed=0
  for rt in claude cursor; do
    root="$TARGET/.$rt"
    [ -d "$root" ] || continue
    n=$(uninstall_runtime "$root")
    removed=$((removed + n))
    [ "$n" -gt 0 ] && say "uninstalled" "$n item(s) from $root"
  done
  [ "$removed" -eq 0 ] && warn "nothing to uninstall — no the-office payload found"
  [ -d "$TARGET/.the-office" ] && \
    warn "kept .the-office/ — board state, harness manifest, and findings ledger are yours. Delete it by hand if you mean to."
  exit 0
fi

place() { # place <src> <dst>
  rm -rf "$2"
  if [ "$MODE" = "link" ]; then ln -s "$1" "$2"; else cp -R "$1" "$2"; fi
}

place_file() { # place_file <src> <dst>
  mkdir -p "$(dirname "$2")"
  rm -f "$2"
  if [ "$MODE" = "link" ]; then ln -s "$1" "$2"; else cp "$1" "$2"; fi
}

install_office_tree() { # install_office_tree <runtime-dir>
  local office="$1/office"
  mkdir -p "$office/bin"
  place "$SRC/payload/bin/office.mjs" "$office/bin/office.mjs"
  chmod +x "$office/bin/office.mjs" 2>/dev/null || true
  place "$SRC/packs"     "$office/packs"
  place "$SRC/templates" "$office/templates"
  echo "$VERSION" > "$office/VERSION"
  cat > "$office/bin/office" <<SHIM
#!/usr/bin/env bash
exec node "\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)/office.mjs" "\$@"
SHIM
  chmod +x "$office/bin/office"
}

install_claude() {
  local n=0 office="$CLAUDE/office"
  mkdir -p "$CLAUDE"/{agents,skills,commands}

  PREV=""
  [ -f "$office/VERSION" ] && PREV="$(cat "$office/VERSION")"
  if [ -n "$PREV" ] && [ "$PREV" != "$VERSION" ]; then
    say "upgrading" "$PREV -> $VERSION (claude)"
  elif [ -n "$PREV" ] && [ "$FORCE" -eq 0 ]; then
    say "reinstalling" "$VERSION (claude, already at this version)"
  fi

  for f in "$SRC"/payload/agents/*.md; do
    place "$f" "$CLAUDE/agents/$(basename "$f")"; n=$((n+1))
  done
  for d in "$SRC"/payload/skills/*/; do
    place "${d%/}" "$CLAUDE/skills/$(basename "${d%/}")"; n=$((n+1))
  done
  for f in "$SRC"/payload/commands/*.md; do
    place "$f" "$CLAUDE/commands/$(basename "$f")"; n=$((n+1))
  done
  install_office_tree "$CLAUDE"
  say "installed" "the-office $VERSION -> $CLAUDE ($MODE, $n items)"
}

install_cursor() {
  local n=0 office="$CURSOR/office" tmp
  mkdir -p "$CURSOR"/{agents,skills}
  tmp="$(mktemp -d)"

  PREV=""
  [ -f "$office/VERSION" ] && PREV="$(cat "$office/VERSION")"
  if [ -n "$PREV" ] && [ "$PREV" != "$VERSION" ]; then
    say "upgrading" "$PREV -> $VERSION (cursor)"
  elif [ -n "$PREV" ] && [ "$FORCE" -eq 0 ]; then
    say "reinstalling" "$VERSION (cursor, already at this version)"
  fi

  # Cursor subagents need transformed frontmatter; always copy, never link.
  for f in "$SRC"/payload/agents/*.md; do
    base="$(basename "$f")"
    $TRANSFORM cursor agent "$f" "$tmp/$base"
    cp "$tmp/$base" "$CURSOR/agents/$base"
    n=$((n+1))
  done
  for d in "$SRC"/payload/skills/*/; do
    skill="$(basename "${d%/}")"
    mkdir -p "$CURSOR/skills/$skill"
    $TRANSFORM cursor skill "$d/SKILL.md" "$CURSOR/skills/$skill/SKILL.md"
    n=$((n+1))
  done
  for f in "$SRC"/payload/commands/*.md; do
    base="$(basename "$f" .md)"
    # office command content is covered by the office skill; skip duplicate slash skill.
    [ "$base" = "office" ] && continue
    mkdir -p "$CURSOR/skills/$base"
    $TRANSFORM cursor command "$f" "$CURSOR/skills/$base/SKILL.md"
    n=$((n+1))
  done
  install_office_tree "$CURSOR"
  rm -rf "$tmp"
  say "installed" "the-office $VERSION -> $CURSOR (copy, $n items)"
}

# ----------------------------------------------------------------- install
[ -d "$TARGET/.git" ] || warn "$TARGET is not a git repository — office done cannot record branch or commit."

case "$RUNTIME" in
  claude) install_claude ;;
  cursor) install_cursor ;;
  both)   install_claude; install_cursor ;;
esac

OFFICE="$CLAUDE/office"
[ "$RUNTIME" = "cursor" ] && OFFICE="$CURSOR/office"

if [ ! -d "$TARGET/.the-office" ]; then
  echo
  echo "  This repo has no board yet. Next:"
  if [ "$RUNTIME" = "cursor" ] || [ "$RUNTIME" = "both" ]; then
    echo "    /office-onboard      audit the harness and propose controls"
    echo "    /office <request>    run a request through the pipeline"
  else
    echo "    /office-onboard      audit the harness and propose controls"
    echo "    /office <request>    run a request through the pipeline"
  fi
else
  echo
  node "$OFFICE/bin/office.mjs" validate 2>&1 | sed 's/^/  /' || \
    warn "existing board does not validate — see above before continuing."
fi
