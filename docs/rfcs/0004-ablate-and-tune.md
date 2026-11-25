# RFC 0004 — Ablation and tuning

| | |
|---|---|
| Status | Draft |
| Roadmap phase | [4 — Ablate and tune](../ROADMAP.md#phase-4--ablate-and-tune) |
| Depends on | [0003](./0003-golden-set-and-benchmark.md) |
| Ships in | `payload/` (role toggles, new defaults), `bench/` (ablation runs, budget) |

## Summary

Make each role in the pipeline switchable from `config.yml`, rerun the golden
set with one role removed at a time, and change the default pipeline according
to a decision rule fixed before the runs. Then guard the result with a
regression budget.

## Motivation

The pipeline has ten agents. Six of them run on the `opus` alias. Nobody knows
which of them change the outcome. The roadmap's principle is that a role must
pay for itself; this phase finds out which do.

## Current state

- The routing is prose. `payload/commands/office.md` and the `office` skill tell
  the orchestrating model which agent to call next. Removing a role today means
  editing prompts.
- Each agent's model is fixed in its frontmatter (`office-swe-fast` is `haiku`,
  `office-swe` is `sonnet`, `office-swe-deep` is `opus`). The `tiers` map in
  `config.yml` is documentation the agents are told to read.
- `caps.plan_iterations` and `caps.review_iterations` are both 3, and a task's
  `max_attempts` defaults to 3. None of the three was measured.

## Design

### Role toggles

`config.yml` gains:

```yaml
pipeline:
  devils_advocate: true
  reviewer: true
  tier_floor: fast      # fast | standard | deep
  tier_ceiling: deep
```

`office pipeline [--json]` prints the resolved pipeline: which roles are on, and
which SWE agent each task tier resolves to after the floor and ceiling are
applied. The `/office` and `/office-next` commands call it and follow its
output. Whether a role runs is a fact a CPU can settle, so it moves out of the
prompt, as the repository's conventions require.

Under RFC 0002 the supervisor reads the same output, so in a headless run the
toggle is enforced by code and not by a model's compliance.

What "off" means for each:

| Toggle | Effect |
|---|---|
| `devils_advocate: false` | The Planner's first plan that passes `office spec validate --plan` goes to Gate 2. |
| `reviewer: false` | A task with passing `check` and `scope` goes `review` → `done` with no inferential review. No findings are logged, so the Janitor has nothing to act on. |
| `tier_floor: standard` | Tasks tagged `fast` run on `office-swe`. |
| `tier_ceiling: standard` | Tasks tagged `deep` run on `office-swe`. |

The Judge, Product Owner, Planner and one SWE are the minimum pipeline and have
no toggle. The Janitor is measured on the sequence only.

### Ablation matrix

Each row is a full golden-set run of the `office` arm. The full pipeline and the
baseline come from the Phase 3 results at the same commit.

| Run | Config change | Question |
|---|---|---|
| A1 | `devils_advocate: false` | Does adversarial plan review catch defects the hidden tests see? |
| A2 | `reviewer: false` | Does inferential review add anything on top of executable checks? |
| A3 | `tier_floor: standard` | Does the fast tier save tokens without costing passes? |
| A4 | `tier_ceiling: standard` | Does the deep tier buy passes? |
| A5 | `tier_floor: deep` | Is tiering worth having at all? |
| A6 | sequence, Janitor off | Does the steering loop lower seeded recurrence? |

`node bench/run.mjs --ablate <name>` writes the overlay into the workspace's
`config.yml` after install. Five runs per task, not three: the comparison is
between two configurations of the same system, and the differences will be
smaller than the-office against baseline.

### Decision rule

Written into `bench/ablation-plan.json` and committed before any ablation run
starts. The runner refuses to produce a verdict if that file changed after the
first result was written.

For a role R, let Δpass and Δescaped be the change in aggregate requirement pass
rate and escaped-defect rate when R is removed, and let S be the run-to-run
spread of the full pipeline on the same metric.

| Observation when R is removed | Verdict |
|---|---|
| Pass rate falls by more than S, or escaped-defect rate rises by more than S | **Keep on by default.** Record the contribution and its token cost. |
| Neither moves beyond S, and tokens fall | **Make optional, default off.** |
| Pass rate rises or escaped-defect rate falls beyond S | **Remove.** The role makes results worse. |

"Enough to justify its tokens" in the roadmap needs an exchange rate, and this
RFC does not invent one. A role that moves the score beyond noise stays; the
table reports what each point of pass rate cost so that a team can make its own
trade.

### Holdout

Six golden-set tasks are the tuning set and four are held out, chosen once by a
seeded shuffle stratified by stack. Role verdicts and cap changes are made on
the tuning set and must not be contradicted on the holdout. A change that helps
the tuning set and hurts the holdout is not shipped.

### Tuning caps and tiers

From the event logs already collected in Phase 3 and in the ablation runs, no
new runs needed at first:

- For each of `plan_iterations`, `review_iterations` and `max_attempts`: the
  share of tasks that used iteration *n* and the share of those that then passed
  the hidden suite. A cap whose last iteration never converts is lowered by one.
  A cap at which tasks are escalated and would have passed (visible in runs with
  a higher cap) is raised.
- Each proposed change is confirmed with one golden-set run before it becomes
  the default.

Tier assignment is the Planner's judgement per task. Runs A3 to A5 say whether
the floor or ceiling should move; they do not tune the Planner's prompt.

### Regression budget

A full benchmark is too expensive to run on every change, so the budget has a
cheap part and an expensive part.

- **Staleness check, on every pull request.** `summary.json` records a hash of
  the prompt surface: `payload/agents/`, `payload/skills/`, `payload/commands/`.
  CI recomputes it. If it differs from the latest published result, the pull
  request gets a non-blocking annotation: the benchmark is stale for this
  change. This is computational and costs nothing.
- **Comparison, on demand.** `node bench/compare.mjs <old> <new>` exits non-zero
  when priced token cost rises by more than the threshold in `bench/budget.json`
  (proposed: 10%) and neither headline score improves beyond spread. The release
  checklist requires a fresh run and a passing comparison when the staleness
  annotation is present on any merged change since the last result.

The annotation does not block a merge, and a merge to `main` still publishes a
release. Blocking would mean no prompt fix ships without 60 agent runs.

### Recording the result

`bench/RESULTS.md` gains a table with one row per role: pass-rate contribution,
escaped-defect contribution, tokens, verdict, and the run ids behind the row.
The README's roster section links to it.

## Harness cell

The toggles are a computational guide: configuration resolved by the CLI. The
budget is a computational sensor on the framework's own cost.

## Alternatives considered

- **Ablate by editing prompts on a branch.** No shipped surface, but each
  ablation becomes a fork of the payload that drifts, and users get no way to
  turn off a role the results call optional.
- **Full factorial design.** Interactions between roles are plausible (the
  Reviewer may matter more without the Devil's Advocate), but 2⁴ configurations
  at five runs each is beyond what the result is worth. One follow-up run is
  planned for the single most plausible interaction: A1 and A2 together.
- **A blocking budget in CI.** See above.

## Risks

- **Noise decides.** With six tuning tasks, S may be so wide that no role clears
  it. That outcome is informative: it means the golden set must grow before
  roles can be judged, and no default changes.
- **`reviewer: false` weakens the README's claim.** If the Reviewer proves
  optional, the framework's value rests on executable checks alone. That is
  consistent with the repository's thesis, and the README must then say it.
- **Tuning to the set.** Mitigated by the holdout, not removed.
- **Sequence effects need the Reviewer.** The Janitor acts on findings the
  Reviewer logs, so A2 and A6 are not independent. A role found optional on
  single tasks may still be required for the steering loop; the verdict table
  has a column for that.

## Test plan

- `office pipeline --json` for each toggle combination, in `tests/run.sh`.
- A lifecycle test where `reviewer: false` reaches `done` with valid evidence,
  and one where missing evidence still blocks it. Turning the Reviewer off must
  not turn verification off.
- `compare.mjs` against checked-in result pairs: within budget, over budget, and
  over budget with an improved score.
- The staleness hash changes when an agent file changes and not when a README
  does.

## Exit criteria

1. Every role in the default pipeline has a row in `bench/RESULTS.md` with a
   measured contribution and a verdict.
2. The default `config.yml` reflects those verdicts, and the tuned caps are
   confirmed on the holdout.
3. The staleness check runs in CI, and `compare.mjs` is in the release
   checklist.

## Open questions

- Should a role found optional stay in `payload/agents/` when its default is
  off, or move to an opt-in pack? Keeping it costs nothing at run time but adds
  to what a new user has to read.
- Is 10% the right cost threshold? It should be set from the measured spread of
  token cost, which is unknown until Phase 3 runs.
- Should the Product Owner be ablated? Removing it means the Planner works from
  the raw request, which changes what a typed spec means. Proposed: no, the
  typed spec is the contract the rest of the pipeline is built on.
