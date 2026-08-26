# Changelog

## 0.1.0

First release. Phases 1–7 of [`PLAN.md`](./PLAN.md).

### Deterministic core
- `office.mjs` — zero-dependency Node CLI. Board reads and state transitions,
  dependency-ordered `next`, executable-DoD `check`, `scope` allowlist
  enforcement, `validate` (schema, duplicate ids, orphan deps, cycles),
  `audit`, pack catalogue, findings ledger, scaffolding.
- Task schema with `checks:` as the contract, `tier:` in place of a model id,
  `scope:` globs, `attempts`/`max_attempts`, and `review`/`blocked` statuses.

### Harness bootstrap
- Sensor packs for Python, TypeScript/JS, Go, and Rust. Each control declares
  its cell in the control matrix, its cost, and a `legacy_order` for strangler
  adoption.
- `office audit` — stack detection, control probes, harnessability scoring
  across typing, boundaries, tests, build reproducibility, and existing controls.
- Go pack ships an architecture fitness function (`arch_test.go`) for import
  boundary rules.

### Roster
- Eight agents. Judge routes three ways — the third, `harness`, has no home in
  the original spec. Three SWE tier variants so `tier:` selects a model.
  Reviewer works through maintainability, architecture fitness, and behaviour,
  and logs every finding with a class. Janitor converts recurring classes into
  computational controls.
- Five skills: `office`, `office-board`, `office-task-schema`, `office-harness`,
  `office-swe-protocol`.
- Four commands: `/office`, `/office-onboard`, `/office-board`, `/office-next`.

### Install
- `install.sh` with `--link` and `--uninstall`. Uninstall removes only
  `office*`-prefixed payload and never touches `.the-office/` state.

### Notes
- Pack manifests are `pack.json`, not `pack.yml` as planned. The CLI's YAML
  subset does not parse lists of maps, and extending it for one machine-read
  file was not worth the parser risk.
- Onboarding this repo with its own audit found that the `tests` probe was
  stack-specific and scored 0 for a repo whose suite is a shell script. Fixed by
  adding universal probes for test entrypoints. The steering loop working on the
  tool that implements it.
