---
name: office-harness
description: How to audit a repository's harness, score its harnessability, and install missing controls in an order a legacy codebase can absorb. Use when onboarding a repo, proposing harness changes, or converting a recurring defect into a computational control.
---

# Harness procedure

## The matrix

Every control occupies one cell. Name the cell when you propose one — it is how
you notice you have built four inferential sensors and no guides.

|  | **Guides** (before) | **Sensors** (after) |
|---|---|---|
| **Computational** | types, schemas, scaffolds, scope allowlists | linters, tests, coverage, hooks, fitness functions |
| **Inferential** | CLAUDE.md, skills, specs | review agents, LLM-as-judge |

Computational controls are cheap, deterministic, and run on every change.
Inferential ones are expensive and probabilistic. Prefer up and left. A rule
that could be a type should not be a paragraph in CLAUDE.md.

## Audit and catalog (computational)

```bash
$OFFICE audit [--json] [--stack <stack>]
$OFFICE propose [--json] [--stack <stack>]
$OFFICE bootstrap --stack <stack>           # init + propose; nothing installed
$OFFICE bootstrap --stack <stack> --apply   # after Gate 3 only
$OFFICE pack list
$OFFICE pack show <stack>    # controls in strangler order, with notes
$OFFICE pack install <stack> [--apply] [--dry-run] [--force] [--controls id,...]
```

The audit is the computational half: stacks, existing controls, harnessability
score, greenfield vs legacy, `kickoff_eligible`. It is never wrong about what
files exist and it cannot see anything else.

`office propose` is the Gate 3 draft from the pack catalogue. Present it. Do not
rewrite it. Do not copy `files:` by hand — `--apply` does that, writes
`.the-office/harness.md`, and appends `GUIDE.md` into `CLAUDE.md` inside
`<!-- the-office:<stack>-guide -->` markers.

On a **greenfield** repo do not do the archaeology. Install the full pack at
maximum strictness with real thresholds. It will never be this cheap again.

On a **legacy** repo, the first Gate 3 is the cheap prefix only. Archaeology —
boundaries that exist only in people's heads, conventions followed everywhere
and written nowhere, bug classes fixed more than once — is a later Gate 3, after
product work may already have started. Do not block the first `/office` on it.

If no stack is detected (empty repo), pass `--stack`. Do not invent one.

## Harnessability

The score (0–100) is a pace decision, not a go/no-go:

| Component | Max | Proxy |
|---|---|---|
| Typing | 25 | How much a compiler proves before a test runs |
| Boundaries | 20 | Whether module structure is legible |
| Tests | 25 | Whether behaviour is verifiable at all |
| Build | 15 | Whether a checkout reproduces (lockfile present) |
| Controls | 15 | Share of the stack's expected controls present |

A low score means the repo needs a harness most and can absorb it least. Slow
down the *legacy* strangler; do not skip the cheap prefix, and do not skip
Gate 3.

## Installing on a legacy repo

`office pack show <stack>` prints the order. The first `--apply` without
`--controls` installs the cheap prefix (guides, formatter, linter, vet). Follow
the rest later. The failure mode is specific:

> Enable strict checking repo-wide → four thousand errors → nobody triages them
> → the first person who hits the wall disables the harness → the repo is now
> worse than when you found it.

Four rules that prevent it:

1. **Cheap, already-nearly-clean controls first.** Formatters, `go vet`-class
   checks. These usually pass on arrival.
2. **Pin thresholds to the current measured value, not the target.** A coverage
   floor above current coverage blocks the next commit. Record current and
   target in the Ratchets table; raising it is a task on the board. Until
   measured, leave coverage as a gap (`medir na primeira execução`).
3. **New-code-only gating where the tool supports it** — `new-from-rev` in
   golangci-lint, a narrowed `include` in tsconfig, per-module opt-in in mypy.
   Gates what is being written without demanding a backlog rewrite.
4. **Hooks last.** A hook installed before the underlying tools are clean gets
   bypassed with `--no-verify`, which is worse than no hook.

## Gate 3

Propose; do not install. The proposal is CLI output. Wait for explicit approval,
then `--apply`.

Never install "just the safe ones" to save a round trip. Never `--apply` without
that approval. Never hand-edit pack files into the repo when the CLI would do it.

## Recording

`.the-office/harness.md` is the single answer to "what regulates this repo, and
why". The CLI writes it on `--apply`. Every control gets a row with its cell and
check command. Every gap gets a row saying why it is still a gap — a gap left
open on purpose is a decision, a gap left open by accident is a bug, and the
file has to distinguish them.
