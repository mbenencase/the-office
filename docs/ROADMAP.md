# Product roadmap

Where the-office goes after v0.4.0, and in what order.

This is a statement of direction, not a schedule. Phases are ordered by
dependency, not by date, and none of them carries a version number: versions are
derived from Conventional Commits by `scripts/release.mjs`, so a roadmap cannot
promise one.

Each phase has an RFC under [`docs/rfcs/`](./rfcs/README.md) that describes how
it will be built.

## Goal

Make the-office a spec-driven framework that other teams can adopt for
production work and fit into the agent workflow they already have.

Two things stand between v0.4.0 and that goal:

1. **There is no evidence.** The README claims that executable definitions of
   done and the steering loop produce better software. Nothing measures whether
   they do, or what they cost in tokens and time.
2. **Adoption is harder than it should be.** Installing means cloning this repo
   and running `install.sh`; the pipeline needs a human at three gates; the
   board lives only in markdown; only Claude Code and Cursor are supported.

The roadmap addresses the first before the second. Distribution work done before
measurement spreads a framework whose cost and benefit nobody can state.

## Principles

These follow from the conventions in [`CLAUDE.md`](../CLAUDE.md) and constrain
every item below.

- **Measurement is computational.** Scores come from hidden tests and the event
  log, never from a model grading a model.
- **Everything shipped stays zero-dependency.** The benchmark runner lives
  outside `payload/` and may have dependencies; nothing it needs may drift in.
- **A role must pay for itself.** A role that does not improve the hidden-test
  score for the tokens it consumes is removed or made optional.
- **Compare against a baseline.** A number for the-office alone says nothing.
  Every result is reported next to plain Claude Code on the same task.

## Success metrics

Reported per task and in aggregate, for the-office and for the baseline.

| Metric | Definition | Source |
|---|---|---|
| Requirement pass rate | Hidden acceptance tests passed / total | Benchmark runner |
| Escaped-defect rate | Tasks that reached `office done` and fail a hidden test | Benchmark runner + event log |
| Token cost | Input, output and cached tokens, split by role | Agent runtime usage output |
| Wall-clock time | Request to last `office done` | Event log |
| First-pass check rate | Tasks whose first `office check` exits 0 | Event log |
| Retries per task | `office retry` count | Event log |
| Escalation rate | Tasks that end in `office block` | Event log |
| Finding recurrence | Occurrences of a finding class across a task sequence | `findings.jsonl` |

Escaped-defect rate is the headline metric. It tests the framework's central
promise directly: that a task marked done has been verified by a machine.

## Phase 1 — Instrument

*Record what the pipeline already does.*

The CLI records attempts and findings today, and nothing about time or order.

- Append-only event log (`.the-office/events.jsonl`): one line per `claim`,
  `check`, `scope`, `review`, `retry`, `done` and `block`, with a timestamp, the
  task id and the outcome.
- `office stats [--json]`: cycle time, first-pass check rate, retries per task
  and escalation rate, derived from the log.
- Schema version field in `.the-office/config.yml`, separate from the installed
  version, so later phases can migrate boards.

**Exit criteria:** running a feature end to end yields every event-log metric in
the table above with no model involved, and `tests/run.sh` covers the log format.

## Phase 2 — Headless

*Run the pipeline with nobody at the keyboard.*

The three gates are already toggles in `config.yml`. What is missing is a way to
drive a whole request non-interactively and a policy for the approvals that
remain, such as `office spec approve`.

- Documented non-interactive entry point: one command takes a request and runs
  until the board is complete or a task is blocked.
- Approval policy in `config.yml`: who or what may approve a spec and a board
  when no human is present, recorded in the event log as such.
- Exit codes that separate completed, blocked and failed runs.
- Per-role token usage captured from the runtime into the run's output.

**Exit criteria:** a fixture request runs to completion in CI with no prompts,
and the run reports tokens by role.

## Phase 3 — Golden set and benchmark

*Produce the evidence.*

- **Golden set** of 8 to 10 tasks. Each is a repository snapshot, a request as a
  user would phrase it, and a hidden acceptance suite the agent never sees.
  - All three spec types: bug, feature, refactor.
  - Legacy repositories as well as greenfield.
  - At least one task per pack: Go, Python, Rust, TypeScript.
- **Sequences.** At least one series of 5 to 10 tasks against the same
  repository, to measure whether the steering loop lowers finding recurrence.
  A single task cannot show this.
- **Runner** under `bench/`: executes each task with the-office and with the
  baseline, at least three runs each, and reports median and spread.
- **Results** published in the README and regenerated on demand, not on every
  commit; a full run is expensive.

The task's own `checks` are never used as the score. The Planner writes them, so
grading with them is self-assessment.

**Exit criteria:** a published table comparing the-office with the baseline on
every metric above, reproducible from a documented command.

## Phase 4 — Ablate and tune

*Spend the evidence.*

- Disable one role at a time (Devil's Advocate, Reviewer, each SWE tier) and
  rerun the golden set.
- Remove or make optional any role that does not improve requirement pass rate
  or escaped-defect rate enough to justify its tokens.
- Tune `caps` and tier assignments in the default `config.yml` from the results.
- Add a regression budget: a change to `payload/` that raises token cost beyond
  a threshold without improving the score is flagged before release.

**Exit criteria:** every role in the default pipeline has a measured
contribution, recorded next to the benchmark results.

## Phase 5 — Distribute

*Make adoption a single command.*

- Install through `npx`, which the zero-dependency CLI already allows.
- Claude Code plugin packaging.
- `office migrate`: upgrades a `.the-office/` directory across schema versions.
- Five-minute quickstart and a public example repository showing a request
  taken from spec to completed board.
- Keep the release path list in `release.yml` in step with whatever new shipped
  surface this adds.

**Exit criteria:** a new user installs and completes the quickstart without
cloning this repository, and an upgrade across a schema change needs no manual
edits.

## Phase 6 — Integrate

*Fit the workflow a team already has.*

- `AGENTS.md` / Codex target in `scripts/runtime-transform.mjs`, alongside
  Claude Code and Cursor.
- Two-way sync between the board and GitHub Issues, then Linear. A team will
  not maintain a markdown kanban in parallel with its tracker.
- Gates expressed as pull-request approvals, building on the headless mode.
- More packs, prioritised by what golden-set contributors ask for.

**Exit criteria:** a team using GitHub Issues and a non-Claude runtime can run
the full pipeline without touching the markdown board by hand.

## Not planned

- **A hosted service.** the-office stays files in a repository plus a CLI.
- **A model-graded benchmark.** See the principles above.
- **Runtime dependencies in `payload/`.** No phase justifies one.
- **Replacing the tracker.** The board integrates with trackers; it does not
  compete with them.

## Open questions

- Which baseline besides plain Claude Code is worth the cost: another
  spec-driven framework, or none?
- How large can the golden set grow before a full run is too expensive to
  repeat on each release?
- Should golden-set repositories live here or in a separate repository, given
  they include code in four languages and hidden tests that must stay out of an
  agent's reach?
