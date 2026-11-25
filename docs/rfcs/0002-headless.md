# RFC 0002 — Headless runs

| | |
|---|---|
| Status | Draft |
| Roadmap phase | [2 — Headless](../ROADMAP.md#phase-2--headless) |
| Depends on | [0001](./0001-instrument.md) |
| Ships in | `payload/bin/office.mjs`, `templates/config.yml.tmpl`, `payload/skills/office/` |

## Summary

Add `office run`, a supervisor that takes a request and drives the pipeline to a
completed board or a blocked task with nobody at the keyboard. It invokes the
agent runtime once per role step, decides what runs next from the board, applies
an approval policy from `config.yml`, and reports token usage by role.

## Motivation

The benchmark in Phase 3 needs dozens of unattended runs. CI adoption needs the
same. Today neither is possible, for three reasons.

- **The loop lives in a prompt.** `payload/commands/office.md` tells the
  orchestrating model to route, plan, then "execute the board task by task". How
  long that loop survives depends on one session's context and compliance.
- **The gates assume a human.** The `/office` command says to "stop and wait for
  the human". `office spec approve` requires `--by NAME` "after human
  confirmation". With no human, a run either stalls or an agent approves its own
  spec, and nothing records which.
- **There is no token accounting.** The roadmap's cost metric is split by role,
  and the pipeline reports nothing.

## Current state

- The three gates are booleans under `gates:` in `config.yml`. The CLI loads
  them and never reads them; they are enforced only by prompts.
- `office next` already answers "what runs next" deterministically and exits 1
  when nothing is ready, for three different reasons it only distinguishes in
  its message: blocked tasks, work in flight, or a finished board.
- `office spec approve` writes `spec-approval.json` with `hash`, `by` and `at`.
  `claim` refuses a task whose spec approval is missing or stale.
- Claude Code's headless mode (`claude -p`) accepts slash commands in the
  prompt, can run a session as a named subagent with `--agent`, and with
  `--output-format json` returns a result that includes `total_cost_usd`,
  `usage` and a per-model `modelUsage` map. `modelUsage` includes tokens spent
  by subagents; `usage` does not. Nothing documented attributes tokens to a
  named subagent within one session.

## Design

### The supervisor

```
office run "<request>" [--feature <slug>] [--json] [--report <file>]
                       [--step-timeout <minutes>] [--max-steps <n>]
office run --resume    continue the board from where it stands
```

`office run` is a loop in the CLI. Each iteration reads the board, picks one
step, invokes the runtime for that step, then reads the board again. The model
does the work inside a step; the CPU decides which step is next. That is the
repository's own rule applied to the pipeline: dependency order and "is the
board complete" are facts a CPU can settle.

Steps, in order:

| Step | Runtime invocation | Done when |
|---|---|---|
| route | Judge | it prints `harness`, `trivial` or `feature` |
| spec | Product Owner | `office spec validate <slug>` passes |
| gate 1 | none (policy) | `spec-approval.json` matches the spec hash |
| plan | Planner, then Devil's Advocate, up to `caps.plan_iterations` | `office spec validate <slug> --plan` and `office validate` pass and the Devil's Advocate approves |
| gate 2 | none (policy) | plan approval recorded |
| task | SWE for the task's tier, then Reviewer, up to `caps.review_iterations` | task is `completed` or `blocked` |
| steer | Janitor, only if `office findings recur` exits 0 | it returns |

The task step repeats while `office next` yields a task id.

Each invocation is one `claude -p --agent <role> --output-format json` process.
One process per role step is what makes per-role token accounting computational:
the result of that process is that role's usage, with no need to attribute
tokens inside a session.

The supervisor never trusts a step's prose. After each step it checks the board
with the CLI commands in the table. A step that returns without its "done when"
condition is retried once, then the run fails.

The interactive `/office` command stays. It is the same pipeline with a model as
the loop, for a human who wants to watch and steer.

### Zero-dependency

`office run` uses `spawnSync` from Node's standard library to start the runtime,
as `check` already does for shell commands and `git`. It imports nothing new.

The CLI's help footer says "Nothing here uses a model". After this RFC the
statement is: nothing here asks a model to decide anything. `run` starts a
model; every decision about what happens next is still made by code. The footer
is reworded accordingly.

### Runtime adapter

Inside `office.mjs`, one object per runtime:

```js
{ name, available(), invoke({ role, prompt, cwd, timeoutMs }) -> { exit, text, usage } }
```

Phase 2 ships the `claude` adapter only. `config.yml` gains:

```yaml
run:
  runtime: claude
  permission_mode: acceptEdits
  allowed_tools: []        # passed through to the runtime when non-empty
```

`OFFICE_RUNTIME_CMD` overrides the executable. Tests use it to point at a stub.
RFC 0006 adds adapters for other runtimes behind the same interface.

The permission mode is the operator's choice and is passed through unchanged.
The quickstart for CI recommends running inside a container and says so next to
any example that relaxes permissions.

### Approval policy

```yaml
approvals:
  spec: human      # human | auto
  plan: human      # human | auto
  harness: human   # human only
```

- `human`: the run stops at the gate with the "awaiting approval" exit code. A
  person approves with the existing command, then `office run --resume`
  continues. This is the default, and it is what makes a first headless run safe
  to try.
- `auto`: the supervisor itself calls the approval with
  `--by policy:auto`. The approval file and the event log record
  `"mode": "policy"`. An interactive approval records `"mode": "human"`.
- `harness` accepts only `human`. `office validate` rejects any other value. A
  harness change alters every contributor's workflow; no unattended run installs
  one. A request the Judge routes to `harness` always ends at "awaiting
  approval".

A spec with open questions is never auto-approved; the CLI already refuses it.
Headless, the Product Owner cannot ask anyone, so its instructions gain one
rule: record a reasonable assumption under `Assumptions`, or leave the question
in `open_questions` and stop. The second case ends the run as blocked, with the
questions printed.

Plan approval gets the same treatment as spec approval:
`office plan approve <slug> --hash SHA --by NAME` writes `plan-approval.json`,
where the hash covers the feature's task contracts. Gate 2 exists today only as
a sentence in a prompt; a supervisor needs a file to check.

The existing `gates:` booleans keep their meaning for interactive runs. A gate
set to `false` there is equivalent to `auto` here; the two keys are merged into
`approvals:` by the schema migration in RFC 0005, and until then `approvals:`
wins when both are present.

### Events

Added to the log from RFC 0001:

| Event | Fields |
|---|---|
| `run_start` | `run`, `request_hash`, `runtime` |
| `step` | `run`, `role`, `task` if any, `outcome`, `duration_ms`, `usage` |
| `approve` | `gate`: `spec`/`plan`/`harness`, `by`, `mode`: `human`/`policy`, `hash` |
| `run_end` | `run`, `outcome`: `completed`/`blocked`/`awaiting_approval`/`failed` |

`run_start` gives the wall-clock metric its true left edge for headless runs.
The request text is hashed, not stored: a request may contain anything.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Board complete. Every task is `completed`. |
| 1 | Failed. The runtime crashed, a step timed out, or the board is invalid. |
| 2 | Usage error. |
| 10 | Blocked. At least one task is `blocked`, or the spec has open questions. |
| 11 | Awaiting approval. A gate with policy `human` was reached. |

`office next` gains the same distinction, which it lacks today: 0 with a task
id, 10 when blocked tasks remain, 12 when work is in flight, 3 when the board is
complete or empty. Its current exit 1 for all three is a breaking change to
replace, so the commit is `feat!:`.

### Run report

`--json` prints, and `--report` writes:

```json
{
  "run": "r-2026...",
  "outcome": "completed",
  "duration_ms": 0,
  "tasks": { "completed": 4, "blocked": 0 },
  "usage": {
    "by_role":  { "office-planner": { "input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost_usd": 0 } },
    "by_model": { },
    "total":    { }
  }
}
```

`by_role` sums each role's invocations. `by_model` sums the runtime's per-model
map. The report is derived from `step` events, so `office stats` can rebuild it
later from the log alone.

## Harness cell

The supervisor and the approval policy are computational guides: they constrain
what the pipeline may do before a model acts. Exit codes and the run report are
computational sensors.

## Alternatives considered

- **Document `claude -p "/office <request>"` and stop there.** One line of
  documentation and no new code. But the loop stays in a prompt, token usage is
  one number for the whole run, and a gate is honoured only if the model chooses
  to honour it.
- **Parse `stream-json` to attribute tokens to subagents.** Messages from a
  subagent carry `parent_tool_use_id`, so text can be attributed. Token usage
  cannot: it is reported per model for the session, not per subagent.
- **Put the supervisor under `scripts/`.** It would be free to take
  dependencies, but `scripts/` is not installed, and a target repository's CI is
  exactly where the supervisor must run.
- **Let `auto` cover the harness gate.** Rejected for the reason the README
  gives for defending Gate 3.

## Risks

- **An agent can still call `office spec approve`.** Nothing in the CLI can tell
  a supervisor from a model with a shell. The role prompts forbid it, the
  supervisor denies the command to roles through `allowed_tools` where the
  runtime supports that, and the event log shows `mode` and `by` for every
  approval. This narrows the hole and does not close it.
- **Process-per-step loses shared context.** The Reviewer no longer sees the
  SWE's reasoning, only the diff and the task file. That is arguably what a
  review should see, but it may change results against the interactive
  pipeline. Phase 3 measures the headless pipeline, so the published numbers
  describe what was run.
- **Cost of cold starts.** Each step reloads its context. Prompt caching absorbs
  part of it; the run report shows the rest.
- **Runtime output drift.** The result field names come from Claude Code's
  documented SDK types. The adapter is the only place that reads them, and it
  fails loudly when a field is missing instead of reporting zero.

## Test plan

- A stub runtime under `tests/`: a script that, given a role, performs scripted
  board transitions with the real CLI and prints a result in the runtime's JSON
  shape. `tests/run.sh` drives `office run` against it for each outcome:
  completed, blocked, awaiting approval, crashed step, timed-out step.
- Policy tests: `auto` records `mode: policy`; `harness: auto` fails
  `office validate`; open questions end a run with exit 10.
- `office run --resume` after exit 11 completes the board.
- One `workflow_dispatch` job runs a fixture request against the real runtime.
  It needs an API key and costs money, so it does not run on push.

## Exit criteria

1. The fixture request runs to completion in CI with no prompt, and exits 0.
2. Its report shows token usage for every role that ran.
3. Blocked, awaiting-approval and failed runs exit with distinct codes, each
   covered by a test against the stub.

## Open questions

- Is changing `office next`'s exit codes worth a breaking release, or should the
  new codes appear only on `office run` and `office next --status`?
- Should the supervisor commit on the SWE's behalf between steps? Today `review`
  and `done` refuse a dirty tree, and the SWE is told to commit. A supervisor
  could make that a guarantee.
- Does the `trivial` route need a plan approval at all, given that it has one
  task?
