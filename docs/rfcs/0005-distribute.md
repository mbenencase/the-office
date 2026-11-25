# RFC 0005 — Distribution

| | |
|---|---|
| Status | Draft |
| Roadmap phase | [5 — Distribute](../ROADMAP.md#phase-5--distribute) |
| Depends on | [0001](./0001-instrument.md) (schema version) |
| Ships in | `payload/bin/office.mjs`, `installer/` (new), `package.json`, `.claude-plugin/` (new), `release.yml` |

## Summary

Publish the-office to npm so that one `npx` command installs it, package it as a
Claude Code plugin, add `office migrate` for boards on an older schema, and
write a quickstart that CI executes.

## Motivation

Installing today means cloning this repository and running `install.sh`.
Upgrading means pulling and running it again. A board created by an older
version has no upgrade path other than reading the changelog.

The roadmap puts this phase after measurement on purpose. By the time it starts,
the README carries benchmark results and the default pipeline has been tuned.

## Current state

- `install.sh` is Bash. It copies `payload/agents`, `payload/skills` and
  `payload/commands` into `<target>/.claude/`, and the CLI, `packs/` and
  `templates/` into `<target>/.claude/office/`, with a `VERSION` stamp. For
  Cursor it pipes each file through `scripts/runtime-transform.mjs`.
- `package.json` is `private`, already declares `bin: office`, and has no
  `files` list.
- Agents, skills and commands call the CLI by a literal path,
  `.claude/office/bin/office.mjs`. The Cursor transform rewrites that string.
- `release.yml` publishes a GitHub release when `payload/`, `packs/`,
  `templates/`, `install.sh` or `VERSION` change on `main`.

## Design

### One installer, in Node

Bash is the reason the installer cannot run through `npx` on Windows, and two
installers would drift. The install logic moves to `installer/install.mjs`,
standard library only, and `scripts/runtime-transform.mjs` moves beside it,
since it is install-time code that must ship.

- `install.sh` becomes a wrapper: `exec node "$SRC/installer/install.mjs" "$@"`.
  Its flags and output stay as they are, and the CI job that exercises install,
  upgrade and uninstall keeps passing unchanged. That job is the regression test
  for the port.
- `office install [target] [--runtime ...] [--link] [--uninstall] [--force]`
  calls the same module, so the npm entry point is the existing `bin`.

### npm

```
npx <package> install            # into the current repository
npx <package> install --runtime cursor
npx <package>@latest install     # upgrade
```

- `private` is removed. `files` lists `payload/`, `packs/`, `templates/`,
  `installer/` and `VERSION`. Nothing else is published: not `board-ui/`, not
  `bench/`, not `tests/`.
- `dependencies` stays empty. A test fails if the key appears.
- `release.yml` gains an `npm publish --provenance` step after the tag is
  pushed. `scripts/release.mjs` already writes the version into `package.json`.
- The installed layout in the target does not change. The package is the
  delivery vehicle; the CLI still runs from `.claude/office/bin/` with only
  Node, and a target repository gains no `node_modules` and no `package.json`
  entry.

### Claude Code plugin

The repository becomes its own marketplace: `.claude-plugin/marketplace.json`
lists one plugin with `"source": "./"`, and `.claude-plugin/plugin.json`
describes it.

```
claude plugin marketplace add <owner>/the-office
claude plugin install the-office@the-office
```

Facts from the plugin documentation that shape the design:

| Fact | Consequence |
|---|---|
| `agents` in the manifest takes paths to `.md` files, not a directory | The manifest lists each agent file. A test asserts the list equals `payload/agents/*.md`. |
| `commands` takes a path and replaces the default scan; `skills` takes directories | Both point into `payload/`. |
| A plugin's `bin/` directory is added to the Bash tool's `PATH` | A root `bin/office` shim makes the CLI callable as `office`. |
| `${CLAUDE_PLUGIN_ROOT}` expands in skill, agent and command bodies, and is not set in the Bash tool's environment | Prompts cannot rely on the variable inside a shell command. They call `office`. |
| Plugin components are namespaced: `/the-office:office`, `the-office:office-spec` | See the spike below. |
| The manifest `version` wins over the commit SHA | `scripts/release.mjs` writes it, as a fourth copy of `VERSION`, with the same drift check. |

**Calling the CLI by name.** The literal path `.claude/office/bin/office.mjs` in
the payload is what ties the prompts to one install layout. This RFC replaces it
with the bare command `office` everywhere. The file installer already writes a
shim at `.claude/office/bin/office`; it additionally tells the user to put that
directory on `PATH`, and each command file falls back to the full path when
`office` is not found. The Cursor path rewrite then has nothing left to rewrite.

**Spike before committing to the plugin.** Agents refer to skills by bare name
("load the `office` skill"), and commands refer to agents the same way. Whether
a bare name resolves to a plugin's namespaced component is not documented. The
spike installs the plugin into a scratch repository and runs the stub-free
fixture request from RFC 0002. If bare names do not resolve, the plugin target
of the transform rewrites them to the namespaced form at build time.

The plugin and the file install are two routes to the same payload. The
quickstart leads with whichever the spike shows to be more reliable and
documents the other.

### `office migrate`

```
office migrate            # print the plan, change nothing
office migrate --write    # apply it
```

- Migrations are an ordered array in `office.mjs`: `{ from, to, describe, apply }`.
  The CLI's `SCHEMA` constant is the last `to`.
- Without `--write` it prints each step's description and the files it would
  touch, and exits 0 if the board is current, 1 if migrations are pending.
- With `--write` it requires a clean working tree outside `.the-office/`, takes
  the execution lock, applies the steps in order, and writes `schema:` last.
  Each step is idempotent, so a run interrupted halfway can be rerun. There is
  no backup; the board is in Git.
- A board on an older schema: read-only commands work, and commands that write
  refuse with the one line to run. A board on a newer schema is refused entirely
  (RFC 0001).
- The installer prints the same line after an upgrade that leaves the board
  behind. It never migrates on its own: install does not touch `.the-office/`,
  and that promise stays.

Migrations known today:

| From | To | Change |
|---|---|---|
| 0 | 1 | Add `schema: 1`; create an empty `events.jsonl`; add the `.gitattributes` line |
| 1 | 2 | Fold `gates:` into `approvals:` (RFC 0002) and add `pipeline:` (RFC 0004), if those shipped under schema 1 |

Every change to the layout of `.the-office/` from now on ships with its
migration and a fixture board at the old schema under `tests/fixtures/`.

### Quickstart and example repository

- `docs/QUICKSTART.md`: install, onboard, one request, one completed board.
  Target is five minutes of a reader's attention, excluding model time.
- Every shell block in it is tagged, and a CI job extracts and runs the blocks
  in order in a scratch repository, with the stub runtime standing in for the
  model. A quickstart that no longer works fails CI.
- A public example repository whose history shows a request going from spec to
  completed board, one commit per lifecycle step. It is produced by a headless
  run and regenerated on each minor release, so it never shows a layout the
  current version would not produce.

### Release path list

`release.yml` adds `installer/**`, `.claude-plugin/**`, `bin/**` and
`package.json`. `scripts/` leaves the picture: after the move, nothing under it
ships.

The existing rule gets a sensor. A test computes the set of paths the installer
reads and the set in `package.json` `files`, and fails if either contains a path
that `release.yml` does not list. Today that rule is a sentence in `CLAUDE.md`.

## Harness cell

Mostly distribution, which is neither. The sensors it adds are computational:
the manifest-versus-payload test, the release-path test, the executed
quickstart, and the migration fixtures.

## Alternatives considered

- **Keep `install.sh` and add a separate Node installer for npm.** Less work
  now, two implementations forever.
- **Make `office` a dependency of the target (`npm i -D`).** Normal for a Node
  project, wrong for a Go or Rust repository, and it breaks the promise that a
  target needs nothing but Node.
- **Generate the plugin into a separate repository at release.** Keeps this
  repository's root clean, at the cost of a second repository to publish to and
  a second place for issues. Reconsidered if the root manifest turns out to
  expose files it should not.
- **Migrate automatically on first command.** Convenient, and it means a
  read-only command rewrites committed files. Refused.

## Risks

- **The npm name.** `the-office` is unlikely to be free. A scoped name is
  probable, and it appears in every install command, so it should be settled
  before the quickstart is written.
- **Two install routes disagree.** A plugin install and a file install in the
  same repository would give two copies of every agent. The installer detects
  the plugin and refuses, and the plugin's onboarding command detects
  `.claude/office/` and says so.
- **`PATH` dependence.** Calling `office` by bare name is cleaner and can
  collide with another binary of that name. The fallback to the full path covers
  absence, not collision; `office --version` output is checked by the commands
  before they trust it.
- **Supply chain.** Publishing to npm makes the release workflow a target.
  Provenance attestation and a publish token scoped to one package are the
  minimum.

## Test plan

- The existing install, upgrade and uninstall CI job, unchanged, against the
  wrapper.
- The same job run through `npm pack` and `npx ./<tarball> install`, on Linux,
  macOS and Windows.
- `plugin.json` agent list equals the payload; version equals `VERSION`.
- Migration: each fixture board migrates to current and passes
  `office validate`; a second `--write` is a no-op; an interrupted migration can
  be resumed.
- The quickstart job.

## Exit criteria

1. A new user installs and completes the quickstart without cloning this
   repository. The quickstart CI job is the proof.
2. A board at schema 0 reaches the current schema with `office migrate --write`
   and no manual edit.
3. A merge that changes any shipped path publishes a release, and a test
   enforces the path list.

## Open questions

- The package name and scope.
- Does the plugin replace the file install as the recommended route for Claude
  Code, or stay an alternative? Depends on the spike.
- Should `board-ui` be mentioned in the quickstart, or stay a separate download?
