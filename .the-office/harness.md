# Harness manifest

<!--
  Written by the Office Manager, maintained by the Janitor.
  The single place that answers "what regulates this repo, and why".
-->

**Repo class:** greenfield · **Stacks:** node (detected as `typescript`; it is plain ESM)
**Harnessability:** 53/100 (medium) · **Last audited:** 2026-08-26 · `office audit`

## Score components

| Component | Score | Max | Reading |
|---|---|---|---|
| Typing | 5 | 25 | No type checker. See gaps. |
| Boundaries | 16 | 20 | `payload/` `packs/` `templates/` `tests/` are cleanly separated |
| Tests | 25 | 25 | `tests/run.sh`, 38 assertions |
| Build | 4 | 15 | No lockfile — deliberate, there are no dependencies to lock |
| Controls | 3 | 15 | Low by design; see gaps |

## Controls in place

| Control | Cell | Check command | Installed |
|---|---|---|---|
| Board schema validation | computational-sensor | `office validate` | v0.1.0 |
| Executable DoD | computational-sensor | `office check <id>` | v0.1.0 |
| Scope allowlist | computational-guide | `office scope <id>` | v0.1.0 |
| Self-test suite | computational-sensor | `bash tests/run.sh` | v0.1.0 |
| CLI syntax check | computational-sensor | `node --check payload/bin/office.mjs` | v0.1.0 |
| Pack manifest validity | computational-sensor | in `tests/run.sh` | v0.1.0 |
| Agent/skill frontmatter | computational-sensor | in `tests/run.sh` | v0.1.0 |
| Model-alias validity | computational-sensor | in `tests/run.sh` | v0.1.0 |
| VERSION/CLI drift | computational-sensor | in `tests/run.sh` | v0.1.0 |
| Pre-commit hook | computational-sensor | `.githooks/pre-commit` | v0.1.0 |
| Repo conventions | inferential-guide | `CLAUDE.md` | v0.1.0 |

The last four sensors exist because they are this repo's real failure modes: a
malformed `pack.json` breaks installs silently, an agent missing frontmatter is
invisible to Claude Code, an unknown model alias falls back without warning, and
a VERSION that drifts from the CLI constant makes upgrade diagnosis impossible.
None of them would be caught by a general-purpose linter.

## Gaps, and why they are still gaps

| Gap | Cost | Why not yet |
|---|---|---|
| Type checking | medium | The CLI is one 700-line zero-dependency file. Adding TypeScript means a build step and a `node_modules`, which would break the "clone and run" property the installer depends on. Revisit if the CLI passes ~1500 lines. |
| Linter | low | Genuine gap, not a decision. Biome would work without a build step. **Open.** |
| Coverage floor | medium | `tests/run.sh` is a shell harness with no instrumentation. Meaningful coverage needs a real test runner, which reopens the dependency question. |
| CI pipeline | low | Genuine gap. `tests/run.sh` should run on push. **Open.** |
| shellcheck on `install.sh` | low | `install.sh` is the least-tested surface here and it is shell. **Open.** |
| Markdown link checking | low | Agents reference skills by name; a rename would break the reference silently. **Open.** |

Four of these six are open gaps, not decisions. Recorded rather than hidden —
a gap left open on purpose is a decision, a gap left open by accident is a bug,
and this table has to distinguish them.

## Adoption order

Not applicable — greenfield. Every control above was installed at full strength
on arrival, with no ratchets.

## Ratchets

None. Nothing here is pinned to a current measured value.

## Known limitation of the audit itself

`office audit` recognises four stacks. A repo outside them scores 0 on typing
and, before v0.1.0's universal test probe, scored 0 on tests as well — this repo
did, which is how that gap was found. The universal probes cover test
entrypoints, hooks, CI, and guides; nothing covers types outside the four
stacks. Recorded here rather than papered over.
