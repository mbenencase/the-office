# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`VERSION` is the single source of truth. `scripts/bump.sh` propagates it to
`package.json` and the `VERSION` constant in `payload/bin/office.mjs`, and
`tests/run.sh` fails if any of them drift apart.

## [Unreleased]

### Added
- CI on GitHub Actions: the sensor suite across Node 18/20/22, shellcheck over
  every shell script, an install/upgrade/uninstall smoke test, and a job that
  validates each sensor pack's config against the real tool.
- `scripts/bump.sh` — propagates a version to all three places, moves the
  Unreleased section into a dated release, commits, and tags.
- Release workflow: a `v*` tag verifies version consistency, runs the suite,
  and publishes a GitHub Release with that version's changelog section.
- Version-consistency and changelog-section sensors in `tests/run.sh`.

### Fixed
- Pack configs were never executed against their tools. The `packs` CI job now
  runs ruff, eslint, gofmt/vet, and rustfmt against each pack's config.
- Pipelines into `grep -q` could report a spurious failure: `grep` exits on the
  first match, the upstream process takes SIGPIPE, and `pipefail` surfaces it as
  exit 141. Hardened in the pre-commit hook, `tests/run.sh`, and both workflows.
- `office init` now says when it found an existing board in a *parent*
  directory rather than only printing the path it resolved to.

## [0.1.0] — 2026-08-26

First release. Phases 1–7 of [`PLAN.md`](./PLAN.md).

### Added

**Deterministic core** — `payload/bin/office.mjs`, zero dependencies. Board
reads and state transitions, dependency-ordered `next`, executable-DoD `check`,
`scope` allowlist enforcement, `validate` (schema, duplicate ids, orphan deps,
cycles), `audit`, pack catalogue, findings ledger, scaffolding.

**Task schema** with `checks:` as the contract, `tier:` in place of a model id,
`scope:` globs, `attempts`/`max_attempts`, and `review`/`blocked` statuses.

**Harness bootstrap** — sensor packs for Python, TypeScript/JS, Go, and Rust.
Each control declares its cell in the control matrix, its cost, and a
`legacy_order` for strangler adoption. `office audit` scores harnessability
across typing, boundaries, tests, build reproducibility, and existing controls.
The Go pack ships an architecture fitness function for import boundary rules.

**Roster** — eight agents, five skills, four commands. The Judge routes three
ways; the third, `harness`, has no home in the original spec. Three SWE tier
variants so `tier:` selects a model. The Reviewer works through maintainability,
architecture fitness, and behaviour, logging every finding with a class. The
Janitor converts recurring classes into computational controls.

**Install** — `install.sh` with `--link` and `--uninstall`. Uninstall removes
only `office*`-prefixed payload and never touches `.the-office/` state.

### Notes

Pack manifests are `pack.json`, not `pack.yml` as planned. The CLI's YAML subset
does not parse lists of maps, and extending it for one machine-read file was not
worth the parser risk.

Onboarding this repo with its own audit found that the `tests` probe was
stack-specific and scored a shell-script suite at zero, and that `office scope`
counted the installed `.claude/` payload as task work — which would have failed
every task in every repo with this installed. Both fixed with regression tests.

[Unreleased]: https://github.com/mbenencase/the-office/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mbenencase/the-office/releases/tag/v0.1.0
