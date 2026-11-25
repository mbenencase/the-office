# RFC 0006 — Integrations

| | |
|---|---|
| Status | Draft |
| Roadmap phase | [6 — Integrate](../ROADMAP.md#phase-6--integrate) |
| Depends on | [0002](./0002-headless.md), [0005](./0005-distribute.md) |
| Ships in | `payload/bin/office.mjs`, `installer/`, `templates/`, `packs/` |

## Summary

Four additions, in this order: a Codex target, board sync with GitHub Issues,
gates expressed as pull-request approvals, then Linear and new packs. Each can
ship alone.

## Motivation

A team adopting the-office already has a tracker, a review process and often a
different agent runtime. Today it would have to keep a markdown board in step
with its tracker by hand, approve specs in a terminal instead of in review, and
use Claude Code or Cursor.

## Current state

- `installer/` (after RFC 0005) transforms the payload for `claude` and
  `cursor`. The Cursor transform drops `tools`, sets every `model` to `inherit`,
  marks two agents read-only and turns commands into skills.
- The board is one directory per feature under `.the-office/features/`, with
  `overview.md` as the typed spec and one `task-*.md` per task. Status changes
  only through the CLI, and `done` requires verification evidence.
- After RFC 0002, `office run` drives the pipeline one role per process and
  exits 11 when it reaches a gate that needs a human.

## Design

### 1. Codex target

`--runtime codex` in the installer, and a `codex` adapter for `office run`.

The roles do not need to become native subagents in the target runtime. Since
RFC 0002 the supervisor is the orchestrator: it starts one process per role and
gives it that role's instructions. A runtime therefore needs only two things: a
non-interactive command that takes a prompt, and a place for standing
instructions.

- **Standing instructions** go into `AGENTS.md` in a managed block between
  `<!-- the-office:start -->` and `<!-- the-office:end -->`. The installer
  replaces the block and never touches text outside it; uninstall removes the
  block. The block holds what the `office` skill holds today: the routing
  contract, where the board lives, and how to call the CLI.
- **Role instructions** are installed as plain files under `.codex/office/roles/`
  with frontmatter stripped. The adapter passes the role file's content as the
  prompt prefix for each step.
- **Tiers.** `config.yml` `tiers` maps `fast`, `standard` and `deep` to model
  names per runtime. The adapter resolves the tier and passes the model on the
  command line. This is the first place the `tiers` map is read by code.
- **Token usage.** The adapter reports what the runtime reports. Where a
  runtime gives no usage, the run report says "not reported" for that role; it
  never prints zero.

The interactive `/office` flow on Codex is out of scope. A Codex user runs
`office run`.

Because `AGENTS.md` is read by several tools, the same block serves any runtime
that honours the file, and adding another adapter becomes a matter of the
command line.

### 2. GitHub Issues sync

```
office sync [--provider github] [--dry-run]
```

**Zero-dependency.** Node 18 ships `fetch`. The sync talks to the REST API
directly, with a token from `GITHUB_TOKEN`. No client library, and no
requirement that `gh` be installed.

**Mapping.**

| Board | GitHub |
|---|---|
| Feature | Issue. Title from the spec; body is the rendered spec. |
| Task | Sub-issue of the feature's issue, or a checklist line where sub-issues are unavailable. |
| Task status | One label of `office:pending`, `office:in-progress`, `office:review`, `office:blocked`, `office:completed`. |
| `block` reason, review findings | Comment on the task's issue. |
| `done` | Issue closed, with the commit linked. |

Each feature and task file records its counterpart in frontmatter:
`tracker: { provider: github, id: 123, synced: <updated_at> }`.

**Who owns what.** Two-way sync is where integrations rot, so each field has
exactly one owner and the other side is overwritten.

| Field | Owner | Reason |
|---|---|---|
| Status, attempts, commit, evidence | Board | A task is done when a machine verified it. Closing an issue by hand cannot make it so. |
| Spec and task contract, once approved | Board | The approval is bound to a hash of the file. |
| Assignee, milestone, priority, other labels | Tracker | The board has no opinion about them. |
| New requests | Tracker | An issue labelled `office:request` and not yet linked becomes input to `office run`. |
| A human's "stop" | Tracker | Closing an open task's issue as "not planned" becomes `office block --reason`. |

What flows from the tracker into the board is deliberately narrow: new requests
and stop signals. A person who wants the spec changed says so in a comment, and
that comment is the next request. Editing the issue body does nothing, and the
next sync restores it and adds a comment saying why.

If someone closes a task's issue as completed while the board disagrees, sync
reopens it with a comment naming the failing precondition. The headline metric
of this project is escaped defects; the tracker must not become a way to mark
unverified work done.

**Mechanics.** `sync` pulls, applies the two inbound rules through the normal
CLI commands (so they are logged as events), then pushes. It is idempotent:
running it twice changes nothing the second time. `--dry-run` prints the diff
for both sides. It runs after `office run` and from a workflow on `issues`
events; there is no daemon, because the-office stays files plus a CLI.

### 3. Gates as pull-request approvals

A shipped workflow template, `templates/workflows/office-gates.yml`, installed
on request by the Office Manager like any other harness control.

The flow for a feature:

1. `office run` reaches Gate 1 with policy `human`. Before exiting 11 it pushes
   a branch with the spec and opens a draft pull request whose description is
   the spec.
2. A reviewer approves the pull request. The workflow, on
   `pull_request_review`, takes the review's commit id, computes the spec hash
   at that commit, and runs
   `office spec approve <slug> --hash <hash> --by github:<login>`.
   The event log records `mode: pr`.
3. The workflow runs `office run --resume`. The plan lands as new commits.
   With "dismiss stale approvals" enabled, GitHub withdraws the first approval,
   and Gate 2 is the next approving review, bound to the plan hash at its
   commit.
4. Execution proceeds; each task is a commit on the same branch. The final
   review of the code is the team's ordinary review.

The binding to a commit is what makes this more than a button. An approval names
a commit; the hash is computed from the file at that commit; a later change to
the spec makes the stored approval stale, and `claim` already refuses a stale
approval.

Who may approve is the repository's own rule: `CODEOWNERS` on
`.the-office/features/**` and branch protection. the-office adds no permission
system of its own.

Gate 3 fits best of all. A harness change is a diff to hooks and CI
configuration, which is exactly what a pull request reviews.

### 4. Linear

The same `sync` command with `--provider linear`, the same ownership table, the
GraphQL API through `fetch`, and a key from `LINEAR_API_KEY`. Statuses map to
workflow states by name through a small table in `config.yml`, since each Linear
team defines its own.

The provider is an object with five functions (`list`, `create`, `update`,
`comment`, `close`). GitHub is written first, concretely; the interface is
extracted when Linear is added, not before.

### 5. Packs

A new pack is admitted when it comes with:

- `pack.json` and `GUIDE.md`, with every `files:` entry resolving, as
  `tests/run.sh` already checks;
- a CI job that proves its configs parse and its tools run, like the four
  existing stacks;
- at least one golden-set task for the stack, with a hidden suite.

The third requirement is new. A pack whose effect cannot be measured is a pack
nobody can tune, and it is the golden-set contributors who decide what comes
next.

## Harness cell

- Codex target and tracker sync: neither guide nor sensor. They change where the
  harness runs and where its state is visible.
- Pull-request gates: a computational guide. The approval is checked by hash
  before any code is written.
- Packs: computational sensors, by definition.

## Alternatives considered

- **Translate each role into the target runtime's native agent format.** That is
  what the Cursor transform does, and it means one transform per runtime, each
  chasing that runtime's format. The supervisor makes it unnecessary for
  headless use.
- **Make the tracker the source of truth for status.** Simplest for the team and
  fatal for the project: "done" would mean somebody clicked.
- **Shell out to `gh`.** Shorter code, and a dependency every CI image and every
  developer machine would need.
- **GitHub Projects fields instead of labels.** Better boards, but a different
  API surface and permissions model. Labels work on every repository.
- **One pull request per gate.** Clean separation, three pull requests per
  feature. Rejected for the noise.
- **Webhooks to a service.** Not planned; see the roadmap.

## Risks

- **API limits and partial failure.** A sync that stops halfway leaves the two
  sides different. Every operation is idempotent and keyed by the stored
  `tracker.id`, so rerunning converges.
- **Sync writes to committed files.** The `tracker:` frontmatter changes on
  first sync. It is board state, already excluded from verification snapshots,
  but it does produce a commit.
- **The workflow holds a token that can approve specs.** Approval through the
  workflow is only as strong as the repository's branch protection. The
  documentation says which settings the design assumes.
- **Tracker users overwritten.** Someone who edits an issue body loses the edit.
  The restoring comment explains, but it will annoy. It is the price of one
  owner per field.
- **Runtimes move.** Command-line flags and instruction-file conventions of
  other runtimes change faster than this repository. Each adapter is small, and
  its assumptions are verified against that runtime's current documentation when
  it is written, not taken from this RFC.

## Test plan

- Installer: `AGENTS.md` block is added, replaced and removed without touching
  surrounding text; a file with no block and a file with a hand-edited block.
- Sync: against a local HTTP server from Node's standard library that plays back
  recorded responses. Cases: first sync, no-op second sync, inbound request,
  inbound stop, issue closed by hand and reopened, failure halfway and rerun.
- Gates: the workflow's hash step is a CLI command, tested like any other; the
  workflow file is checked by `actionlint`.
- One end-to-end job against a scratch GitHub repository, on demand.

## Exit criteria

1. A team using GitHub Issues and a runtime other than Claude Code runs a
   request from an issue to a completed board without editing a file under
   `.the-office/` by hand.
2. Spec, plan and harness approvals in that run are pull-request reviews,
   recorded in the event log with the reviewer's login.
3. An issue closed by hand does not produce a `completed` task.

## Open questions

- Should sync create issues for every task, or only for features, with tasks as
  a checklist? Sub-issues give each task a status and a discussion; a checklist
  is far less noise in a busy tracker.
- Should `office run` open the pull request itself, or leave that to the
  workflow? The first needs a token in the supervisor's environment; the second
  keeps every network call in one place.
- Which pack comes first? Left to golden-set contributors, as the roadmap says.
