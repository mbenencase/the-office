# the-office

A versioned set of Claude Code skills that install a working **harness** into any
repository — greenfield or legacy — and then build software through it.

> `Agent = Model + Harness`. The harness is everything that regulates the model:
> **guides** that steer before it acts, **sensors** that catch it after. Each is
> either **computational** (deterministic, cheap, runs on every change) or
> **inferential** (a model's judgement — richer, slower, probabilistic).

The roles below are inferential controls. Their purpose is to produce
*computational* ones.

## How it works

A request enters through the Judge and leaves as completed tasks whose
definitions of done a machine has verified. Hexagons are the points where a
human must approve; the dotted path is the steering loop, which turns a
recurring defect into a control so it stops recurring.

```mermaid
flowchart TD
    REQ([Request]) --> JUDGE{Judge}

    JUDGE -->|harness| OM[Office Manager]
    JUDGE -->|feature| PO[Product Owner]
    JUDGE -->|trivial| MIN[Minimal task file]

    OM --> G3{{"GATE 3<br/>approve the harness change"}}
    G3 --> CTRL[("Controls installed<br/>harness.md updated")]

    PO --> G1{{"GATE 1<br/>confirm understanding"}}
    G1 --> PLAN[Planner]
    PLAN --> DA["Devil's Advocate"]
    DA -->|"rejected — max 3 passes"| PLAN
    DA -->|approved| G2{{"GATE 2<br/>approve the board"}}

    G2 --> NEXT
    MIN --> NEXT[/"office next — dependency ordered"/]

    NEXT --> SWE["SWE<br/>tier picks the model"]
    SWE --> VER{{"office check + office scope"}}
    VER -->|fails| SWE
    VER -->|passes| REV[Reviewer]
    REV -->|"findings — max 3 attempts"| SWE
    REV -->|"out of attempts"| HUM([Escalate to a human])
    REV -->|accepted| DONE[/"office done — records branch + commit"/]
    DONE --> NEXT

    REV -.->|log finding by class| LED[("findings.jsonl")]
    LED -.->|class recurs| JAN[Janitor]
    JAN -.->|propose a control| G3

    classDef gate stroke-width:3px
    class G1,G2,G3 gate
```

Two things in that picture do the real work.

**The `office check + office scope` node is not a review step.** It is two shell
commands. A task whose checks exit non-zero cannot reach the Reviewer, which
means expensive inferential attention is never spent on something a CPU has
already settled.

**The dotted path is what makes the harness compound.** Without it the Reviewer
catches a defect, the SWE fixes it, and the next feature reproduces it forever.
The Janitor converts a recurring finding class into a type, a lint rule, or a
fitness function — and that proposal goes through Gate 3 like any other harness
change.

### Task lifecycle

Statuses move through the CLI, never by editing frontmatter. Only the Reviewer
runs `office done`; a SWE that marks its own work complete has removed the
review from the pipeline.

```mermaid
stateDiagram-v2
    state "in-progress" as inprog

    [*] --> pending : office task new
    pending --> inprog : office claim
    inprog --> review : office review
    review --> completed : office done
    review --> inprog : findings sent back
    inprog --> blocked : office block
    review --> blocked : office block
    blocked --> inprog : office claim
    completed --> [*]

    note right of blocked
        Needs a human.
        Reached when attempts
        exceeds max_attempts.
    end note
```

## Install

```bash
git clone <this repo> ~/src/the-office
~/src/the-office/install.sh /path/to/your/repo
```

For **Cursor Agent** (subagents in `.cursor/agents/`, skills in `.cursor/skills/`):

```bash
~/src/the-office/install.sh /path/to/your/repo --runtime cursor
```

Use `--runtime both` to install into `.claude/` and `.cursor/` at once.

Then, in that repo:

```
/office-onboard          audit the harness and propose the controls it lacks
/office <request>        run a request through the pipeline
/office-board            show the board
/office-next             execute the next ready task
```

`--link` symlinks instead of copying, for iterating on the-office itself.
`--runtime cursor` installs a Cursor Agent payload (`.cursor/agents/`,
`.cursor/skills/`); `--runtime both` installs Claude Code and Cursor layouts.
`--uninstall` removes the payload and leaves your board state alone.

## The roster

| Role | Tier | Job |
|---|---|---|
| **Judge** | fast | Routes: trivial · feature · harness |
| **Office Manager** | deep | Audits and installs the harness |
| **Product Owner** | standard | Clarifies the request → **Gate 1** |
| **Planner** | deep | Decomposes into tasks with executable checks |
| **Devil's Advocate** | deep | Adversarial plan review → **Gate 2** |
| **SWE** | per task | Implements, and leaves a sensor behind |
| **Reviewer** | deep | Three-lens review, logs findings by class |
| **Janitor** | standard | Turns recurring findings into controls → **Gate 3** |

## The three gates

**Gate 1** — after clarification. **Gate 2** — after the plan converges, before
any code. **Gate 3** — before any harness change.

Gate 3 is the one worth defending. A new hook changes every contributor's
workflow, not just the agent's.

## The deterministic core

Everything a CPU can settle lives in one zero-dependency Node CLI, not in a
prompt:

```bash
office next                 # next ready task, dependency-ordered
office check <id>           # run the task's executable definition of done
office scope <id>           # assert the diff stayed inside the task's globs
office validate             # schema, duplicate ids, orphan deps, cycles
office audit                # stacks, existing controls, harnessability score
office pack show <stack>    # controls in strangler order for a legacy repo
office findings recur       # defect classes that should become controls
```

`office help` lists the rest.

## What makes a task done

`dod:` is prose for the human. **`checks:` is the contract** — shell commands
that must exit 0. `office validate` rejects an empty `checks:` list.

A check must fail before the work and pass after. One that is already green on
an untouched checkout verifies nothing.

## Legacy repos

`office pack show <stack>` prints controls in adoption order. Follow it. The
failure mode is specific: enable strict checking repo-wide, get four thousand
errors, nobody triages them, the first person who hits the wall disables the
harness, and the repo is now worse than when you found it.

So: cheap already-clean controls first, thresholds pinned to current measured
values rather than targets, new-code-only gating where the tool supports it, and
hooks last.

## Documents

- [`PLAN.md`](./PLAN.md) — the implementation plan and the reasoning behind each
  departure from the original spec.
- [`skills-requests.md`](./skills-requests.md) — the original spec, preserved.
- [`.the-office/harness.md`](./.the-office/harness.md) — this repo's own harness,
  including its open gaps.

## Development

```bash
bash tests/run.sh                     # the sensor suite; must be green
git config core.hooksPath .githooks   # install the pre-commit sensor
```

The CLI stays zero-dependency. That is what lets a target repo run it with
nothing but the Node that Claude Code already requires.

## Releasing

**Releases are automatic.** Every merge to `main` that touches the shipped
surface — `payload/`, `packs/`, `templates/`, `install.sh`, `VERSION` — runs the
full CI suite and, if it passes, publishes a release. A README, docs, or CI-only
change publishes nothing; version churn for a typo fix makes the series
meaningless.

The version comes from [Conventional Commits](https://www.conventionalcommits.org/)
since the last tag:

| Commit | Bump | Notes section |
|---|---|---|
| `feat: …` | minor | Added |
| `fix: …` | patch | Fixed |
| `perf:` `refactor:` `revert:` | patch | Changed |
| `docs:` `test:` `ci:` `chore:` `build:` `style:` | patch | Internal |
| `feat!: …` or `BREAKING CHANGE:` in the body | **major** | Breaking |
| anything without a type prefix | patch | Changed |

So the commit message *is* the release note. `.githooks/commit-msg` warns when a
subject is not conventional — advisory, not blocking, because a hook that blocks
over a message is a hook people turn off.

`scripts/release.mjs` is the single implementation of "what version comes next
and what does it contain". CI calls it; so can you:

```bash
node scripts/release.mjs                     # plan only, changes nothing
node scripts/release.mjs --bump minor        # what a forced minor would do
node scripts/release.mjs --write --commit --tag   # cut one by hand
```

There is no hand-maintained `Unreleased` section in `CHANGELOG.md`. Under
auto-release `main` is always released, so it would always be empty; each
generated section is inserted beneath the `<!-- next-release -->` marker.

**Forcing a level.** Run the `release` workflow via *workflow_dispatch* and pick
`patch`, `minor`, or `major` to override what the commits imply.

**Loop safety.** The release commit touches `VERSION`, which is in the trigger's
path filter. It does not re-trigger, because a push authenticated with
`GITHUB_TOKEN` never starts a workflow; the `[skip ci]` marker in the commit
subject is a second guard.

## Desktop board UI

`board-ui/` is a Tauri app for viewing and editing the markdown kanban:

```bash
cd board-ui
npm install
npm run tauri dev
```

Open any repository folder that contains `.the-office/`. Drag tasks between
columns to claim / review / complete / block (same transition rules as the CLI),
and edit task markdown in the side panel.

## CI

| Job | What it covers |
|---|---|
| `sensors` | the suite on Node 18, 20, 22 |
| `shellcheck` | `install.sh`, `tests/run.sh`, both git hooks |
| `install` | clean install, upgrade preserving board state, uninstall keeping `.the-office/` |
| `docs` | every ```mermaid block in the README actually parses |
| `packs` | each pack's config run against the real tool — ruff, eslint, gofmt/vet, rustfmt, clippy |

`release` reuses this whole workflow via `workflow_call` rather than a subset,
so what gets published is exactly what CI is green on.

The `packs` job matters most: those configs ship into other people's
repositories, and before it existed nothing had ever executed them.
