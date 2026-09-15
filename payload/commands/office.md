---
description: Run a request through the-office pipeline — judged, planned, built, and reviewed against an executable definition of done.
argument-hint: <what you want built or fixed>
---

Run this request through the-office: **$ARGUMENTS**

Load the `office` skill for the routing contract, then:

1. Delegate to `office-judge` to route. It returns `harness`, `trivial`, `feature`, or `kickoff`.
2. Follow that route:
   - **harness** → `office-manager`. Stop at Gate 3 before anything installs. Install only via `office bootstrap --apply` / `office pack install --apply`.
   - **trivial** → create a compact typed spec with `office-product-owner`, obtain Gate 1 approval, create a linked task, then `office-swe-fast`, then `office-reviewer`.
   - **kickoff** → `office-product-owner` creates a bug/feature/refactor spec (stop at **Gate 1**), then `office-planner` **one pass** of 1–3 tracer-bullet tasks (**no** Devil's Advocate loop), stop at **Gate 2**, then execute the board task by task.
   - **feature** → `office-product-owner` creates a bug/feature/refactor spec from the informal request (stop at **Gate 1**), then `office-planner` ⇄ `office-devils-advocate` until approved or `plan_iterations` is exhausted (stop at **Gate 2**), then execute the board task by task.
3. For each task, pick the SWE by its `tier:` field: `fast` → `office-swe-fast`, `standard` → `office-swe`, `deep` → `office-swe-deep`. Then `office-reviewer`.
4. After the board completes, run `node .claude/office/bin/office.mjs findings recur`. If any class is over threshold, hand it to `office-janitor`.

Honour the gates. They are in `.the-office/config.yml` and they default to on — stop and wait for the human rather than proceeding on your own judgement.

If `.the-office/` does not exist, say so and suggest `/office-onboard <stack>` (python, typescript, go, or rust). If the request already names a stack, run onboard in this same session: computational propose, **Gate 3**, `--apply`, then continue as `kickoff`. Do not do archaeology on greenfield in the middle.
