---
description: Audit this repository's harness and propose the controls it is missing.
argument-hint: [stack, e.g. python | typescript | go | rust]
---

Onboard this repository. Stack argument: **$ARGUMENTS** (a pack name — python, typescript, go, or rust. If empty, detect it; if nothing is detected, ask — do not invent a stack.)

The catalog is computational. Do not copy pack files by hand and do not do archaeology on greenfield.

1. If `.the-office/` does not exist, run `node .claude/office/bin/office.mjs init` (add `--stack <name>` when known).
2. Delegate to `office-manager`. It loads `office-harness` and runs `office bootstrap --stack <name>` (or `office propose --json` when the board already exists). Present **that CLI output** as the Gate 3 proposal. Do not rewrite it into an essay.
3. **Stop at Gate 3.** Wait for explicit approval before `--apply`.
4. On approval, run `node .claude/office/bin/office.mjs bootstrap --stack <name> --apply`. That copies pack files, writes `.the-office/harness.md`, and appends the pack GUIDE into `CLAUDE.md`. Do not merge guides by hand.

**Greenfield:** do not do the archaeology. Full pack at maximum strictness. After `--apply`, product work may start (`/office <request>` uses the kickoff route).

**Legacy:** Gate 3 on this pass is the cheap strangler prefix only (guides, formatter, linter, vet). Archaeology and the rest of the pack are a later Gate 3 — after the first `/office` may already have started. Do not block the SWE on archaeology.
