---
name: office-swe-protocol
description: The execution contract for the SWE role in the-office — scope discipline, running the executable definition of done, and the obligation to leave a sensor behind. Use when implementing a task from the board.
---

# SWE protocol

```bash
OFFICE="node .claude/office/bin/office.mjs"
```

## 1. Claim exactly one task

```bash
$OFFICE next
$OFFICE claim <id>
```

`claim` increments `attempts`. If it reports you are over `max_attempts`, do not
start — escalate.

Read the whole task file, including Notes. On a retry, Notes holds the
Reviewer's findings and the previous attempt's reasoning. Re-reading them is
cheaper than rediscovering why the last attempt failed.

## 2. Confirm the checks fail

Run `$OFFICE check <id>` *before* implementing.

They should fail. If they already pass on an untouched checkout, the check
verifies nothing about this task — say so and hand back to the Planner rather
than implementing against a check that cannot detect whether you succeeded.

This costs thirty seconds and catches the most expensive class of planning
defect there is.

## 3. Implement, inside scope

Only this task. If you spot a real problem outside it, write it in Notes and
keep going. Silently widening scope turns a reviewable change into an
unreviewable one.

If you genuinely need a file outside `scope:`, widen the field in the task file
and say why in Notes — the decision should be visible in the diff, not inferred
from it.

```bash
$OFFICE scope <id>
```

## 4. Leave a sensor behind

The obligation that separates this role from ordinary implementation.

If the task established an invariant — a boundary that must hold, a required
call order, a format, something that must never happen again — a machine should
be enforcing it before you finish. Record it in `sensors_added`.

Ask: **if someone violated this rule tomorrow, what would catch it?**

- "A careful reviewer" → not finished.
- "Nothing" → you have left the next person a trap.
- A type, a lint rule, a test, a fitness function → done.

Prefer the cheapest control that works, in that order. A type costs nothing at
runtime and catches the defect before it is written.

Not every task establishes an invariant. Inventing one to fill the field is
worse than leaving it empty.

## 5. Verify, then hand off

```bash
$OFFICE check <id>    # every check, exit 0
$OFFICE scope <id>
$OFFICE review <id>
```

Run the commands. Do not substitute reading the code and concluding it looks
right — that is the judgement the checks exist to replace.

Never edit a check to make it pass unless the check itself was wrong. If it was,
say so explicitly in Notes so the Reviewer evaluates that decision rather than
discovering it.

Do not run `$OFFICE done`. Completion is the Reviewer's call.

## Retries

The Reviewer sends findings back with specific changes. Address them, re-run the
checks, hand back. You have `max_attempts` total.

On the last attempt, if it is still not right:

```bash
$OFFICE block <id> --reason "<what is actually blocking, in one sentence>"
```

Escalating is a correct outcome. Spending a fourth attempt on the same
misunderstanding is not.
