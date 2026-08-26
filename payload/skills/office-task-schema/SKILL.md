---
name: office-task-schema
description: The task file schema for the-office kanban board — field meanings, valid values, and the rules that make a definition of done executable. Use when writing, editing, or validating task files under .the-office/features/.
---

# Task schema

One task is one Markdown file at `.the-office/features/<feature>/task-NN.md`.

```markdown
---
id: auth-rework/task-01
task_no: 1
title: Rate-limit the login endpoint
depends_on: []
status: pending
tier: standard
scope:
  - src/auth/**
  - tests/auth/**
checks:
  - "pnpm vitest run tests/auth"
  - "pnpm tsc --noEmit"
sensors_added: []
dod: |
  Six failed logins from one IP within 60s returns 429.
attempts: 0
max_attempts: 3
branch: null
commit: null
---

## Context
## Approach
## Notes
```

## Fields

| Field | Rule |
|---|---|
| `id` | `<feature>/<filename without .md>`. Must match its path — `office validate` enforces it. |
| `task_no` | Ordering within the feature. |
| `depends_on` | List of task `id`s. Real ordering only, not preference. Cycles are rejected. |
| `status` | `pending` · `in-progress` · `review` · `blocked` · `completed`. Transition with the CLI, never by hand. |
| `tier` | `fast` · `standard` · `deep`. Selects the SWE variant. |
| `scope` | Glob allowlist. `office scope <id>` asserts the diff stayed inside. |
| `checks` | **The contract.** Shell commands that must exit 0. Never empty. |
| `sensors_added` | Controls this task contributed to the harness. |
| `dod` | Prose for the human and Reviewer. Commentary, not the contract. |
| `attempts` / `max_attempts` | Bounds the SWE↔Reviewer loop. On exceeding, escalate. |
| `branch` / `commit` | Written by `office done` from git. Do not fill by hand. |

There is deliberately no `model:` field. Model ids rot on every release; `tier`
resolves through `.the-office/config.yml`, in one place.

## What makes `checks` real

**A check must fail before the work and pass after.** If it is already green on
an untouched checkout, it verifies nothing about this task.

Weak checks, in descending order of how often they appear:

- `npm run build` or `tsc --noEmit` as the *entire* DoD — proves it compiles,
  says nothing about behaviour.
- A test asserting the mechanism (`the limiter was called`) rather than the
  behaviour (`the seventh request got a 429`).
- A `dod:` promising something no check touches at all.
- `true`, or a command that cannot fail.

A test suite command is a good check only when this task adds a test to it that
did not exist before. Prefer naming the specific test:
`pytest tests/auth/test_ratelimit.py::test_burst_returns_429`.

## Scaffolding

```bash
$OFFICE feature new <slug> --title "..."
$OFFICE task new <slug> --title "..." --tier standard
$OFFICE validate
```

`office validate` catches missing fields, id/path mismatch, bad enum values,
empty `checks`, duplicate ids, orphan dependencies, and cycles. It does not and
cannot catch a check that tests the wrong thing — that is the Devil's Advocate's
job, and yours.
