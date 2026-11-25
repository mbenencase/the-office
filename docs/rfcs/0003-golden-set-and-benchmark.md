# RFC 0003 — Golden set and benchmark

| | |
|---|---|
| Status | Draft |
| Roadmap phase | [3 — Golden set and benchmark](../ROADMAP.md#phase-3--golden-set-and-benchmark) |
| Depends on | [0001](./0001-instrument.md), [0002](./0002-headless.md) |
| Ships in | `bench/` (not installed into target repositories) |

## Summary

A set of 10 tasks with hidden acceptance suites, one task sequence against a
single repository, and a runner under `bench/` that executes each task with
the-office and with plain Claude Code and reports every roadmap metric for both.

## Motivation

The README claims that executable definitions of done and the steering loop
produce better software. This phase tests that claim and prices it. Phases 4
and 5 depend on the answer: Phase 4 spends it, and Phase 5 distributes a
framework whose cost and benefit can then be stated.

## Design

### Layout

```
bench/
  run.mjs               the runner
  report.mjs            results -> markdown table
  tasks/<task-id>/
    task.json           manifest
    request.md          the request, as a user would phrase it
    repo.json           where the snapshot comes from
    hidden/             acceptance suite; never enters the workspace
  sequences/<seq-id>/
    sequence.json       ordered task ids, shared repository
  results/<run-id>/     raw per-run JSON; summary.json
```

`bench/` may have dependencies. It is not copied by `install.sh` and is not in
the release path list, so a change to it does not publish a release.

### Task manifest

```json
{
  "id": "py-bug-01",
  "stack": "python",
  "type": "bug",
  "origin": "legacy",
  "hidden_total": 14,
  "timeout_minutes": 45
}
```

`repo.json` names an upstream URL and a full commit SHA, or a tarball checked in
beside it for repositories written for the benchmark. `hidden_total` fixes the
denominator: a run that leaves the repository unable to build scores
`0 / hidden_total`, not `0 / 0`.

### Hidden suite contract

`hidden/run.sh <workspace>` installs the suite's files into a copy of the
workspace, runs them, and prints one line of JSON:

```json
{"passed": 12, "total": 14, "failed": ["test_empty_input", "test_unicode_key"]}
```

Hidden tests assert behaviour only. They do not lint, and they do not test file
layout, so they do not reward the harness for installing a formatter.

Where possible a bug task is a real upstream bug: the snapshot is the parent of
the fix commit, and the hidden suite is the regression test that shipped with
the fix. This gives a suite nobody wrote with the-office in mind.

### Golden set

Ten tasks. The matrix satisfies the roadmap's three constraints: all three spec
types, legacy as well as greenfield, and at least one task per pack.

| Id | Stack | Type | Origin |
|---|---|---|---|
| `go-bug-01` | Go | bug | legacy |
| `go-feat-01` | Go | feature | greenfield |
| `py-bug-01` | Python | bug | legacy |
| `py-feat-01` | Python | feature | legacy |
| `py-refac-01` | Python | refactor | legacy |
| `rs-bug-01` | Rust | bug | legacy |
| `rs-feat-01` | Rust | feature | greenfield |
| `ts-bug-01` | TypeScript | bug | greenfield |
| `ts-feat-01` | TypeScript | feature | legacy |
| `ts-refac-01` | TypeScript | refactor | legacy |

Selection rules for a legacy repository: a licence that permits redistribution
of the snapshot, a test suite that runs offline in under five minutes, and no
submodules (the CLI's snapshot refuses them).

A refactor task's hidden suite is a behaviour-preservation suite plus one
structural assertion stated in the request, such as "module A no longer imports
module B".

### Isolation

Each run gets a fresh container. The workspace is the only mounted directory
during the agent phase. `hidden/` is mounted only after the agent process has
exited. The container reaches the model API and nothing else.

This answers the roadmap's reachability concern at run time: tasks can live in
this repository, because the agent never sees this repository. It does not
answer contamination through training data, which is a reason to prefer
repositories written for the benchmark for some tasks and is listed under open
questions.

### Arms

| Arm | What runs |
|---|---|
| `office` | `install.sh` into the workspace, then `office run` (RFC 0002) with spec and plan approvals set to automatic |
| `baseline` | Plain Claude Code in headless mode with `request.md` as the prompt |

Both arms get the same request text, timeout, permission settings and container
image.

**Baseline model.** The baseline runs on the model that the-office maps to its
`deep` tier. the-office mixes three tiers; giving the baseline the strongest of
them means the-office cannot win by using a better model. Token cost is
reported per model and as a priced total, so a cheaper mix still shows up as
cheaper.

**Onboarding.** The `office` arm needs a harness, and installing one is Gate 3,
which RFC 0002 never approves automatically. Each task therefore carries an
onboarded variant of its snapshot: `/office-onboard` is run once, a human
approves the proposal, and the result is committed under
`bench/tasks/<id>/onboarded.patch`. Its token cost is recorded once and reported
on its own line as onboarding cost, not folded into the per-task cost. The
baseline arm runs on the plain snapshot.

### Metrics

Computed per run by the runner, from three sources only: the hidden suite's JSON
line, the event log, and the runtime's usage output.

| Metric | Computation |
|---|---|
| Requirement pass rate | `passed / hidden_total` |
| Escaped-defect rate | Runs the arm reported complete with `passed < hidden_total` / runs reported complete |
| Token cost | Usage from the runtime, by model; by role for the `office` arm |
| Wall-clock time | Runner's own timer, start of agent phase to exit |
| First-pass check rate, retries, escalation rate | `office stats --json` in the workspace; `office` arm only |
| Finding recurrence | See sequences |

"Reported complete" means `office run` exited with its completed code for the
`office` arm, and a normal exit for the baseline. The baseline has no machine
verification, so every finished baseline run counts as reported complete; that
asymmetry is the thing being measured.

A run that hits the timeout is a failed run. It counts in pass rate with what
the hidden suite finds in the workspace as left, and it is excluded from the
escaped-defect denominator.

The task's own `checks` never contribute to a score.

### Sequences

One sequence of eight tasks against one repository, run in order in one
workspace that persists across tasks, so `findings.jsonl`, the harness and any
control the Janitor adds carry forward. The baseline arm gets the same persistent
workspace and whatever it chose to leave behind.

The roadmap sources finding recurrence from `findings.jsonl`. That file is
written by the Reviewer, which makes the class of each finding a model's
judgement and puts the metric in tension with the principle that measurement is
computational. So recurrence is reported two ways:

- **Ledger recurrence**: occurrences per class in `findings.jsonl`, by position
  in the sequence. Reported, and labelled as model-classified.
- **Seeded recurrence**: the sequence is built so that three or four tasks
  invite the same class of defect, such as an unchecked error or a missing
  boundary validation. Each such task's hidden suite has a test for that defect.
  The metric is how many of those tests fail at each position. This is the
  number that decides whether the steering loop works.

If the steering loop works, seeded failures fall along the sequence for the
`office` arm and do not for the baseline.

### Runner

```
node bench/run.mjs [--tasks id,...] [--sequences id,...] [--arms office,baseline]
                   [--runs 3] [--resume <run-id>] [--yes]
```

- Prints the number of agent runs it is about to start and stops unless `--yes`
  is given. A full run is 10 tasks × 2 arms × 3 runs plus the sequence.
- Writes one JSON file per run as it finishes, so an interrupted run resumes.
- Records the the-office commit, the Claude Code version, the model ids and the
  container image digest in `summary.json`. A result without these is not
  reproducible and is not published.
- Aggregates per task and arm as median with minimum and maximum. Three runs do
  not support a confidence interval, and the report does not print one.

### Publishing

`node bench/report.mjs <run-id>` rewrites the table between
`<!-- bench:start -->` and `<!-- bench:end -->` in `README.md` and writes the
per-task breakdown to `bench/RESULTS.md`. A `workflow_dispatch` workflow runs
the benchmark; nothing runs it on push.

Results are published whichever way they come out. A table that shows
the-office losing to the baseline on a metric is the input Phase 4 needs.

## Harness cell

Computational sensor, applied to the framework itself rather than to a target
repository.

## Alternatives considered

- **Use an existing public benchmark.** Cheaper to adopt, and comparable with
  published numbers. But those benchmarks are single-shot bug fixes in one
  language; they have no feature or refactor tasks, no sequence, and cannot show
  the steering loop.
- **Grade with a model.** Excluded by the roadmap's principles.
- **Score with the task's own checks.** The Planner writes them; that is
  self-assessment.
- **Run the baseline on the `standard` tier model.** Cheaper, but it leaves the
  result open to the objection that the-office simply used a stronger model for
  the hard parts.

## Risks

- **Ten tasks is a small sample.** Differences smaller than the run-to-run
  spread are noise, and the report must say so next to the table.
- **Overfitting.** Once the set exists, prompts will be tuned against it. RFC
  0004 holds tasks out for that reason.
- **Cost.** A full run is at least 60 agent runs plus the sequence, several of
  them long. The runner's confirmation step and task filter exist because of
  this.
- **Hidden suites that leak the answer shape.** A suite that tests a function
  name the request never mentions punishes both arms for something neither
  could know. Each task is reviewed for this before it is admitted.
- **Flaky hidden tests.** Each suite is run 20 times against a reference
  solution before admission and must pass every time.

## Test plan

- A reference solution per task, kept under `hidden/`, must score
  `hidden_total / hidden_total`; the untouched snapshot must score less. CI runs
  both for every task. This needs no model.
- The runner is tested with the stub runtime from RFC 0002.
- `report.mjs` is tested against a checked-in `summary.json`.

## Exit criteria

1. A table in the README compares the-office with the baseline on every metric
   in the roadmap, per task and in aggregate.
2. `node bench/run.mjs --yes` followed by `node bench/report.mjs` reproduces it,
   and both commands are documented.
3. The sequence result shows seeded recurrence by position for both arms.

## Open questions

- **Where the tasks live.** This RFC puts them under `bench/tasks/`, with
  upstream repositories referenced by commit and not vendored. If snapshots
  written for the benchmark push the repository past a size worth caring about,
  they move to a separate repository. Does anyone object to starting here?
- **A second baseline.** Another spec-driven framework would answer "is it
  the-office or just any process?", at the cost of a third arm on every run.
  Proposed: not in the first published result.
- **Contamination.** Upstream bug-fix commits are in public history and may be
  in training data, which helps both arms equally in principle. Is equal help
  good enough, or should bug tasks be written for the benchmark?
- **Release cadence.** How large can the set grow before a full run is too
  expensive to repeat per release? Deferred until the first full run has a
  measured cost.
