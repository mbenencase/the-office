# The Office — Implementation Plan

> Companion to [`skills-requests.md`](./skills-requests.md). That document is the
> product spec; this one is the build plan. Where the two disagree, this document
> records the reasoning for the change.

## 1. Design thesis

The original spec describes seven LLM roles handing work to each other. Harness
engineering says that is the *expensive half* of a harness, and the half that
scales worst. The formula is `Agent = Model + Harness`, where a harness is built
from:

|                    | **Guides** (feedforward — steer before) | **Sensors** (feedback — catch after) |
|--------------------|------------------------------------------|---------------------------------------|
| **Computational**  | types, schemas, scaffolds, module boundaries | linters, tests, coverage, hooks, fitness functions |
| **Inferential**    | CLAUDE.md, skills, specs                 | review agents, LLM-as-judge            |

The spec's roster lives entirely in the bottom-right cell. This plan keeps the
roster but makes every role's **primary job the production of controls in the
other three cells**. Concretely:

1. Every deterministic operation (board state, dependency resolution, DoD
   verification, harness audit) is a **script**, not a prompt. LLMs orchestrate;
   they do not arbitrate facts that a CPU can settle.
2. `dod:` becomes **executable** — a list of commands that must exit 0. Prose
   survives as commentary only.
3. A **steering loop** closes: recurring review findings are converted into new
   computational sensors, so the harness compounds instead of the Reviewer
   re-catching the same defect forever.

## 2. Decisions locked

| Decision | Choice | Consequence |
|---|---|---|
| Distribution | Skills dir + `install.sh` into target `.claude/` | We own versioning; portable install |
| V1 scope | Harness bootstrap **and** delivery pipeline | Two entry points, one shared substrate |
| Runtime | Claude Code only | Subagents, hooks, Skills used natively |
| Orchestration | Subagent auto-handoff | Roles are `.claude/agents/*.md` |
| Human gates | after PO clarification · after plan converges · before harness change | Three hard stops |
| Repo classes | greenfield + legacy | Office Manager branches on harnessability |
| Sensor packs | Python, TypeScript/JS, Go, Rust | Four packs in v1 |
| Execution | Sequential, `depends_on`-ordered | No board locking needed in v1 |
| Models | Tier aliases, resolved in one config | No model IDs in task files |

## 3. Repository layout (the-office)

```
the-office/
├── VERSION                       # semver; single source of truth
├── CHANGELOG.md
├── install.sh                    # copy/symlink payload into a target repo
├── PLAN.md                       # this document
├── skills-requests.md            # original spec, preserved
│
├── payload/                      # everything install.sh copies
│   ├── agents/                   # → .claude/agents/
│   │   ├── office-judge.md
│   │   ├── office-manager.md
│   │   ├── office-product-owner.md
│   │   ├── office-planner.md
│   │   ├── office-devils-advocate.md
│   │   ├── office-swe.md
│   │   ├── office-reviewer.md
│   │   └── office-janitor.md
│   ├── skills/                   # → .claude/skills/
│   │   ├── office/SKILL.md              # entry + routing contract
│   │   ├── office-board/SKILL.md        # kanban protocol
│   │   ├── office-task-schema/SKILL.md  # schema, shared by 5 roles
│   │   └── office-harness/SKILL.md      # audit + sensor install procedure
│   ├── commands/                 # → .claude/commands/
│   │   ├── office.md
│   │   ├── office-onboard.md
│   │   ├── office-board.md
│   │   └── office-next.md
│   └── bin/
│       └── office.mjs            # zero-dep Node CLI (the deterministic core)
│
├── packs/                        # sensor packs, selected by detected stack
│   ├── python/{pack.yml,GUIDE.md,ruff.toml,.pre-commit-config.yaml}
│   ├── typescript/{pack.yml,GUIDE.md,eslint.config.js,tsconfig.strict.json}
│   ├── go/{pack.yml,GUIDE.md,.golangci.yml}
│   └── rust/{pack.yml,GUIDE.md,clippy.toml}
│
└── templates/
    ├── harness.md.tmpl
    ├── config.yml.tmpl
    ├── overview.md.tmpl
    └── task.md.tmpl
```

**Why Node for the CLI:** Claude Code requires Node, so it is the only runtime
guaranteed present in every target repo regardless of stack. Zero dependencies —
no install step, no lockfile in the user's repo.

## 4. State in the target repo

All Office state lives in one committed directory:

```
<target-repo>/
├── .the-office/
│   ├── config.yml            # tiers, caps, gates, detected stacks
│   ├── harness.md            # the manifest — what controls exist and why
│   ├── findings.jsonl        # ledger for the Janitor's recurrence counting
│   └── features/
│       └── <feature-slug>/
│           ├── overview.md
│           ├── task-01.md
│           └── task-02.md
└── .claude/{agents,skills,commands}/   # installed payload
```

This folds the spec's `the-office-features/` under `.the-office/features/` so
board state, config, and manifest live together. All of it is committed — the
harness manifest is as much a repo artifact as the CI config.

## 5. Task schema (revised)

```markdown
---
id: auth-rework/task-01        # stable, path-derived
task_no: 1
title: Add rate limiting to login endpoint
depends_on: []                 # list of task ids
status: pending                # pending | in-progress | review | blocked | completed
tier: standard                 # fast | standard | deep
scope:                         # glob allowlist; SWE may not edit outside it
  - src/auth/**
  - tests/auth/**
checks:                        # executable DoD — all must exit 0
  - "pnpm vitest run tests/auth"
  - "pnpm tsc --noEmit"
  - "pnpm eslint src/auth"
sensors_added: []              # controls this task contributes to the harness
dod: |                         # prose commentary, not the contract
  Six failed logins from one IP within 60s returns 429.
attempts: 0
max_attempts: 3
branch: null                   # written by `office done`
commit: null                   # written by `office done`
---

## Context
## Approach
## Notes
<!-- appended by SWE and Reviewer across attempts; never rewritten -->
```

Changes from the spec and why:

- **`id`** — `task_no` alone is not unique across features.
- **`checks`** — the behaviour harness. Article's weakest category; free-text
  `dod` puts all correctness load on the Reviewer's judgement.
- **`tier` replaces `model`** — hardcoding `claude-sonnet-4.5` into every task
  file means every task rots on the next model release. One config maps tiers to
  IDs.
- **`scope`** — a computational guide. The CLI can verify the diff stayed inside
  it; nothing about that needs an LLM.
- **`attempts`/`max_attempts`** — the spec's SWE↔Reviewer loop is unbounded.
- **`sensors_added`** — makes the SWE's harness obligation auditable rather than
  aspirational.
- **`status: review`** and **`blocked`** — the spec's three states cannot express
  "SWE done, awaiting Reviewer" or "escalated to human".

## 6. The deterministic core: `office.mjs`

Every command below is pure computation. No model is involved.

| Command | Behaviour |
|---|---|
| `office board [feature]` | Render the kanban as a table from frontmatter |
| `office next` | Print the next ready task (pending, all `depends_on` completed); exit 1 if none |
| `office claim <id>` | `pending` → `in-progress`, increment `attempts` |
| `office review <id>` | `in-progress` → `review` |
| `office done <id>` | → `completed`, record branch + commit from git |
| `office block <id> --reason` | → `blocked`, for human escalation |
| `office check <id>` | Run every `checks:` entry; stream output; exit on first failure |
| `office scope <id>` | Verify the working diff touches only `scope:` globs |
| `office validate` | Schema-validate all tasks; detect cycles, dupes, orphan deps |
| `office audit --json` | Detect stacks and existing sensors; emit machine-readable report |
| `office findings add` | Append a Reviewer finding to the ledger |
| `office findings recur` | Report finding classes at or over the recurrence threshold |

`office validate` runs as a **pre-commit hook** in the target repo — a board with
a dependency cycle or a task with no checks never gets committed.

## 7. The roster

Each role is a subagent in `.claude/agents/`. Tool grants are restrictive by
default: only the SWE and Office Manager get write access.

| Role | Tier | Writes? | Job |
|---|---|---|---|
| **Judge** | fast | no | Route: `trivial` → SWE · `feature` → PO · `harness` → Office Manager |
| **Office Manager** | deep | yes | Bootstrap/repair the harness. The role the spec was missing. |
| **Product Owner** | standard | no | Clarify intent. **Gate 1.** |
| **Planner** | deep | board only | Decompose into tasks with executable checks |
| **Devil's Advocate** | deep | no | Adversarial plan review. ≤3 loops, then **Gate 2.** |
| **SWE** | task's `tier` | yes | Implement + contribute sensors + pass `office check` |
| **Reviewer** | deep | no | Three-lens review; log findings. ≤3 loops, then escalate |
| **Janitor** | standard | proposes | Convert recurring findings into computational controls |

### 7.1 Judge

Three outcomes, not two. The spec's binary miss: a request like "our tests are
flaky" is neither a feature nor a trivial edit — it is a harness problem.

The `trivial` path still writes a minimal task file. Without one, small changes
bypass `checks` entirely, and that is exactly where regressions hide.

### 7.2 Office Manager — the bootstrap role

Runs on `/office-onboard`, or when the Judge routes a harness request.

1. `office audit --json` — computational: detect stacks, package managers, test
   runners, existing linters/hooks/CI, type-checker strictness, coverage config.
2. **Archaeology** (inferential): module boundaries, implicit conventions,
   invariants that exist only in reviewers' heads.
3. **Score harnessability** — typing strength, boundary clarity, test presence,
   build reproducibility. Greenfield repos get controls embedded from day one;
   legacy repos get a prioritised retrofit sequence.
4. **Propose** a harness manifest: which controls to add, which cell of the
   guides/sensors matrix each occupies, and cost/benefit for each.
5. **GATE 3** — nothing installs without approval. A new pre-commit hook changes
   every contributor's workflow.
6. **Install** from the matching pack, write `.the-office/harness.md`, and
   generate/extend the repo's `CLAUDE.md` (the inferential guide layer).

Legacy repos get an explicit **strangler ordering**: cheap high-signal sensors
first (formatter, type check on changed files only), broad enforcement last.
Turning on strict mode across a legacy repo produces 4,000 errors and gets the
whole harness disabled by the first person who hits it.

### 7.3 SWE obligations

Beyond implementing the task:

- **Must** run `office check <id>` before handing off. Not "should verify".
- **Must** stay inside `scope:`; `office scope` proves it.
- **Must** add a sensor when the task introduces a new invariant, recorded in
  `sensors_added`. If the task established a rule, a machine should enforce it.
- Self-corrects against Reviewer findings, up to `max_attempts`, then `office
  block` escalates to a human.

### 7.4 Reviewer — three lenses

Matching the article's three regulation categories, because a single-pass review
degenerates into style commentary:

1. **Maintainability** — duplication, complexity, coverage gaps, drift.
2. **Architecture fitness** — boundary violations, dependency direction,
   observability conventions, performance characteristics.
3. **Behaviour** — does it satisfy the DoD, and *do the `checks` actually verify
   the DoD*? A green check that tests the wrong thing is worse than no check.

Every finding is logged via `office findings add` with a class label. That ledger
is what makes the steering loop possible.

### 7.5 Janitor — the steering loop

The spec has no mechanism for the harness to learn. The Reviewer catches a defect,
the SWE fixes it, and the next feature reproduces it.

When a finding class crosses the recurrence threshold (default 3), the Janitor
proposes a computational control that would have caught it — a lint rule, a
fitness test, a hook, a type constraint. Proposals go through **Gate 3** like any
harness change. This is what makes the harness compound.

## 8. Build phases

Each phase has an executable DoD — the-office harnesses itself.

### Phase 1 — Deterministic core
`office.mjs` with board, next, claim, review, done, block, check, scope,
validate. Templates for task/overview/config. Schema documented in
`office-task-schema` skill.
**DoD:** `node payload/bin/office.mjs validate` passes on a fixture feature with
a known-good board and fails on fixtures with a cycle, a duplicate id, and a task
with empty `checks`.

### Phase 2 — Harness bootstrap
`office audit`, the four sensor packs, Office Manager agent, `/office-onboard`,
`harness.md` template, harnessability scoring, legacy strangler ordering.
**DoD:** onboarding a fixture repo per stack produces a manifest, installs the
pack, and the installed sensors run green on a clean checkout.

### Phase 3 — Planning pipeline
Judge, Product Owner, Planner, Devil's Advocate. Gates 1 and 2. Convergence caps.
**DoD:** a sample request yields a board that passes `office validate`, where
every task has ≥1 check that fails before implementation and could pass after.

### Phase 4 — Execution loop
SWE, Reviewer, three lenses, findings ledger, attempt caps, escalation.
**DoD:** end-to-end on a fixture repo — request in, tasks completed, all checks
green, branch and commit recorded on each task file.

### Phase 5 — Steering loop
Janitor, recurrence detection, control proposal.
**DoD:** seeding the ledger with 3 findings of one class produces a concrete
control proposal that, once installed, catches a fourth instance.

### Phase 6 — Install and versioning
`install.sh` (copy or `--link` for development), `VERSION`, `CHANGELOG.md`,
upgrade path that preserves `.the-office/` state, `office --version` compatibility
check against the installed payload.
**DoD:** clean install into a fresh repo; upgrade across a version bump without
losing board state; uninstall leaves no orphans.

### Phase 7 — Dogfood
Run the-office on the-office. Onboard this repo with its own Office Manager;
build any remaining work through its own pipeline.
**DoD:** this repo's `.the-office/harness.md` exists and its sensors pass.

## 9. Known risks

**Ceremony cost.** Seven roles on a small change is absurd. Mitigated by the
Judge's `trivial` path — but the Judge's calibration is the thing most likely to
need tuning after real use.

**Gate fatigue.** Three gates per feature. If they become reflexive approvals they
provide nothing. Gate 3 (harness changes) is the one that must stay hard.

**Sensor pack drift.** Four packs pinning tool configs across four ecosystems is
real maintenance. V1 keeps packs deliberately minimal — formatter, linter, type
check, test runner, one hook — rather than opinionated maximal configs.

**Harness incoherence.** The article names this as an open problem: as guides and
sensors accumulate they start contradicting each other. `harness.md` as a single
manifest is a partial defence; there is no good answer yet for detecting
contradiction between a CLAUDE.md rule and a lint rule.

**Legacy repos resist.** Highest need, lowest harnessability. The strangler
ordering is the mitigation, and it is the part most likely to need iteration.

## 10. Status — v0.1.0 shipped

All seven phases implemented and verified. `bash tests/run.sh` — 43 assertions,
green.

| Phase | Verified by |
|---|---|
| P1 Deterministic core | validate accepts a good board; rejects cycle, duplicate id, empty checks, orphan dep |
| P2 Harness bootstrap | four packs; audit detects stacks, controls, and scores harnessability |
| P3 Planning pipeline | 8 agents, 5 skills, 4 commands; frontmatter and model aliases sensor-checked |
| P4 Execution loop | end-to-end in a fresh repo: check fails before the work, passes after, branch and commit recorded |
| P5 Steering loop | findings ledger; recurrence fires at threshold and stays silent below it |
| P6 Install and versioning | clean install, upgrade preserving board state, uninstall leaving `.the-office/` intact |
| P7 Dogfood | this repo onboarded; `.the-office/harness.md` written with its open gaps recorded |

### Departures from the plan

**Pack manifests are `pack.json`, not `pack.yml`.** The CLI's YAML subset does
not parse lists of maps, and extending the parser for one machine-read file was
not worth the risk of silently mis-parsing a control definition.

### Found by dogfooding

Two real defects, both logged to `.the-office/findings.jsonl`:

- `office audit`'s `tests` probe was stack-specific, so a repo whose suite is a
  shell script scored 0 on the tests component. Fixed by adding universal probes
  for test entrypoints, hooks, CI, and guides.
- `office scope` counted the installed `.claude/` payload as task changes, so
  every task in a repo with the-office installed failed its own scope check.
  Fixed, with a regression test.

Neither class has recurred, so no control was proposed — which is the Janitor's
guidance working: three findings in one afternoon by one author is one mistake
logged three times, not a pattern in the codebase.
