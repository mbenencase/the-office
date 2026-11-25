# Event log and stats verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 13f24e9cf50b55436b6acf2bb58a7d4d888c6e76..1b08c4c0b20fd040bf2ff559bd3519b4bd2e24a5
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 43 checks have a proof that ran green at `HEAD` (`1b08c4c`) and one located assertion on the
check-defined value. Six findings are recorded under `## Findings`; none of them leaves a check
without a proof, and each says what it does and does not weaken.

## How the proofs were run

- One invocation for the whole target: `node --test --test-reporter=tap tests/events.test.mjs`,
  exit 0, `# tests 51`, `# pass 51`, `# fail 0`, `# skipped 0`, `# todo 0` (42 top-level tests
  plus the 9 subtests of the C13 test). Node v24.16.0.
- Each named test below appeared individually in that output as `ok <n> - <name>`; the number is
  given in the `Proof run` cell. No name pattern matched nothing: all 42 names in `checks.md`
  resolve to a `test('<name>'` declaration in `tests/events.test.mjs` (the line is the first line
  cited in each `Evidence` cell's test, e.g. `tests/events.test.mjs:98` for C1).
- The C13 proof was also run exactly as written
  (`--test-name-pattern="refused commands leave the log byte-identical"`): exit 0, `# tests 10`,
  the 9 subtests each `ok`, so the name filter does not drop the table-driven cases.
- `tests/events.test.mjs` is new in the diff range (633 lines added), so no proof resolves to a
  test the feature never touched.
- C40 and the second proof of C43 were run verbatim from `checks.md`.
- Working tree was clean before and after (`git status --porcelain` empty apart from this report).

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | every appended line is one JSON object with `v` 1, `at` in the ISO-ms-Z shape, string `event`/`feature`/`outcome`, `task` on all but `feature` | `node --test tests/events.test.mjs` exit 0 - `ok 1 - common fields on every event` | `tests/events.test.mjs:111` - `assert.equal(e.v, 1)`; `tests/events.test.mjs:112` - `assert.match(e.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)`; `tests/events.test.mjs:115` - `assert.equal(e.task, e.event === 'block' ? 'sample/task-02' : id)`; all 8 event types seen at `tests/events.test.mjs:118` | PASS |
| C2 | `claim` appends `claim`/`ok`, `attempt: 1`, `base_commit` = HEAD, `feature: "sample"` | same run - `ok 2 - claim event` | `tests/events.test.mjs:128` - `assert.equal(e.attempt, 1)`; `tests/events.test.mjs:129` - `assert.equal(e.base_commit, f.base)` | PASS |
| C3 | passing `check` appends `check`/`ok`, integer `duration_ms` >= 0, no `command` or `exit` | same run - `ok 3 - check ok event` | `tests/events.test.mjs:140` - `assert.ok(isCount(e.duration_ms))`; `tests/events.test.mjs:141` - `assert.ok(!Object.hasOwn(e, 'command'))` | PASS |
| C4 | `checks: ["exit 3"]` exits 1; last line `check`/`fail`, `command: "exit 3"`, `exit: 3`, `duration_ms` | same run - `ok 4 - check fail event` | `tests/events.test.mjs:149` - `f.office(1, 'check', id)`; `tests/events.test.mjs:153` - `assert.equal(e.command, 'exit 3')`; `tests/events.test.mjs:154` - `assert.equal(e.exit, 3)` | PASS |
| C5 | in-scope change appends `scope`/`ok`, `files: 1`, no `outside` | same run - `ok 5 - scope ok event` | `tests/events.test.mjs:166` - `assert.equal(e.files, 1)`; `tests/events.test.mjs:167` - `assert.ok(!Object.hasOwn(e, 'outside'))` | PASS |
| C6 | out-of-scope change exits 1; last line `scope`/`fail`, `files: 2`, `outside: 1` | same run - `ok 6 - scope fail event` | `tests/events.test.mjs:175` - `f.office(1, 'scope', id)`; `tests/events.test.mjs:179` - `assert.equal(e.files, 2)`; `tests/events.test.mjs:180` - `assert.equal(e.outside, 1)` | PASS |
| C7 | `review` appends `review`/`ok` | same run - `ok 7 - review event` | `tests/events.test.mjs:188` - `assert.equal(e.event, 'review')`; `tests/events.test.mjs:189` - `assert.equal(e.outcome, 'ok')` | PASS |
| C8 | `retry --reason "finding 1"` at attempt 1 of 3 appends `retry`/`ok`, `attempt: 2`, `reason` | same run - `ok 8 - retry ok event` | `tests/events.test.mjs:200` - `assert.equal(e.attempt, 2)`; `tests/events.test.mjs:201` - `assert.equal(e.reason, 'finding 1')` | PASS |
| C9 | `retry` at 3 of 3 exits 1, adds exactly one line `retry`/`exhausted`, `attempt: 3`, `reason`, no `block` event | same run - `ok 9 - retry exhausted event` | `tests/events.test.mjs:212` - `assert.equal(f.lines().length, before + 1)`; `tests/events.test.mjs:215` - `assert.equal(e.outcome, 'exhausted')`; `tests/events.test.mjs:218` - `assert.ok(!f.events().some((x) => x.event === 'block'))` | PASS |
| C10 | `done` appends `done`/`ok` with `commit` and `branch` equal to the task file's values | same run - `ok 10 - done event` | `tests/events.test.mjs:231` - `assert.equal(e.commit, field('commit'))`; `tests/events.test.mjs:232` - `assert.equal(e.branch, field('branch'))` | PASS |
| C11 | `block --reason "stuck"` appends `block`/`ok`, `reason`, `from: "in-progress"`; `from: "pending"` on a pending task | same run - `ok 11 - block event` | `tests/events.test.mjs:243` - `assert.equal(e.from, 'in-progress')`; `tests/events.test.mjs:248` - `assert.equal(e.from, 'pending')` | PASS |
| C12 | `feature new demo --type bug` appends `feature`/`ok`, `feature: "demo"`, `type: "bug"`, no `task` key | same run - `ok 12 - feature event` | `tests/events.test.mjs:259` - `assert.equal(e.type, 'bug')`; `tests/events.test.mjs:260` - `assert.ok(!Object.hasOwn(e, 'task'))` | PASS |
| C13 | each of nine refused commands exits 1 and leaves the log byte-identical | same run - `ok 13 - refused commands leave the log byte-identical` with 9 subtests each `ok`; also run alone by name pattern, exit 0, `# tests 10` | `tests/events.test.mjs:302` - `assert.equal(Object.keys(cases).length, 9)`; `tests/events.test.mjs:308` - `assert.match(f.office(1, ...args), why)`; `tests/events.test.mjs:309` - `assert.equal(f.log(), before)` | PASS |
| C14 | lifecycle yields exactly 10 lines in the named `event:outcome` order, growing by 1 per command | same run - `ok 14 - full lifecycle event sequence` | `tests/events.test.mjs:320` - `assert.equal(f.lines().length, count)`; `tests/events.test.mjs:323` - `assert.equal(seq(f.events()), 'claim:ok check:fail check:ok scope:ok review:ok retry:ok check:ok scope:ok review:ok done:ok')` | PASS |
| C15 | with the log tracked and carrying uncommitted appended lines, `review` exits 0 and `scope` reports `1 changed file` | same run - `ok 15 - log appends do not stale evidence` | `tests/events.test.mjs:334` - `assert.match(f.office(0, 'scope', id), /1 changed file/)`; `tests/events.test.mjs:336` - `assert.match(f.git('status', '--porcelain', LOG), /^M/)`; `tests/events.test.mjs:337` - `f.office(0, 'review', id)` | PASS |
| C16 | `stats --json` prints one JSON object with exactly `metrics` and `excluded`, exits 0, changes no fixture file, leaves no lock | same run - `ok 16 - stats json envelope` | `tests/events.test.mjs:357` - `assert.deepEqual(Object.keys(out).sort(), ['excluded', 'metrics'])`; `tests/events.test.mjs:358` - `assert.deepEqual(tree(s.root), before)`; `tests/events.test.mjs:359` - `assert.ok(!fs.existsSync(s.file('.the-office/execution.lock')))` | PASS |
| C17 | fixture `cycle_time_ms` is `{"n":4,"median":150000,"p90":600000}` | same run - `ok 17 - stats cycle time` | `tests/events.test.mjs:363` - `assert.deepEqual(stats(t).out.metrics.cycle_time_ms, { n: 4, median: 150000, p90: 600000 })` | PASS |
| C18 | odd `n` (60000, 120000, 180000): `median` 120000, `p90` 180000 | same run - `ok 18 - stats cycle time odd n` | `tests/events.test.mjs:377` - `assert.equal(cycle.median, 120000)`; `tests/events.test.mjs:378` - `assert.equal(cycle.p90, 180000)` | PASS |
| C19 | fixture `lead_time_ms` is `{"alpha":900000}`, `beta` omitted | same run - `ok 19 - stats lead time` | `tests/events.test.mjs:382` - `assert.deepEqual(stats(t).out.metrics.lead_time_ms, { alpha: 900000 })` | PASS |
| C20 | fixture `first_pass_check_rate` is `{"passed":3,"tasks":5,"rate":0.6}` | same run - `ok 20 - stats first-pass check rate` | `tests/events.test.mjs:386` - `assert.deepEqual(stats(t).out.metrics.first_pass_check_rate, { passed: 3, tasks: 5, rate: 0.6 })` | PASS |
| C21 | fixture `retries_per_task` is `{"retries":3,"tasks":6,"mean":0.5,"max":2}` | same run - `ok 21 - stats retries per task` | `tests/events.test.mjs:390` - `assert.deepEqual(stats(t).out.metrics.retries_per_task, { retries: 3, tasks: 6, mean: 0.5, max: 2 })` | PASS |
| C22 | fixture `escalation_rate` has `escalated: 2`, `tasks: 6`, `rate` 2/6 | same run - `ok 22 - stats escalation rate` | `tests/events.test.mjs:394` - `assert.deepEqual(stats(t).out.metrics.escalation_rate, { escalated: 2, tasks: 6, rate: 2 / 6 })` | PASS |
| C23 | fixture `excluded` is 1 | same run - `ok 23 - stats excluded count` | `tests/events.test.mjs:398` - `assert.equal(stats(t).out.excluded, 1)` | PASS |
| C24 | `stats beta --json` gives the six named values | same run - `ok 24 - stats feature filter` | `tests/events.test.mjs:402` - `assert.deepEqual(stats(t, 'beta').out, { metrics: { cycle_time_ms: NO_CYCLE, lead_time_ms: {}, first_pass_check_rate: { passed: 0, tasks: 1, rate: 0 }, retries_per_task: { retries: 2, tasks: 2, mean: 1, max: 2 }, escalation_rate: { escalated: 2, tasks: 2, rate: 1 } }, excluded: 0 })` (expression spans lines 402-411; `NO_CYCLE` is `{ n: 0, median: null, p90: null }` at `tests/events.test.mjs:344`) | PASS |
| C25 | board with tasks and no log: exit 0, nulls for `median`/`p90`/`rate`/`mean`, zeros for counts and `max` | same run - `ok 25 - stats with no log` | `tests/events.test.mjs:416` - `assert.ok(!fs.existsSync(s.file(LOG)))`; `tests/events.test.mjs:417` - `assert.deepEqual(JSON.parse(s.office(0, 'stats', '--json')).metrics, { cycle_time_ms: NO_CYCLE, lead_time_ms: {}, first_pass_check_rate: { passed: 0, tasks: 0, rate: null }, retries_per_task: { retries: 0, tasks: 0, mean: null, max: 0 }, escalation_rate: { escalated: 0, tasks: 0, rate: null } })` (lines 417-423) | PASS |
| C26 | removing the non-JSON line and the `run_start` line leaves `stats --json` output byte-identical | same run - `ok 26 - stats ignores unreadable and unknown lines` | `tests/events.test.mjs:433` - `assert.equal(all.length - kept.length, 2)`; `tests/events.test.mjs:437` - `assert.equal(after.stdout, before.stdout)`; the two lines are `tests/fixtures/stats/.the-office/events.jsonl:17` and `tests/fixtures/stats/.the-office/events.jsonl:30` | PASS |
| C27 | `stats` without `--json` exits 0, one row per metric (five), and a `1 task(s) excluded` line | same run - `ok 27 - stats table output` | `tests/events.test.mjs:446` - `assert.equal(rows.filter((row) => row.includes(metric)).length, 1)`; `tests/events.test.mjs:448` - `assert.match(r.stdout, /^.*1 task\(s\) excluded.*$/m)` | PASS |
| C28 | `help` contains `stats [feature] [--json]` | same run - `ok 28 - help lists stats` | `tests/events.test.mjs:453` - `assert.ok(s.office(0, 'help').includes('stats [feature] [--json]'))` | PASS |
| C29 | `stats` with no `.the-office/` in the directory or any parent exits 1 | same run - `ok 29 - stats with no board` | `tests/events.test.mjs:459` - `assert.ok(!fs.existsSync(path.join(d, '.the-office')))`; `tests/events.test.mjs:462` - `s.office(1, 'stats')` (exit asserted at `tests/events.test.mjs:24` - `assert.equal(r.status, want)`) | PASS |
| C30 | after `init`, `config.yml` contains the line `schema: 1` | same run - `ok 30 - init writes schema 1` | `tests/events.test.mjs:473` - `assert.ok(fs.readFileSync(s.file('.the-office/config.yml'), 'utf8').split('\n').includes('schema: 1'))` | PASS |
| C31 | on `schema: 99` each of 19 commands exits 1, stderr has `99`, `1`, `upgrade`, board files byte-identical | same run - `ok 31 - schema 99 is refused by every command` | `tests/events.test.mjs:484` - `assert.equal(commands.length, 19)`; `tests/events.test.mjs:489` - `assert.equal(r.status, 1)`; `tests/events.test.mjs:490` - `assert.match(r.stderr, /99/)`; `tests/events.test.mjs:492` - `assert.match(r.stderr, /upgrade/)`; `tests/events.test.mjs:493` - `assert.deepEqual(tree(f.file('.the-office')), before)` | PASS |
| C32 | on `schema: 99`, `help` and `version` exit 0 | same run - `ok 32 - help and version ignore the schema gate` | `tests/events.test.mjs:499` - `f.office(0, 'help')`; `tests/events.test.mjs:500` - `f.office(0, 'version')` | PASS |
| C33 | `schema` of `-1`, `abc`, `1.5`: `board` exits 1 with stderr containing the value | same run - `ok 33 - invalid schema values are refused` | `tests/events.test.mjs:508` - `assert.equal(r.status, 1)`; `tests/events.test.mjs:509` - `assert.ok(r.stderr.includes(value))` over `['-1', 'abc', '1.5']` at `tests/events.test.mjs:504` | PASS |
| C34 | config with `version: 0.1.0` and no `schema`: `board` and `claim` exit 0 | same run - `ok 34 - a board with no schema key works` | `tests/events.test.mjs:515` - `f.office(0, 'board')`; `tests/events.test.mjs:516` - `f.office(0, 'claim', id)` | PASS |
| C35 | `validate` prints `board schema 0, CLI schema 1` with no key and `board schema 1, CLI schema 1` on a fresh board | same run - `ok 35 - validate reports both schemas` | `tests/events.test.mjs:522` - `assert.ok(old.office(0, 'validate').includes('board schema 0, CLI schema 1'))`; `tests/events.test.mjs:525` - `assert.ok(fresh.office(0, 'validate').includes('board schema 1, CLI schema 1'))` | PASS |
| C36 | `config.yml` from `init` is byte-identical to the template after `{{VERSION}}` substitution | same run - `ok 36 - inline config equals the template` | `tests/events.test.mjs:534` - `assert.equal(fs.readFileSync(s.file('.the-office/config.yml'), 'utf8'), template.replaceAll('{{VERSION}}', version))` | PASS |
| C37 | `validate` exits 1 naming `events.jsonl:2` for `not json`, `[1]`, `{"v":1}` | same run - `ok 37 - validate rejects malformed log lines` | `tests/events.test.mjs:554` - `assert.ok(s.office(1, 'validate').includes('events.jsonl:2'), bad)` over the three values at `tests/events.test.mjs:551` | PASS |
| C38 | 32 state-by-event cells: exit 0 for the 12 legal, exit 1 with `events.jsonl:2` for the other 20 | same run - `ok 38 - validate enforces the transition table` | `tests/events.test.mjs:572` - `const out = s.office(ok ? 0 : 1, 'validate')`; `tests/events.test.mjs:573` - `assert.ok(out.includes('events.jsonl:2'))`; `tests/events.test.mjs:577` - `assert.equal(cells, 32)`; `tests/events.test.mjs:578` - `assert.equal(accepted, 12)`; legal table at `tests/events.test.mjs:560` matches the check's 12 cells | PASS |
| C39 | the C14 lifecycle log and each one-line log of a known task event make `validate` exit 0 | same run - `ok 39 - validate accepts a real lifecycle log` | `tests/events.test.mjs:585` - `f.office(0, 'validate')`; `tests/events.test.mjs:589` - `assert.ok(s.office(0, 'validate'), name)` over the 8 entries of `TASK_EVENTS` at `tests/events.test.mjs:544` | PASS |
| C40 | `tests/run.sh` validates this repository's own board and log and reports a named pass | `bash tests/run.sh 2>&1` piped to `grep -E "pass +this repository's own board and event log validate"` (verbatim from `checks.md`) exit 0 - printed `  pass  this repository's own board and event log validate` | `tests/run.sh:41` - `expect_exit 0 "this repository's own board and event log validate" "$ROOT" validate` | PASS |
| C41 | a `run_start` line between `claim` and `review` does not change `validate`'s exit 0 | same run - `ok 40 - validate skips unknown events` | `tests/events.test.mjs:596` - `s.office(0, 'validate')` (without the line); `tests/events.test.mjs:598` - `s.office(0, 'validate')` (with the line written at `tests/events.test.mjs:597`) | PASS |
| C42 | `init` creates a 0-byte log, leaves an existing log unchanged, creates or appends the union line once, keeps `*.png binary` | same run - `ok 41 - init prepares the log and gitattributes` | `tests/events.test.mjs:606` - `assert.equal(fs.statSync(absent.file(LOG)).size, 0)`; `tests/events.test.mjs:611` - `assert.equal(absent.log(), ev('claim') + newline)`; `tests/events.test.mjs:618` - `assert.ok(attrs.includes('*.png binary'))`; `tests/events.test.mjs:621` - `assert.equal(count(present), 1)` | PASS |
| C43 | every import in `office.mjs` is a `node:` module; RFC 0001 header and README row read `Implemented` | same run - `ok 42 - office.mjs imports only node modules`; second proof (the two chained `grep -q` commands, verbatim from `checks.md`) exit 0 | `tests/events.test.mjs:632` - `assert.ok(spec.startsWith('node:'))` with `tests/events.test.mjs:631` - `assert.ok(specifiers.length >= 5)`; the five imports are `payload/bin/office.mjs:12` to `payload/bin/office.mjs:16`; `docs/rfcs/0001-instrument.md:5` reads Status Implemented; `docs/rfcs/README.md:9` reads Implemented | PASS |

## Level and sampling

- Claims naming an exit code or an output shape (C4, C6, C9, C13, C16, C25, C27, C29, C31, C32,
  C33, C34, C35, C37, C38, C39, C41) all have proofs that run the CLI as a subprocess:
  `tests/events.test.mjs:20` spawns `payload/bin/office.mjs` and `tests/events.test.mjs:24`
  asserts the exit status. No level gap.
- Table-driven claims are proven on their full count, asserted in the test: 9 refusals
  (`tests/events.test.mjs:302`), 19 gated commands (`tests/events.test.mjs:484`), 32 transition
  cells with 12 accepted (`tests/events.test.mjs:577`, `tests/events.test.mjs:578`), 3 invalid
  schema values (`tests/events.test.mjs:504`), 3 malformed lines (`tests/events.test.mjs:551`).
- The 19 commands of C31 are the whole top-level command set other than `help` and `version`:
  the `cmds.<name> =` declarations in `payload/bin/office.mjs` are `init`, `board`, `next`,
  `claim`, `retry`, `review`, `done`, `block`, `check`, `scope`, `validate`, `stats`, `audit`,
  `pack`, `findings`, `spec`, `feature`, `task`, `capabilities`, plus `version` and `help`.

## Swept rows that resolve to existing

- concurrency - "`execution.lock` in the dispatcher already serialises all eight writing
  commands": present. `payload/bin/office.mjs:1414` takes the lock for `claim`, `retry`,
  `review`, `done`, `block`, `check`, `scope`, `feature`, `task` (and `spec approve`), which
  covers the eight commands that call `logEvent`; `payload/bin/office.mjs:1420` is the refusal.
  The lock-held member of C13 observes it at `tests/events.test.mjs:279` to
  `tests/events.test.mjs:283`. `stats` is not in that list, matching "takes no lock".
- All other `Swept` rows cite checks or are `n/a`.

## Steps that did not run

Profile is `light`: fault injection, the `Coverage` recompute and the binding-sources comparison
do not run, and `checks.md` carries no `Test policy` section. No section is written for them.
Consequence, stated once: nothing here shows that these tests would fail under a wrong
implementation; the findings below name the two places where that is visibly the case.

## Findings

None of these changes a `Result`. Ranked by how much they weaken what the report proves.

1. C16, weak assertion - `tests/events.test.mjs:359` checks that no `execution.lock` exists
   after `stats` exits, but the dispatcher removes its own lock on exit
   (`payload/bin/office.mjs:1425`), so the assertion would also pass if `stats` took the lock.
   AC 16's "taking no lock" is therefore not observed by the test. Checked by hand instead:
   with `execution.lock` already present in a copy of the stats fixture, `office stats --json`
   exited 0, and `stats` is absent from the lock list at `payload/bin/office.mjs:1414`. The
   behaviour holds; the test does not pin it.
2. C40, vacuous half of the claim - the check says `tests/run.sh` validates "this repository's
   own board and log", but this repository has no `.the-office/events.jsonl` and no task files
   (tracked board files are `config.yml`, `findings.jsonl`, `harness.md`), so
   `tests/run.sh:41` validates zero log lines and zero tasks at `HEAD`. AC 39 only requires
   that `validate` is run and fails the suite on non-zero, which holds; the RFC test-plan line
   "validates every line of this repository's own log" is true of an empty set. Consistent
   with the plan's unconfirmed assumption that this board stays at schema 0.
3. C31, precision gap - AC 29 says "changing no file"; the check narrows that to "every file
   under the board" and the test snapshots only `.the-office/`
   (`tests/events.test.mjs:485`, `tests/events.test.mjs:493`). `.gitattributes` at the repo
   root (written by `init --force`) and the evidence under `.git/office-verification` are
   outside the snapshot. The gate runs before any handler (`payload/bin/office.mjs:1408` to
   `payload/bin/office.mjs:1411`), so nothing is written in practice; the test would not
   notice if `init --force` started writing `.gitattributes` before the gate.
4. C1, sampling of "every line" - the test covers all 8 event types
   (`tests/events.test.mjs:118`) and the `check:fail` outcome, but its 12 lines contain no
   `scope:fail` and no `retry:exhausted` line, so `v` and the `at` format are not asserted on
   those two line shapes. Their `event` and `outcome` are asserted in C6 and C9
   (`tests/events.test.mjs:177`, `tests/events.test.mjs:215`). The check enumerates over event
   types, not outcomes, so this is a gap in how the check defines its population, not a miss
   against it. All lines are built by one function, `payload/bin/office.mjs:526`.
5. C13, note on "byte-identical" - in three of the nine cases (`done` on a pending task, `claim`
   with a dirty tree, `claim` with an uncompleted dependency) no log exists before the refused
   command, so `tests/events.test.mjs:309` compares `null` with `null`. That still fails if the
   refused command creates the file, so the claim holds; it is "still absent", not a byte
   comparison.
6. C2, expected value not literal at the assertion - `tests/events.test.mjs:129` compares
   against `f.base`, which is `git rev-parse HEAD` taken in the fixture helper at
   `tests/events.test.mjs:56`. One hop, same file; noted because the procedure asks for it.

## Gate

`bash tests/run.sh` - 50 passed, 0 failed
