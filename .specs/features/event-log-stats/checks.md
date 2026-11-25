# Event log and stats checks

Profile: light
Plan: `.specs/features/event-log-stats/plan.md`

43 checks in 4 slices · 4 one-way doors · 0 open, of which 0 block

Every proof is one named test in `tests/events.test.mjs` (new; it joins the `node --test` line in
`tests/run.sh`), run as `node --test --test-name-pattern="<name>" tests/events.test.mjs`, except
C40 and C43, which are shell commands. Tests run the CLI as a subprocess in a temp Git repo, like
`tests/lifecycle.test.mjs`.

## Checks

### S1 - lifecycle commands leave an ordered event log · 2 files · 64 KB · ~16k

**C1** - Every line the CLI appends to `.the-office/events.jsonl` is one JSON object with `v` = `1`, `at` matching `^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$`, a string `event`, `feature` and `outcome`; `task` equals the task id on all events except `feature` (AC 1)
Proof: `node --test --test-name-pattern="common fields on every event" tests/events.test.mjs`

**C2** - `office claim sample/task-01` on the pending fixture appends `event: "claim"`, `outcome: "ok"`, `attempt: 1`, `base_commit` = the `HEAD` SHA at claim time, `feature: "sample"` (AC 2)
Proof: `node --test --test-name-pattern="claim event" tests/events.test.mjs`

**C3** - A passing `office check` appends `event: "check"`, `outcome: "ok"`, an integer `duration_ms` >= 0, and no `command` or `exit` key (AC 3)
Proof: `node --test --test-name-pattern="check ok event" tests/events.test.mjs`

**C4** - With `checks: ["exit 3"]`, `office check` exits 1 and the last log line is `event: "check"`, `outcome: "fail"`, `command: "exit 3"`, `exit: 3`, integer `duration_ms` >= 0 (AC 4)
Proof: `node --test --test-name-pattern="check fail event" tests/events.test.mjs`

**C5** - With one changed file inside the allowlist, `office scope` appends `event: "scope"`, `outcome: "ok"`, `files: 1`, and no `outside` key (AC 5)
Proof: `node --test --test-name-pattern="scope ok event" tests/events.test.mjs`

**C6** - With `src/a.txt` and `outside.txt` changed and scope `src/**`, `office scope` exits 1 and the last log line is `event: "scope"`, `outcome: "fail"`, `files: 2`, `outside: 1` (AC 6)
Proof: `node --test --test-name-pattern="scope fail event" tests/events.test.mjs`

**C7** - `office review` on a verified task appends `event: "review"`, `outcome: "ok"` (AC 7)
Proof: `node --test --test-name-pattern="review event" tests/events.test.mjs`

**C8** - `office retry <id> --reason "finding 1"` on a task at attempt 1 of 3 appends `event: "retry"`, `outcome: "ok"`, `attempt: 2`, `reason: "finding 1"` (AC 8)
Proof: `node --test --test-name-pattern="retry ok event" tests/events.test.mjs`

**C9** - `office retry <id> --reason "finding 3"` at attempt 3 of 3 exits 1, adds exactly one line, `event: "retry"`, `outcome: "exhausted"`, `attempt: 3`, `reason: "finding 3"`, and the log contains no `block` event (AC 9)
Proof: `node --test --test-name-pattern="retry exhausted event" tests/events.test.mjs`

**C10** - `office done` appends `event: "done"`, `outcome: "ok"`, with `commit` and `branch` equal to the `commit:` and `branch:` values in the task file (AC 10)
Proof: `node --test --test-name-pattern="done event" tests/events.test.mjs`

**C11** - `office block <id> --reason "stuck"` on an `in-progress` task appends `event: "block"`, `outcome: "ok"`, `reason: "stuck"`, `from: "in-progress"`; on a `pending` task `from` is `"pending"` (AC 11)
Proof: `node --test --test-name-pattern="block event" tests/events.test.mjs`

**C12** - `office feature new demo --type bug` appends `event: "feature"`, `outcome: "ok"`, `feature: "demo"`, `type: "bug"`, and the object has no `task` key (AC 12)
Proof: `node --test --test-name-pattern="feature event" tests/events.test.mjs`

**C13** - Each of these nine refused commands exits 1 and leaves `events.jsonl` byte-identical: `done` on a pending task (wrong status); `claim` with a dirty tree; `claim` with a stale spec approval; `block` while `execution.lock` exists; `block` with no `--reason`; `check` with `checks: []`; `scope` with `scope: []`; `claim` with an uncompleted dependency; `check` whose command rewrites `src/a.txt` (AC 13)
Proof: `node --test --test-name-pattern="refused commands leave the log byte-identical" tests/events.test.mjs`

**C14** - Driving `sample/task-01` through claim, failing check, passing check, scope, review, retry, check, scope, review, done yields exactly 10 lines whose `event:outcome` sequence is `claim:ok check:fail check:ok scope:ok review:ok retry:ok check:ok scope:ok review:ok done:ok`, and the line count grows by exactly 1 after each command (AC 14)
Proof: `node --test --test-name-pattern="full lifecycle event sequence" tests/events.test.mjs`

**C15** - With `events.jsonl` tracked by Git and carrying uncommitted lines appended by `check` and `scope`, `office review` exits 0, and `office scope` reports `1 changed file` (the log is not counted) (AC 15)
Proof: `node --test --test-name-pattern="log appends do not stale evidence" tests/events.test.mjs`

### S2 - `office stats` derives the metrics from the log · 3 files · 60 KB · ~15k

The stats fixture is a hand-written board and log under `tests/fixtures/stats/`: feature `alpha`
(has a `feature` event; tasks 01-04 done with cycle times 60000, 120000, 180000, 600000 ms; first
`check` is `ok` on 01, 03, 04 and `fail` on 02; one `retry:ok` on 02; last `done` 900000 ms after
the `feature` event; task-05 on the board with no events) and feature `beta` (no `feature` event;
task-01: claim, `check:fail`, `retry:ok`, `retry:exhausted` as its last event; task-02: claim then
`block` as its last event, no `check`). It also holds one line that is not JSON and one line with
`event: "run_start"`.

**C16** - `office stats --json` on the fixture prints stdout that parses as one JSON object whose keys are exactly `metrics` and `excluded`, exits 0, leaves every file under the fixture byte-identical, and leaves no `execution.lock` (AC 16)
Proof: `node --test --test-name-pattern="stats json envelope" tests/events.test.mjs`

**C17** - On the fixture, `metrics.cycle_time_ms` deep-equals `{"n":4,"median":150000,"p90":600000}` (AC 17)
Proof: `node --test --test-name-pattern="stats cycle time" tests/events.test.mjs`

**C18** - With three cycle times 60000, 120000, 180000 (odd `n`), `median` is `120000` and `p90` is `180000` (AC 17)
Proof: `node --test --test-name-pattern="stats cycle time odd n" tests/events.test.mjs`

**C19** - On the fixture, `metrics.lead_time_ms` deep-equals `{"alpha":900000}`: `beta` is omitted (AC 18)
Proof: `node --test --test-name-pattern="stats lead time" tests/events.test.mjs`

**C20** - On the fixture, `metrics.first_pass_check_rate` deep-equals `{"passed":3,"tasks":5,"rate":0.6}` (AC 19)
Proof: `node --test --test-name-pattern="stats first-pass check rate" tests/events.test.mjs`

**C21** - On the fixture, `metrics.retries_per_task` deep-equals `{"retries":3,"tasks":6,"mean":0.5,"max":2}` (AC 20)
Proof: `node --test --test-name-pattern="stats retries per task" tests/events.test.mjs`

**C22** - On the fixture, `metrics.escalation_rate` has `escalated: 2`, `tasks: 6` and `rate` equal to `2/6` (AC 21)
Proof: `node --test --test-name-pattern="stats escalation rate" tests/events.test.mjs`

**C23** - On the fixture, `excluded` is `1` (AC 22)
Proof: `node --test --test-name-pattern="stats excluded count" tests/events.test.mjs`

**C24** - `office stats beta --json` on the fixture gives `cycle_time_ms` `{"n":0,"median":null,"p90":null}`, `lead_time_ms` `{}`, `first_pass_check_rate` `{"passed":0,"tasks":1,"rate":0}`, `retries_per_task` `{"retries":2,"tasks":2,"mean":1,"max":2}`, `escalation_rate` `{"escalated":2,"tasks":2,"rate":1}`, `excluded` `0` (AC 23)
Proof: `node --test --test-name-pattern="stats feature filter" tests/events.test.mjs`

**C25** - On a board with tasks and no `events.jsonl`, `office stats --json` exits 0 with `cycle_time_ms` `{"n":0,"median":null,"p90":null}`, `lead_time_ms` `{}`, `first_pass_check_rate` `{"passed":0,"tasks":0,"rate":null}`, `retries_per_task` `{"retries":0,"tasks":0,"mean":null,"max":0}`, `escalation_rate` `{"escalated":0,"tasks":0,"rate":null}` (AC 24)
Proof: `node --test --test-name-pattern="stats with no log" tests/events.test.mjs`

**C26** - Removing the non-JSON line and the `run_start` line from the fixture log leaves the `office stats --json` output byte-identical (AC 25)
Proof: `node --test --test-name-pattern="stats ignores unreadable and unknown lines" tests/events.test.mjs`

**C27** - `office stats` without `--json` on the fixture exits 0 and prints five rows containing `cycle time`, `lead time`, `first-pass check rate`, `retries per task`, `escalation rate` (case-insensitive) and a line matching `1 task\(s\) excluded` (AC 26)
Proof: `node --test --test-name-pattern="stats table output" tests/events.test.mjs`

**C28** - `office help` output contains `stats [feature] [--json]` (AC 27)
Proof: `node --test --test-name-pattern="help lists stats" tests/events.test.mjs`

**C29** - `office stats` in a directory with no `.the-office/` in it or any parent exits 1 (Surface: `stats` exit 1)
Proof: `node --test --test-name-pattern="stats with no board" tests/events.test.mjs`

### S3 - the board declares a schema the CLI respects · 3 files · 56 KB · ~14k

**C30** - After `office init` in an empty repo, `.the-office/config.yml` contains the line `schema: 1` (AC 28)
Proof: `node --test --test-name-pattern="init writes schema 1" tests/events.test.mjs`

**C31** - On a board with `schema: 99`, each of these 19 commands exits 1 with stderr containing `99`, `1` and `upgrade`, and every file under the board is byte-identical afterwards: `init --force`, `board`, `next`, `validate`, `claim`, `retry`, `review`, `done`, `block`, `check`, `scope`, `audit`, `pack list`, `findings list`, `spec status sample`, `feature new x`, `task new sample`, `stats`, `capabilities` (AC 29)
Proof: `node --test --test-name-pattern="schema 99 is refused by every command" tests/events.test.mjs`

**C32** - On a board with `schema: 99`, `office help` and `office version` exit 0 (AC 29)
Proof: `node --test --test-name-pattern="help and version ignore the schema gate" tests/events.test.mjs`

**C33** - On a board whose `schema` is `-1`, `abc` or `1.5`, `office board` exits 1 with stderr containing that value (AC 30)
Proof: `node --test --test-name-pattern="invalid schema values are refused" tests/events.test.mjs`

**C34** - On a board whose `config.yml` has `version: 0.1.0` and no `schema` key, `office board` and `office claim sample/task-01` exit 0 (AC 31)
Proof: `node --test --test-name-pattern="a board with no schema key works" tests/events.test.mjs`

**C35** - `office validate` prints `board schema 0, CLI schema 1` on a board with no `schema` key and `board schema 1, CLI schema 1` on a freshly initialised board (AC 32)
Proof: `node --test --test-name-pattern="validate reports both schemas" tests/events.test.mjs`

**C36** - The `config.yml` written by `office init` is byte-identical to `templates/config.yml.tmpl` with `{{VERSION}}` replaced by the contents of `VERSION` (AC 33)
Proof: `node --test --test-name-pattern="inline config equals the template" tests/events.test.mjs`

### S4 - the log is validated and merges cleanly · 4 files · 76 KB · ~19k

**C37** - `office validate` exits 1 with output containing `events.jsonl:2` when line 2 of the log is, in turn, `not json`, `[1]`, or `{"v":1}` (AC 34)
Proof: `node --test --test-name-pattern="validate rejects malformed log lines" tests/events.test.mjs`

**C38** - For each of the 32 cells of {`in-progress`, `review`, `blocked`, `completed`} x {`claim`, `check`, `scope`, `review`, `retry:ok`, `retry:exhausted`, `done`, `block`}, a two-line log (a first event that sets the state: `claim`, `review`, `block`, `done`; then the event) makes `office validate` exit 0 for the 12 legal cells (`claim`@`blocked`; `check`, `scope`, `block`@`in-progress`; `check`, `scope`, `retry:ok`, `retry:exhausted`, `done`, `block`@`review`; `review`@`in-progress`; `block`@`blocked`) and exit 1 with `events.jsonl:2` for the other 20 (AC 35)
Proof: `node --test --test-name-pattern="validate enforces the transition table" tests/events.test.mjs`

**C39** - The log written by the C14 lifecycle, and a one-line log holding any single known task event, both make `office validate` exit 0 (AC 35, first event legal from any state)
Proof: `node --test --test-name-pattern="validate accepts a real lifecycle log" tests/events.test.mjs`

**C40** - `tests/run.sh` validates this repository's own board and log and reports it as a named pass (AC 39)
Proof: `bash tests/run.sh 2>&1 | grep -E "pass +this repository's own board and event log validate"`

**C41** - A line `{"v":1,"at":"2026-01-01T00:00:00.000Z","event":"run_start","task":"sample/task-01","feature":"sample","outcome":"ok"}` between `claim` and `review` lines of the same task does not change `office validate`'s exit code 0 (AC 36)
Proof: `node --test --test-name-pattern="validate skips unknown events" tests/events.test.mjs`

**C42** - `office init` creates `.the-office/events.jsonl` with 0 bytes; `office init --force` on a board whose log has one line leaves it byte-identical; when `.gitattributes` is absent it is created containing the line `.the-office/*.jsonl merge=union`; when it exists with `*.png binary` the line is appended and `*.png binary` is kept; after a second `office init --force` the line occurs exactly once (AC 37, AC 38)
Proof: `node --test --test-name-pattern="init prepares the log and gitattributes" tests/events.test.mjs`

**C43** - Every `import` in `payload/bin/office.mjs` names a `node:` module; RFC 0001's header reads `| Status | Implemented |` and its row in `docs/rfcs/README.md` reads `Implemented` (AC 40, plan Impact: docs)
Proof: `node --test --test-name-pattern="office.mjs imports only node modules" tests/events.test.mjs`
Proof: `grep -q '^| Status | Implemented |' docs/rfcs/0001-instrument.md && grep -qE '0001-instrument.md\) \| 1 — Instrument \| Implemented' docs/rfcs/README.md`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| event types, door 1 (8) | `feature` C12 · `claim` C2 · `check` C3 · `scope` C5 · `review` C7 · `retry` C8 · `done` C10 · `block` C11 | - |
| verdict outcomes that are not `ok` (3) | `check:fail` C4 · `scope:fail` C6 · `retry:exhausted` C9 | - |
| refusals that write nothing (9) | C13, table-driven over all 9 | - |
| `stats --json` metric keys, door 2 (5) | `cycle_time_ms` C17 · `lead_time_ms` C19 · `first_pass_check_rate` C20 · `retries_per_task` C21 · `escalation_rate` C22 | - |
| `stats --json` top-level keys (2) | `metrics` C16 · `excluded` C23 | - |
| percentile edges (2) | even `n` C17 · odd `n` C18 | - |
| escalation causes (2) | last event `block` C22 · last event `retry:exhausted` C22 | - |
| `office stats` exit codes (2) | `0` C16 · `1` C29 | - |
| `office validate` exit codes (2) | `0` C35 · `1` C37 | - |
| `office init` exit codes (2) | `0` C30 · `1` C31 | - |
| schema gate, refused commands (19) | C31, table-driven over all 19 | - |
| schema gate, exempt commands (2) | `help` C32 · `version` C32 | - |
| schema values, door 3 (6) | absent C34 · `1` C30 · `99` C31 · `-1` C33 · `abc` C33 · `1.5` C33 | - |
| malformed log lines (3) | not JSON C37 · JSON non-object C37 · object with no `event` C37 | - |
| transition table cells (32) | C38, table-driven over all 32 | - |
| `.gitattributes` states, door 4 (3) | absent C42 · present without the line C42 · present with the line C42 | - |
| entities in Relations (3) | `Event` C1 · `Task`-`Event` C2 · `Feature`-`Event` C12 | - |

- Claims naming an exit code or output shape: C4, C6, C9, C16, C29, C31, C33, C37, C38 - each has
  a proof that runs the CLI as a subprocess
- No other check claims more than the single case its proof exercises

## Swept

- validation: C33, C37
- failure modes: C4, C6
- idempotency: C42, C9
- authorization: n/a - a local CLI with no caller identity
- concurrency: existing - `execution.lock` in the dispatcher of `payload/bin/office.mjs` already serialises all eight writing commands; the lock-held member of C13 observes it
- data lifecycle: n/a - the RFC plans no rotation or deletion; tasks that predate the log land on C23
- dependency failure: n/a - no external dependency; Git failures are existing refusals and write nothing (C13)
- state transitions: C38, C39, C41
- observability: C14

## Handoff

- Files touched: `payload/bin/office.mjs` 54.7 KB, `tests/lifecycle.test.mjs` 8.9 KB (read for the
  fixture pattern), `tests/run.sh` 10.6 KB, `templates/config.yml.tmpl` 0.6 KB,
  `docs/rfcs/0001-instrument.md` 9.2 KB, `docs/rfcs/README.md` 1.6 KB = 85.6 KB / 4 = ~21k, plus
  ~12k for the new `tests/events.test.mjs` and `tests/fixtures/stats/` = ~33k, under the 150k
  budget - one builder
- Mechanism: one builder, in a new session at the user's request
