# RFC 0001 — Event log and stats

| | |
|---|---|
| Status | Implemented |
| Roadmap phase | [1 — Instrument](../ROADMAP.md#phase-1--instrument) |
| Depends on | — |
| Ships in | `payload/bin/office.mjs`, `templates/config.yml.tmpl` |

## Summary

Add an append-only event log written by the lifecycle and verification
commands, an `office stats` command that derives the roadmap's event-log metrics
from it, and a board schema version in `config.yml`.

## Motivation

The CLI records where a task is, not how it got there. A task file holds
`status`, `attempts`, `base_commit` and, once done, `branch` and `commit`.
Verification evidence holds a timestamp, but it lives under
`git rev-parse --git-path office-verification`, is overwritten on every `claim`,
`retry` and `block`, and never leaves the machine.

So four of the roadmap's metrics cannot be computed today: wall-clock time,
first-pass check rate, retries per task (only the final `attempts` count
survives, with no reasons in order) and escalation rate. Phases 2 to 4 all read
these numbers.

## Current state

- Seven commands change or verify task state: `claim`, `check`, `scope`,
  `review`, `retry`, `done`, `block`. All seven already run under
  `.the-office/execution.lock`, so their writes are serialised.
- `findings.jsonl` is the only append-only file. It is committed, and
  `isBoardState()` excludes it from the dirty-tree check and from the
  verification snapshot.
- `config.yml` has `version:`, which is the installed version at `office init`
  time. Nothing describes the layout of the board itself.
- The default config exists twice: in `templates/config.yml.tmpl` and inline in
  `cmds.init`.

## Design

### Event log

File: `.the-office/events.jsonl`. One JSON object per line. Line order is the
order of events; `at` is informative and may go backwards if a clock is changed.

Common fields:

| Field | Type | Meaning |
|---|---|---|
| `v` | integer | Event format version. `1`. |
| `at` | string | UTC timestamp, ISO 8601. |
| `event` | string | See the table below. |
| `task` | string | Task id, `<feature>/<task-file>`. Absent on feature-level events. |
| `feature` | string | Feature slug. |
| `outcome` | string | `ok` or `fail`, except where noted. |

Per-event fields:

| Event | Extra fields | Written when |
|---|---|---|
| `feature` | `type` | `office feature new` succeeds |
| `claim` | `attempt`, `base_commit` | status becomes `in-progress` |
| `check` | `duration_ms`; on `fail`: `command`, `exit` | every check run that reaches a verdict |
| `scope` | `files`; on `fail`: `outside` (count) | every scope run that reaches a verdict |
| `review` | — | status becomes `review` |
| `retry` | `attempt`, `reason`, `outcome`: `ok` or `exhausted` | review sends the task back, or the budget runs out |
| `done` | `commit`, `branch` | status becomes `completed` |
| `block` | `reason`, `from` (previous status) | `office block` succeeds |

Rules:

- **Verdicts are logged; refusals are not.** A command that fails a precondition
  (wrong status, dirty tree, stale approval, lock held) writes nothing. The
  operator made a mistake, and the pipeline did not move. `check` and `scope`
  log both `ok` and `fail`, because a failing check is exactly what first-pass
  check rate counts.
- **One command writes at most one line.** `retry` at the attempt limit moves
  the task to `blocked`; that is logged as `retry` with `outcome: "exhausted"`,
  not as a second `block` line.
- **The line is written after the state change is durable** (after the rename
  in `changeStatus`, after `saveEvidence`). For a failing `check` it is written
  before `die`.
- **Readers ignore unknown events and unknown fields.** RFC 0002 adds events.

`feature` is an eighth event beyond the seven the roadmap lists. Without it
there is no start timestamp for a request, and the roadmap's wall-clock metric
("request to last `office done`") has no left edge.

### `isBoardState`

`events.jsonl` joins `findings.jsonl` and the lock in `isBoardState()`. This is
required, not cosmetic: the snapshot taken by `check` hashes every tracked and
untracked file, so a log line appended by `scope` would otherwise invalidate the
`check` evidence, and `review` would never pass.

### Committed, like the ledger

`events.jsonl` is committed. It is board history, the benchmark runner reads it
from the workspace, and `findings.jsonl` sets the precedent.

Two branches that both append will conflict on merge. The file carries no
sequence number, so a union merge is safe; `office init` adds
`.the-office/*.jsonl merge=union` to `.gitattributes` if the line is absent.
`findings.jsonl` does carry `seq`, which a union merge can duplicate; that is an
existing weakness, noted here and not fixed here.

### `office stats [feature] [--json]`

Reads the log, writes nothing, takes no lock.

| Metric | Definition |
|---|---|
| Cycle time | Per task: first `claim` to `done`. Reported as median and 90th percentile. |
| Lead time | Per feature: `feature` event to its last `done`. Omitted for features with no `feature` event. |
| First-pass check rate | Tasks whose first `check` event is `ok` / tasks with at least one `check` event. |
| Retries per task | `retry` events / tasks with a `claim` event, plus the maximum. |
| Escalation rate | Tasks whose last event is `block` or `retry: exhausted` / tasks with a `claim` event. |

Tasks on the board with no events predate the log. They are excluded from every
rate, and the output says how many were excluded. `--json` prints one object
with a `metrics` map and the excluded count; the keys are part of the CLI's
contract once Phase 3 reads them.

### Board schema version

`config.yml` gains `schema: 1`, written by `office init`.

- `version` remains what it is: the installed version at init time.
- A config with no `schema` key is schema `0`. Schema 0 and 1 differ only by the
  presence of the event log, so the CLI treats them alike.
- If `schema` is greater than the CLI's own `SCHEMA` constant, every command
  except `help` and `version` exits with a message to upgrade the-office. An
  older CLI must not write to a board it does not understand.
- `office validate` reports the board schema and the CLI schema.

`office migrate` is RFC 0005. This RFC only makes migration possible.

The inline config in `cmds.init` and `templates/config.yml.tmpl` must both gain
the key. A test asserts the two are identical after `{{VERSION}}` substitution,
which closes the existing gap as a side effect.

## Harness cell

Computational sensor. No prompt changes: agents call the same commands, and the
log is a side effect of the CLI.

## Alternatives considered

- **Derive metrics from git history.** Task files are committed, so status
  changes are in the log. But commit times are not transition times, a failing
  `check` leaves no commit, and squash merges erase the series.
- **Keep the log beside the evidence under `.git/`.** No merge conflicts, but
  the log would not survive a clone and CI could not read a developer's history.
- **Add a sequence number.** Redundant with line order and unsafe under a union
  merge.
- **Log refused commands too.** Useful for studying agent mistakes, but it mixes
  operator errors with pipeline events and makes every rate depend on how often
  an agent calls a command in the wrong state. Left out until a metric needs it.

## Risks

- **Clock quality.** Durations come from wall-clock timestamps across processes.
  Good enough for minutes-long cycle times; `check` records its own
  `duration_ms` from a monotonic timer.
- **Log growth.** About seven lines per task attempt. No rotation is planned.
- **`board-ui`.** The desktop board reads `.the-office/`. It must tolerate the
  new file and the new config key; it need not display them.
- **Hand edits.** The log is plain text in the repository. Nothing prevents an
  agent from editing it. `office validate` checks that each line parses and that
  each task's events are a legal sequence; it cannot detect a well-formed lie.

## Test plan

- `tests/events.test.mjs`: drive one task through
  claim, failing check, passing check, scope, review, retry, review, done, and
  assert the exact event sequence and fields.
- A refused command leaves the log byte-identical.
- `review` still passes after `check` and `scope` have appended to the log.
- `office stats --json` against a hand-written fixture log under
  `tests/fixtures/`, with expected values checked in.
- A board with `schema: 99` is refused.
- `tests/run.sh` validates every line of this repository's own log.

## Exit criteria

1. Running a feature end to end produces cycle time, first-pass check rate,
   retries per task and escalation rate from `office stats --json`, with no
   model involved.
2. `tests/run.sh` covers the log format and the stats definitions.
3. `office.mjs` still imports nothing outside Node's standard library.

## Open questions

Both were answered before implementation.

- Should `office spec approve` log an event in this phase? **No.** RFC 0002
  defines that event together with the approval policy, and its fields (`gate`,
  `mode`) do not exist yet. Readers ignore unknown events, so adding it later is
  additive.
- Should `findings add` also emit an event, so one file tells the whole story,
  or is the ledger enough? **The ledger is enough.** One fact in two committed
  files can disagree.
