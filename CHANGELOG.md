# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Releases are generated.** Every merge to `main` that touches the shipped
surface is released automatically: `scripts/release.mjs` derives the version
from [Conventional Commits](https://www.conventionalcommits.org/) since the last
tag, writes the section below, and the `release` workflow publishes it.

There is no hand-maintained "Unreleased" section — under auto-release `main` is
always released, so it would always be empty. Write good commit messages
instead; they become these notes verbatim.

<!-- next-release -->

## [0.2.0] — 2026-08-28

### Added

- **install:** add Cursor Agent runtime support (#4) (`f1d885c`)
- **ci:** auto-publish a release on every merge to main (`0517b90`)

### Changed

- Add workflow diagrams to the README, with a sensor for them (`8203685`)
- Fix the four failures from the first CI run (`2f85a3a`)
- Add CI, release automation, and single-source versioning (`b903fc6`)
- Initial release: the-office v0.1.0 (`482f53e`)

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

[0.1.0]: https://github.com/mbenencase/the-office/releases/tag/v0.1.0
[0.2.0]: https://github.com/mbenencase/the-office/releases/tag/v0.2.0
