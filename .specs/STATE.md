# Project state

## Decisions

Decisions that reach past one feature live in `docs/rfcs/` (one RFC per roadmap phase). No second
log is kept here.

## Handoff

**Feature**: headless-run (RFC 0002, `docs/rfcs/0002-headless.md`)
**Where**: built and verified on 2026-11-25 on branch `feat/headless-run`. Commits `c2338c6` (feat!), `1f6da1a` (ci), `a74e829` (docs) over base `84e5638`; the independent Verifier passed 72/72 checks at profile `light` and `validate_verification.py` exits 0.
**In progress**: nothing
**Next step**: review and merge the PR into `development`. Open follow-ups: `office run --resume` after a non-converged plan reaches gate 2 without re-planning (auto-approves under `approvals.plan: auto`); the `headless` workflow has never run and needs the `ANTHROPIC_API_KEY` secret; `OFFICE_STEP_TIMEOUT_MS` is an undocumented override in the payload; no test feeds `claim` a `spec-approval.json` without `mode`; the merge to `main` publishes 1.0.0 unless forced with `--bump minor`.
**Blockers**: none
**Uncommitted**: none
**Branch**: feat/headless-run
