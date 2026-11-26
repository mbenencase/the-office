# Headless runs checks

Profile: light
Plan: `.specs/features/headless-run/plan.md`

74 checks in 5 slices · 6 one-way doors · 2 open, of which 0 block (1 blocks go-live)

Every proof is one named test in `tests/run.test.mjs` (new; it joins the `node --test` line in
`tests/run.sh`), run as `node --test --test-name-pattern="<name>" tests/run.test.mjs`, except the
shell proofs written out in full. Tests run the CLI as a subprocess in a temp Git repo, like
`tests/events.test.mjs`.

**The stub runtime.** `tests/stub-runtime.mjs` (new) is the executable `OFFICE_RUNTIME_CMD` points
at. Per invocation it appends its full argv and its cwd to a record file the test reads, performs
the board transitions its scenario scripts for that role **by calling the real CLI**
(`feature new`, writing the spec and task files, `claim`, `check`, `scope`, `review`, `done`,
`retry`, `block`, committing with Git), and prints one JSON object in the runtime's shape. Unless a
scenario says otherwise, every invocation prints `is_error: false`, a `result` string, and
`modelUsage` = `{"stub-a":{"inputTokens":100,"outputTokens":10,"cacheReadInputTokens":5,"cacheCreationInputTokens":2,"costUSD":0.01}}`.
The default scenario ("happy feature") is: Judge prints `route: feature` and
`feature_slug: greeting`; Product Owner creates a valid spec with no open questions; Planner
creates two tasks, `greeting/task-01` tier `fast` and `greeting/task-02` tier `standard` depending
on task-01; Devil's Advocate prints `verdict: approved`; each SWE claims, changes a file in scope,
commits, checks, scopes and moves to `review`; the Reviewer marks `done`. Scenarios named below
change one thing from that. How the stub is told its scenario is the builder's choice.

"Events of the run" means the lines of `.the-office/events.jsonl` whose `run` equals the run id.

## Checks

### S1 - `office run` drives a request to a finished board · ~4 files · ~90 KB · ~23k · complete

**C1** - In the happy feature scenario with both approvals `auto`, `office run "add a greeting" --json` exits 0, both tasks have `status: completed`, and the runtime was invoked for exactly this role sequence: `office-judge`, `office-product-owner`, `office-planner`, `office-devils-advocate`, `office-swe-fast`, `office-reviewer`, `office-swe`, `office-reviewer` (AC 7, 10, 11, 16)
Proof: `node --test --test-name-pattern="happy feature run completes the board" tests/run.test.mjs`

**C2** - The first event of the run is `run_start` with `run` matching `^r-\d{8}T\d{9}Z$`, `request_hash` equal to the SHA-256 hex of `add a greeting`, `runtime: "claude"`, `outcome: "ok"`, `v: 1`; and the string `add a greeting` occurs in no file under `.the-office/` (AC 1)
Proof: `node --test --test-name-pattern="run_start event and no stored request" tests/run.test.mjs`

**C3** - Every recorded stub argv is exactly `-p`, `<prompt>`, `--agent`, `<role>`, `--output-format`, `json`, `--permission-mode`, `acceptEdits` in that order with nothing after, and every recorded cwd is the board root (AC 2)
Proof: `node --test --test-name-pattern="runtime argv and cwd" tests/run.test.mjs`

**C4** - With `run.permission_mode: plan` and `run.allowed_tools: ["Read", "Bash(git diff *)"]` in `config.yml`, every recorded argv has `plan` after `--permission-mode` and ends with `--allowedTools`, `Read`, `Bash(git diff *)` as three separate arguments (AC 2, 3)
Proof: `node --test --test-name-pattern="permission mode and allowed tools pass through" tests/run.test.mjs`

**C5** - With `OFFICE_RUNTIME_CMD` unset and a `PATH` whose only `claude` is a script that writes a marker file and prints a valid result, `office run` executes that script (the marker exists); with `OFFICE_RUNTIME_CMD` set to the stub, the marker is not written (AC 4)
Proof: `node --test --test-name-pattern="OFFICE_RUNTIME_CMD overrides claude" tests/run.test.mjs`

**C6** - When the Judge prints `feature_slug: greeting` and no `--feature` is given, the spec step's prompt contains `greeting` and the feature directory checked is `greeting`; with `--feature salute`, the Product Owner's prompt contains `salute` and not `greeting`, and the `run_end` event has `feature: "salute"` (AC 5)
Proof: `node --test --test-name-pattern="route and slug come from the judge or --feature" tests/run.test.mjs`

**C7** - The Product Owner's recorded prompt contains the request text `add a greeting` verbatim and the slug (AC 6)
Proof: `node --test --test-name-pattern="spec step prompt carries request and slug" tests/run.test.mjs`

**C8** - When the Product Owner returns without a spec that passes `office spec validate greeting` on its first invocation and with one on its second, the run proceeds, and the events of the run hold two `office-product-owner` steps with outcomes `unmet` then `ok` (AC 6, 18)
Proof: `node --test --test-name-pattern="unmet step is retried once" tests/run.test.mjs`

**C9** - When the Product Owner never produces a valid spec, it is invoked exactly twice, the last event is `run_end` with `outcome: "failed"`, and the exit code is 1 (AC 19)
Proof: `node --test --test-name-pattern="step unmet twice fails the run" tests/run.test.mjs`

**C10** - When the Judge's result has no `route:` line, or a `route: other` line, or `route: feature` with no `feature_slug:` line and no `--feature`, the Judge step is recorded `unmet` and invoked a second time (AC 5, 18)
Proof: `node --test --test-name-pattern="unusable judge output is unmet" tests/run.test.mjs`

**C11** - With `caps.plan_iterations: 3` and a Devil's Advocate that prints `verdict: rejected` on the first pass and `verdict: approved` on the second, the role sequence between gate 1 and the first SWE is `office-planner`, `office-devils-advocate`, `office-planner`, `office-devils-advocate` (AC 7)
Proof: `node --test --test-name-pattern="plan loop repeats until approved" tests/run.test.mjs`

**C12** - With `caps.plan_iterations: 2` and a Devil's Advocate that always prints `verdict: rejected`, the Planner and the Devil's Advocate are each invoked exactly twice, no SWE is invoked, `run_end` has `outcome: "blocked"`, and the exit code is 10 (AC 9)
Proof: `node --test --test-name-pattern="plan that does not converge is blocked" tests/run.test.mjs`

**C13** - When the Devil's Advocate prints `verdict: approved` but the Planner left a task with empty `checks` (so `office validate` fails), the plan is not treated as converged: no gate 2 approval is written and no SWE is invoked (AC 7)
Proof: `node --test --test-name-pattern="approved verdict does not override a failing validate" tests/run.test.mjs`

**C14** - When the Judge prints `route: trivial` and the Planner creates one task, with `approvals.spec: auto` and `approvals.plan: human` the run exits 0, `office-devils-advocate` is never invoked, no `plan-approval.json` exists, and no `approve` event has `gate: "plan"` (AC 8)
Proof: `node --test --test-name-pattern="trivial route skips the devil's advocate and gate 2" tests/run.test.mjs`

**C15** - The SWE role invoked for a task of tier `fast` is `office-swe-fast`, for `standard` is `office-swe`, for `deep` is `office-swe-deep`, and a task with the lower `task_no` whose dependencies are complete runs first (AC 10)
Proof: `node --test --test-name-pattern="swe role by tier in task order" tests/run.test.mjs`

**C16** - When the Reviewer sends `greeting/task-01` back with `office retry` once and marks it done on the second pass, the roles invoked for that task are SWE, Reviewer, SWE, Reviewer and the task ends `completed` (AC 11, 12)
Proof: `node --test --test-name-pattern="reviewer retry re-invokes the swe" tests/run.test.mjs`

**C17** - With `caps.review_iterations: 2`, `max_attempts: 5` on the task and a Reviewer that always retries, the SWE and the Reviewer are each invoked exactly twice for that task, the task ends `blocked`, and the log holds a `block` event for it with `reason: "review_iterations exhausted"` and `from: "in-progress"` (AC 13)
Proof: `node --test --test-name-pattern="review iterations exhausted blocks the task" tests/run.test.mjs`

**C18** - With three tasks where task-02 depends on task-01, task-03 depends on nothing, and the SWE blocks task-01: task-03 is still driven to `completed`, task-02 is never claimed, `run_end` has `outcome: "blocked"` and the exit code is 10 (AC 14, 52)
Proof: `node --test --test-name-pattern="a blocked task does not stop independent tasks" tests/run.test.mjs`

**C19** - When the findings ledger holds a class at the recurrence threshold at the end of a completed board, `office-janitor` is invoked exactly once, after the last Reviewer and before `run_end`; when no class recurs it is never invoked (AC 15)
Proof: `node --test --test-name-pattern="janitor runs only when a class recurs" tests/run.test.mjs`

**C20** - In the happy feature run, the events of the run hold exactly 8 `step` events, one per runtime invocation in invocation order; each has `run`, `role`, `outcome: "ok"`, an integer `duration_ms` >= 0 and a `usage` object; the Judge's has no `feature` and no `task`; the four SWE and Reviewer steps have `task` equal to their task id; the Product Owner, Planner and Devil's Advocate steps have `feature: "greeting"` and no `task` (AC 17)
Proof: `node --test --test-name-pattern="one step event per invocation" tests/run.test.mjs`

**C21** - For each of these four stub behaviours on the Planner step - exits 3; prints `not json`; prints a result with `is_error: true`; prints a result with no `modelUsage` key - the Planner is invoked exactly once, its step is recorded `crashed`, stderr names the cause (the exit code `3`, `JSON`, `is_error`, `modelUsage` respectively), `run_end` has `outcome: "failed"`, and the exit code is 1 (AC 20)
Proof: `node --test --test-name-pattern="crashed step fails the run without retry" tests/run.test.mjs`

**C22** - With `--step-timeout 1` replaced for the test by the smallest value the CLI accepts and a stub that sleeps past it on the Planner step: the stub process is no longer running when `office run` returns, the step is recorded `timeout`, `run_end` has `outcome: "failed"`, and the exit code is 1. The builder may expose the timeout in milliseconds through an environment variable for this test only if `--step-timeout` itself stays in whole minutes with default `30`; the default is asserted from the usage text (AC 21)
Proof: `node --test --test-name-pattern="timed-out step is killed and fails the run" tests/run.test.mjs`

**C23** - With `--max-steps 3` in the happy feature scenario, the runtime is invoked exactly 3 times, `run_end` has `outcome: "failed"`, the exit code is 1; the usage text states the default `100` (AC 22)
Proof: `node --test --test-name-pattern="max-steps stops the run" tests/run.test.mjs`

**C24** - With `OFFICE_RUNTIME_CMD=/nonexistent/runtime`, `office run "x"` exits 1, stderr contains `/nonexistent/runtime`, and `events.jsonl` is byte-identical (AC 23)
Proof: `node --test --test-name-pattern="missing runtime executable" tests/run.test.mjs`

**C25** - On the `tests/fixtures/dup-id` board, `office run "x"` exits 1, the stub is never invoked, and no `events.jsonl` line is added (AC 24)
Proof: `node --test --test-name-pattern="invalid board refuses to start" tests/run.test.mjs`

**C26** - With a pre-existing `.the-office/run.lock`, `office run "x"` exits 1, stderr contains `run.lock`, the stub is never invoked, `events.jsonl` is byte-identical and the lock file still exists with its original content (AC 25)
Proof: `node --test --test-name-pattern="existing run lock refuses a second run" tests/run.test.mjs`

**C27** - During every stub invocation of the happy feature run, `.the-office/run.lock` exists and `.the-office/execution.lock` does not; `run.lock` is absent after a run that exits 0, after one that exits 1 (crashed step), after one that exits 10 and after one that exits 11 (AC 26)
Proof: `node --test --test-name-pattern="run lock lifecycle" tests/run.test.mjs`

**C28** - Each of these eight invocations exits 2 with usage on stderr and leaves `events.jsonl` byte-identical and the stub uninvoked: `run` with no arguments; `run "x" --resume`; `run "x" --bogus`; `run "x" --step-timeout 0`; `run "x" --step-timeout abc`; `run "x" --max-steps -1`; `run "x" --feature Bad_Slug`; `run "x" --feature sample` on a board where feature `sample` exists (AC 27)
Proof: `node --test --test-name-pattern="usage errors exit 2" tests/run.test.mjs`

### S2 - gates are a policy the supervisor applies and records · ~3 files · ~75 KB · ~19k · complete

**C29** - On a board whose `config.yml` has no `approvals:` key and the default `gates:`, the happy feature run stops after the Product Owner with exit 11 (gate 1 is `human`) (AC 28)
Proof: `node --test --test-name-pattern="default policy is human" tests/run.test.mjs`

**C30** - Table over (`approvals.spec`, `gates.after_po_clarification`) -> gate 1 policy: (absent, `true`) human; (absent, `false`) auto; (`human`, `false`) human; (`auto`, `true`) auto - observed as exit 11 after the Product Owner versus a written `spec-approval.json` with `mode: "policy"`; and the same four rows for (`approvals.plan`, `gates.after_plan_converges`) at gate 2 (AC 29)
Proof: `node --test --test-name-pattern="approvals win over gates" tests/run.test.mjs`

**C31** - At gate 1 with policy `human` and no approval: stdout or stderr contains `office spec approve greeting --hash <the current spec hash> --by`, the last event is `run_end` with `outcome: "awaiting_approval"`, the exit code is 11, and no `spec-approval.json` exists (AC 31)
Proof: `node --test --test-name-pattern="gate 1 human stops with exit 11" tests/run.test.mjs`

**C32** - At gate 2 with `approvals.spec: auto`, `approvals.plan: human` and no plan approval: the output contains `office plan approve greeting --hash <the current plan hash> --by`, the last event is `run_end` with `outcome: "awaiting_approval"`, the exit code is 11, no `plan-approval.json` exists and no SWE was invoked (AC 32)
Proof: `node --test --test-name-pattern="gate 2 human stops with exit 11" tests/run.test.mjs`

**C33** - At gate 1 with policy `auto`: `spec-approval.json` holds `hash` equal to the spec hash, `by: "policy:auto"`, `mode: "policy"` and an ISO UTC `at`; the log holds one `approve` event with `gate: "spec"`, `by: "policy:auto"`, `mode: "policy"`, `hash` equal to the spec hash, `feature: "greeting"`, `outcome: "ok"` (AC 33)
Proof: `node --test --test-name-pattern="gate 1 auto approval" tests/run.test.mjs`

**C34** - At gate 2 with policy `auto`: `plan-approval.json` holds `hash` equal to the hash `office plan status greeting` prints, `by: "policy:auto"`, `mode: "policy"`, `at`; the log holds one `approve` event with `gate: "plan"`, `mode: "policy"` and that hash (AC 34)
Proof: `node --test --test-name-pattern="gate 2 auto approval" tests/run.test.mjs`

**C35** - With `approvals.spec: human` and a `spec-approval.json` already carrying the current hash (written by `office spec approve ... --by ana`), a resumed run passes gate 1, the file is byte-identical afterwards and the run adds no `approve` event with `gate: "spec"` (AC 30)
Proof: `node --test --test-name-pattern="matching approval is not rewritten" tests/run.test.mjs`

**C36** - With `approvals.spec: auto` and a `spec-approval.json` whose `hash` differs from the current spec hash, the run rewrites it with the current hash and `mode: "policy"` (AC 33, stale member)
Proof: `node --test --test-name-pattern="stale approval is replaced under auto" tests/run.test.mjs`

**C37** - When the Product Owner leaves `open_questions: ["Which locale?"]` in an otherwise valid spec, with `approvals.spec: auto`: the output contains `Which locale?`, no `spec-approval.json` exists, `run_end` has `outcome: "blocked"`, the exit code is 10; and `office run --resume` on that board exits 10 again with the same question printed (AC 35)
Proof: `node --test --test-name-pattern="open questions block the run" tests/run.test.mjs`

**C38** - When the Judge prints `route: harness`, the runtime is invoked exactly once, the output contains `/office`, `run_end` has `outcome: "awaiting_approval"` and `route: "harness"`, and the exit code is 11 - with both approvals `auto` (AC 36)
Proof: `node --test --test-name-pattern="harness route stops at exit 11" tests/run.test.mjs`

**C39** - `office spec approve <slug> --hash <hash> --by ana` writes `mode: "human"` to `spec-approval.json`, appends exactly one line, an `approve` event with `gate: "spec"`, `mode: "human"`, `by: "ana"`, `hash` equal to the file's, `feature` equal to the slug, and its stdout is the same JSON status line as before (keys `id`, `type`, `hash`, `status`, `open_questions`) (AC 37)
Proof: `node --test --test-name-pattern="spec approve records mode human" tests/run.test.mjs`

**C40** - `office plan approve <slug> --hash <current> --by ana` on a feature whose plan validates exits 0, writes `plan-approval.json` with `hash`, `by: "ana"`, an ISO UTC `at`, `mode: "human"`, and appends exactly one `approve` event with `gate: "plan"`, `mode: "human"`, `by: "ana"` and that hash (AC 38)
Proof: `node --test --test-name-pattern="plan approve writes the approval" tests/run.test.mjs`

**C41** - Each of these exits 1 and leaves no `plan-approval.json` and `events.jsonl` byte-identical: `plan approve` with `--hash deadbeef`; with `--by ""`; with no `--by`; on a feature whose plan fails `office spec validate <slug> --plan`; `plan bogus <slug>` (AC 39)
Proof: `node --test --test-name-pattern="plan approve refusals" tests/run.test.mjs`

**C42** - `office spec approve <slug> --hash <current> --by policy:auto` and `office plan approve <slug> --hash <current> --by policy:x` each exit 1, write no approval file and leave `events.jsonl` byte-identical (AC 40)
Proof: `node --test --test-name-pattern="command line refuses policy as approver" tests/run.test.mjs`

**C43** - `office plan status <slug>` prints one JSON object with `id` equal to the slug, a 64-hex `hash`, `tasks` equal to the number of task files, and `status` `draft` before any approval, `approved` after `plan approve` with the current hash, `stale` after a task's `dod` is then edited; exit 0 each time; exit 1 for a feature that does not exist (AC 41)
Proof: `node --test --test-name-pattern="plan status" tests/run.test.mjs`

**C44** - The plan hash printed by `office plan status` is identical after each of: changing a task's `status`, `attempts`, `base_commit`, `branch`, `commit`, or its body text; and differs from the original after each of: changing `id`+filename consistently, `title`, `tier`, `depends_on`, `scope`, `checks`, `dod`, `max_attempts`, `requirements`, `acceptance_criteria`, `verification_mode` on one task, adding a task, removing a task (AC 42)
Proof: `node --test --test-name-pattern="plan hash covers the contract only" tests/run.test.mjs`

**C45** - `office validate` exits 1 with output naming the key and the value for each of: `approvals.harness: auto`; `approvals.spec: maybe`; `approvals.plan: yes`; `run.runtime: codex`; `run.allowed_tools: Read` (a scalar); and exits 0 with `approvals` `spec: auto`, `plan: auto`, `harness: human` and `run.runtime: claude` (AC 43)
Proof: `node --test --test-name-pattern="validate rejects invalid approvals and run config" tests/run.test.mjs`

**C46** - `payload/agents/office-product-owner.md` contains the word `headless`, names `Assumptions` and `open_questions` in that rule, and states it never calls `office spec approve` in a headless run (AC 44)
Proof: `node --test --test-name-pattern="product owner prompt carries the headless rule" tests/run.test.mjs`

### S3 - `--resume` continues from the board · ~2 files · ~70 KB · ~18k · complete

**C47** - After a run that stopped at gate 1 with exit 11, `office spec approve` with the printed hash, then `office run --resume --json` (no `--feature`): exit 0, both tasks `completed`, and in the resumed run neither `office-judge` nor `office-product-owner` is invoked (AC 45, 47, 51)
Proof: `node --test --test-name-pattern="resume after gate 1 approval completes the board" tests/run.test.mjs`

**C48** - After a run that stopped at gate 2 with exit 11, `office plan approve` with the printed hash, then `office run --resume`: exit 0, and the resumed run invokes neither `office-planner` nor `office-devils-advocate` (AC 49, 51)
Proof: `node --test --test-name-pattern="resume after gate 2 approval completes the board" tests/run.test.mjs`

**C49** - The resumed run's first event is `run_start` with a `run` id different from the first run's, `request_hash: null` and `feature: "greeting"` (AC 47)
Proof: `node --test --test-name-pattern="resume run_start" tests/run.test.mjs`

**C50** - With two features on the board and a log whose last `run_end` carrying a `feature` names `alpha`, the `step` events of `office run --resume` carry only `alpha/` task ids; those of `office run --resume --feature beta` carry only `beta/` task ids (AC 45)
Proof: `node --test --test-name-pattern="resume picks its feature" tests/run.test.mjs`

**C51** - When the prior `run_end` of the feature has `route: "trivial"`, a resume with `approvals.plan: human`, an approved spec, existing tasks and no `plan-approval.json` proceeds to the tasks and exits 0; with no prior `run_end` for the feature (`--resume --feature greeting` on a hand-built board) the same state stops at gate 2 with exit 11 (AC 45, 49)
Proof: `node --test --test-name-pattern="resume recovers the route" tests/run.test.mjs`

**C52** - `office run --resume` on a board with no `run_end` event and no `--feature` exits 2; `office run --resume --feature ghost` (no such directory) exits 2; neither appends an event nor invokes the stub (AC 46)
Proof: `node --test --test-name-pattern="resume with nothing to resume" tests/run.test.mjs`

**C53** - `office run --resume --feature greeting` on a feature whose `overview.md` fails `office spec validate` appends `run_start` and `run_end` with `outcome: "failed"`, invokes no role, and exits 1 (AC 48)
Proof: `node --test --test-name-pattern="resume on an invalid spec fails" tests/run.test.mjs`

**C54** - On a resume with an approved spec and no task files, route `feature`: the first role invoked is `office-planner` (AC 49)
Proof: `node --test --test-name-pattern="resume plans when there are no tasks" tests/run.test.mjs`

**C55** - On a resume where `greeting/task-02` is `in-progress` and task-01 is `completed`, the first role invoked is `office-swe` with `task` `greeting/task-02`; on a resume where it is `review`, the first role invoked is `office-reviewer` for it (AC 50)
Proof: `node --test --test-name-pattern="resume continues work in flight" tests/run.test.mjs`

**C73** - With both approvals `auto`, `caps.plan_iterations: 2` and a Devil's Advocate that always prints `verdict: rejected`: the first run exits 10; `office run --resume` then invokes exactly `office-devils-advocate`, `office-planner`, `office-devils-advocate` in that order, exits 10 with `run_end` outcome `blocked`, and no `plan-approval.json` and no `approve` event with `gate: "plan"` exist (AC 71; added after verification round 1, at the user's request)
Proof: `node --test --test-name-pattern="resume does not auto-approve a rejected plan" tests/run.test.mjs`

**C74** - With both approvals `auto`, `caps.plan_iterations: 2` and a Devil's Advocate that prints `rejected`, `rejected`, then `approved`: the first run exits 10; `office run --resume` invokes `office-devils-advocate` first and `office-swe-fast` second, never `office-planner`, exits 0 with `greeting/task-01` `completed`, and `plan-approval.json` holds `mode: "policy"` and the hash `office plan status greeting` prints (AC 71)
Proof: `node --test --test-name-pattern="resume re-reviews an unapproved plan under auto" tests/run.test.mjs`

### S4 - the ending and the cost are readable by a script · ~5 files · ~95 KB · ~24k · complete

**C56** - Each ending has its exit code and exactly one `run_end` for its run id with the matching `outcome`: completed board 0 / `completed`; crashed step 1 / `failed`; blocked task with nothing ready 10 / `blocked`; unapproved human gate 11 / `awaiting_approval`; and `run_end` carries `feature: "greeting"` and `route: "feature"` in the three endings where the Judge returned (AC 52, 53)
Proof: `node --test --test-name-pattern="five endings five exit codes" tests/run.test.mjs`

**C57** - With `--json`, stdout of the happy feature run parses as exactly one JSON object whose keys are exactly `run`, `outcome`, `duration_ms`, `tasks`, `usage`; `run` equals the `run_start` id, `outcome` is `completed`, `duration_ms` is an integer >= 0, and stderr has at least 8 non-empty lines (AC 54)
Proof: `node --test --test-name-pattern="json report envelope" tests/run.test.mjs`

**C58** - With `--report out.json`, the file parses to the same object as `--json` stdout in the same run; it is also written, with `outcome` `failed`, `blocked` and `awaiting_approval` respectively, for a crashed-step run, a blocked run and a human-gate run; and it is not created by a usage error (AC 55)
Proof: `node --test --test-name-pattern="report file for every outcome" tests/run.test.mjs`

**C59** - When a stub invocation prints `modelUsage` with two models, `stub-a` `{inputTokens:100,outputTokens:10,cacheReadInputTokens:5,cacheCreationInputTokens:2,costUSD:0.01}` and `stub-b` `{inputTokens:1000,outputTokens:200,cacheReadInputTokens:50,cacheCreationInputTokens:20,costUSD:0.5}`, that step's `usage` deep-equals `{"input":1100,"output":210,"cache_read":55,"cache_write":22,"cost_usd":0.51,"by_model":{"stub-a":{"input":100,"output":10,"cache_read":5,"cache_write":2,"cost_usd":0.01},"stub-b":{"input":1000,"output":200,"cache_read":50,"cache_write":20,"cost_usd":0.5}}}` (`cost_usd` compared to 1e-9) (AC 56)
Proof: `node --test --test-name-pattern="step usage from modelUsage" tests/run.test.mjs`

**C60** - In the happy feature run (8 invocations, each `stub-a` 100/10/5/2/0.01), the report's `usage.by_role` has exactly the keys `office-judge`, `office-product-owner`, `office-planner`, `office-devils-advocate`, `office-swe-fast`, `office-swe`, `office-reviewer`; `office-reviewer` is `{"input":200,"output":20,"cache_read":10,"cache_write":4,"cost_usd":0.02}` and each other role `{"input":100,"output":10,"cache_read":5,"cache_write":2,"cost_usd":0.01}`; `usage.by_model` is `{"stub-a":{"input":800,"output":80,"cache_read":40,"cache_write":16,"cost_usd":0.08}}`; `usage.total` equals that `stub-a` entry (`cost_usd` compared to 1e-9) (AC 57)
Proof: `node --test --test-name-pattern="report usage by role, model and total" tests/run.test.mjs`

**C61** - In a run whose Planner step crashed with no `modelUsage`, that step's `usage` is `null`, `by_role` still lists `office-planner` with all five values `0`, and `total` equals the sum of the other steps (AC 57, 17)
Proof: `node --test --test-name-pattern="a step with no usage adds nothing" tests/run.test.mjs`

**C62** - The report's `tasks` is `{"completed":2,"blocked":0}` for the happy run, `{"completed":1,"blocked":1}` for the C18 scenario, and `{"completed":0,"blocked":0}` for a run that failed on the Judge step (AC 58)
Proof: `node --test --test-name-pattern="report task counts" tests/run.test.mjs`

**C63** - Recomputing `outcome`, `usage.by_role`, `usage.by_model` and `usage.total` in the test from the `run_start`, `step` and `run_end` events of the run id alone yields values deep-equal to the printed report, for the happy run and for a resumed run sharing the log with the run before it (the first run's steps are not counted) (AC 59)
Proof: `node --test --test-name-pattern="report is derivable from the log" tests/run.test.mjs`

**C64** - Without `--json`, stdout of the happy run contains `completed` and one line per role naming each of the seven roles, and does not parse as JSON (AC 60)
Proof: `node --test --test-name-pattern="human-readable summary" tests/run.test.mjs`

**C65** - `office next` exits 0 and prints `sample/task-01` on the `good` fixture; exits 12 when a task is `in-progress` and again when one is `review`; exits 10 when no task is ready, none is in flight and one is `blocked`; exits 3 when every task is `completed` and on a board with no tasks; exits 12, not 10, when one task is `blocked` and another `in-progress`; and exits 0 when one task is `blocked` and an independent one is ready (AC 61)
Proof: `node --test --test-name-pattern="next exit codes" tests/run.test.mjs`

**C66** - Appending one each of the door-1 literal `run_start`, `step` (with `task: "alpha/task-01"`, `feature: "alpha"`), `approve` and `run_end` lines to the `tests/fixtures/stats` log leaves `office stats --json` and `office stats alpha --json` byte-identical, and `office validate` on a board whose log is the happy run's exits 0 (AC 62)
Proof: `node --test --test-name-pattern="run events do not disturb stats or validate" tests/run.test.mjs`

**C67** - `office help` output contains `run "<request>"`, `--resume`, `plan approve|status`, the codes `3`, `10` and `12` on the `next` line or the lines directly under it, the sentence `Nothing here asks a model to decide anything.`, and does not contain `Nothing here uses a model` (AC 63)
Proof: `node --test --test-name-pattern="help lists run, plan and the new footer" tests/run.test.mjs`

**C68** - Every `import` in `payload/bin/office.mjs` names a `node:` module (AC 64)
Proof: `node --test --test-name-pattern="office.mjs imports only node modules" tests/events.test.mjs`

**C69** - The `config.yml` written by `office init` parses to `run` = `{runtime: "claude", permission_mode: "acceptEdits", allowed_tools: []}` and `approvals` = `{spec: "human", plan: "human", harness: "human"}`, and is byte-identical to `templates/config.yml.tmpl` with `{{VERSION}}` replaced by the contents of `VERSION` (AC 65)
Proof: `node --test --test-name-pattern="init writes run and approvals" tests/run.test.mjs`
Proof: `node --test --test-name-pattern="inline config equals the template" tests/events.test.mjs`

**C70** - No line under `payload/` or in `README.md` matches `next.*exit 1` (case-insensitive) or `exits 1.*(in flight|blocked|complete)`, and `payload/commands/office-next.md` contains each of `3`, `10` and `12` as an exit code beside its meaning (AC 66)
Proof: `! grep -rniE "next.*exit 1|exits 1.*(in flight|blocked|complete)" payload README.md && grep -qE "\b12\b" payload/commands/office-next.md && grep -qE "\b10\b" payload/commands/office-next.md && grep -qE "exits? 3|\b3\b.*(complete|empty)" payload/commands/office-next.md`

### S5 - the headless path is documented and has a real-runtime job · ~5 files · ~40 KB · ~10k · complete

**C71** - `README.md` has a heading containing `Headless` whose section contains `office run`, each of the exit codes `0`, `1`, `2`, `10`, `11` with its meaning, the keys `approvals:` and `run:`, and the word `container` within 5 lines of every occurrence of `bypassPermissions`, `dontAsk` or `auto` used as a `permission_mode` value; `payload/skills/office/SKILL.md` contains `office run`, `approvals`, and the codes `10` and `11`; `scripts/check-mermaid.mjs README.md` still exits 0 as part of `tests/run.sh` (AC 67, 70)
Proof: `node --test --test-name-pattern="headless docs" tests/run.test.mjs`

**C72** - A workflow file under `.github/workflows/` has `workflow_dispatch` as its only trigger, a step that runs `install.sh` into a fixture repository, a step that runs `office run` with `--report`, a step that fails unless the exit code is 0, and a step that fails unless every role with a `step` event has a `usage.by_role` entry; `tests/run.sh` runs `tests/run.test.mjs` in its `node --test` line and reports the suite green with `OFFICE_RUNTIME_CMD` pointing only at the stub (no test invokes `claude`); RFC 0002's header reads `| Status | Implemented |`, its row in `docs/rfcs/README.md` reads `Implemented`, and its three open questions are answered in the RFC text (AC 68, 69, plan Impact: docs)
Proof: `node --test --test-name-pattern="headless workflow is manual only" tests/run.test.mjs`
Proof: `bash tests/run.sh`
Proof: `grep -q '^| Status | Implemented |' docs/rfcs/0002-headless.md && grep -qE '0002-headless.md\).*Implemented' docs/rfcs/README.md`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `office run` exit codes, door 5 (5) | `0` C1 · `1` C21 · `2` C28 · `10` C18 · `11` C31 | - |
| `office run --resume` exit codes (5) | `0` C47 · `1` C53 · `2` C52 · `10` C37 · `11` C51 | - |
| `office next` exit codes, door 5 (5) | `0` C65 · `3` C65 · `10` C65 · `12` C65 · `1` existing (schema gate, events C31) | - |
| `office plan status` exit codes (2) | `0` C43 · `1` C43 | - |
| `office plan approve` exit codes (2) | `0` C40 · `1` C41 | - |
| `office spec approve` exit codes (2) | `0` C39 · `1` C42 | - |
| `office validate` exit codes (2) | `0` C45 · `1` C45 | - |
| runtime executable outcomes, door 4 (6) | exit 0 valid C1 · exit non-zero C21 · not JSON C21 · `is_error` C21 · no `modelUsage` C21 · cannot start C24 | - |
| run event types, door 1 (4) | `run_start` C2 · `step` C20 · `approve` C33 · `run_end` C56 | - |
| `step` outcomes (4) | `ok` C20 · `unmet` C8 · `crashed` C21 · `timeout` C22 | - |
| `run_end` outcomes (4) | `completed` C56 · `failed` C56 · `blocked` C56 · `awaiting_approval` C56 | - |
| causes of exit 10 (3) | blocked task C18 · open questions C37 · plan not converged C12 | - |
| causes of exit 11 (3) | gate 1 human C31 · gate 2 human C32 · harness route C38 | - |
| causes of exit 1 (6) | crashed C21 · timeout C22 · unmet twice C9 · max-steps C23 · runtime missing C24 · invalid board C25 | - |
| usage errors (8) | C28, table-driven over all 8 | - |
| routes (3) | `feature` C1 · `trivial` C14 · `harness` C38 | - |
| SWE tiers (3) | `fast` C15 · `standard` C15 · `deep` C15 | - |
| `approve` gates emitted (2) - `harness` is reserved and never emitted | `spec` C33 · `plan` C34 | - |
| approval modes, door 2 (2) x gates (2) | spec/policy C33 · spec/human C39 · plan/policy C34 · plan/human C40 | - |
| approval file states at a gate (3) | absent C33 · stale C36 · current C35 | - |
| policy resolution, door 3 (8) | C30, table-driven over all 8: 4 rows at each of 2 gates | - |
| invalid config values (5) | C45, table-driven over all 5 | - |
| plan hash: fields that must not change it (6) | C44, table-driven over all 6 | - |
| plan hash: changes that must change it (13) | C44, table-driven over all 13 | - |
| `plan status` values (3) | `draft` C43 · `approved` C43 · `stale` C43 | - |
| resume entry points (5) | gate 1 C47 · plan C54 · gate 2 C48 · task in flight C55 · open questions C37 | - |
| resume at gate 2 under `auto` with an unapproved, unstarted plan (2) | Devil's Advocate rejects C73 · Devil's Advocate approves C74 | - |
| report keys, door 6 (5) | `run` C57 · `outcome` C57 · `duration_ms` C57 · `tasks` C62 · `usage` C60 | - |
| `usage` groupings (3) | `by_role` C60 · `by_model` C60 · `total` C60 | - |
| config keys written by init, door 3 (6) | `run.runtime` C69 · `run.permission_mode` C69 · `run.allowed_tools` C69 · `approvals.spec` C69 · `approvals.plan` C69 · `approvals.harness` C69 | - |
| run lock states (3) | pre-existing C26 · held during a step C27 · released on each of 4 endings C27 | - |
| entities in Relations (5) | `Run` C2 · `Step` C20 · `Step`-`Task` C20 · `SpecApproval` C33 · `PlanApproval` C34 | - |

- Every claim naming an exit code or an output shape has a proof that runs the CLI as a
  subprocess; the only proofs that do not are the file-content greps of C46, C70, C71 and C72
- The timeout and `PATH` proofs are the two that depend on process behaviour outside the stub's scripted
  transitions (a kill, a `PATH` lookup)
- No other check claims more than the cases its proof exercises

## Swept

- validation: C28, C45
- failure modes: C21, C22, C9
- idempotency: C35 (a satisfied gate writes nothing), C47 (resume repeats no finished step)
- authorization: C42 - the command line cannot write `mode: policy`; the remaining hole (a role calling `spec approve` as a human) is the RFC's stated risk and lands on C46 and C4
- concurrency: C26, C27
- data lifecycle: n/a - approvals are overwritten in place and the log has no rotation (RFC 0001); a `spec-approval.json` with no `mode` is still accepted by `claim`, which the existing `tests/spec.test.mjs` suite exercises
- dependency failure: C21, C24
- state transitions: C56, C55, C16, C17
- observability: C20, C60, C63

## Handoff

- Files touched: `payload/bin/office.mjs` 62.9 KB, `tests/events.test.mjs` 24.0 KB (read for the
  sandbox pattern), `tests/run.sh` 10.7 KB, `templates/config.yml.tmpl` 0.7 KB, `README.md`
  16.2 KB, `payload/agents/office-product-owner.md` 2.7 KB, `payload/commands/office*.md` 2.6 KB,
  `payload/skills/office/SKILL.md` and `office-board/SKILL.md` ~8 KB, `.github/workflows/ci.yml`
  8.2 KB, `docs/rfcs/0002-headless.md` 11.9 KB, `docs/rfcs/README.md` 1.6 KB = ~150 KB / 4 = ~38k,
  plus ~25k for the new `tests/run.test.mjs`, `tests/stub-runtime.mjs` and the supervisor itself
  = ~63k, under the 150k budget - one builder
- Mechanism: one builder, in a new session at the user's request
- **Boundary:** C1-C72 closed at `a74e829`; all 75 proofs ran green one by one, then
  `bash tests/run.sh` in full. Nothing is handed on to another builder. Not exercised: the
  `headless` workflow itself, which waits on plan question 1 (the secret; the file reads
  `secrets.ANTHROPIC_API_KEY`) and has never run against the real runtime
- **Settled mid-build:** a SWE step that leaves its task `blocked` is done, not `unmet` (C18 and
  AC 14 require it; AC 10 names only `review`). C53's spec is a legacy `overview.md`: a typed spec
  that fails `office spec validate` also fails `office validate`, so that run stops under AC 24
  with no event. On route `feature` the Planner step is done when the feature has a task and the
  Devil's Advocate step when it printed a `verdict:` line; convergence is judged after the pair.
  A crash names its cause in an `error` key beside door 4's `{ exit, text, usage }`.
  `OFFICE_STEP_TIMEOUT_MS` overrides the step timeout for the C22 test and is documented nowhere.
  `tests/lifecycle.test.mjs` now expects `office next` to exit 12 with work in flight (AC 61)
- **Abandoned:** nothing
- **Added after round 1:** C73 and C74 (AC 71) close the gap where `--resume` after a non-converged plan reached gate 2 without a review; the user asked for the fix on this branch
