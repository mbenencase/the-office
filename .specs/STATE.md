# Project state

## Decisions

Decisions that reach past one feature live in `docs/rfcs/` (one RFC per roadmap phase). No second
log is kept here.

## Handoff

**Feature**: headless-run (RFC 0002, `docs/rfcs/0002-headless.md`)
**Where**: built and verified on 2026-11-25 on branch `feat/headless-run`, PR #11 against `development`. Commits `c2338c6` (feat!), `1f6da1a` (ci), `a74e829` (docs), `b9bf0c7` (fix: re-review on resume) over base `84e5638`; the independent Verifier passed 74/74 checks at profile `light` (round 2, scoped) and `validate_verification.py` exits 0.
**In progress**: nothing
**Next step**: review and merge PR #11. Open follow-ups: the `headless` workflow has never run and needs the `ANTHROPIC_API_KEY` secret; the resume re-review applies only while every task is `pending` (a hand-claimed task skips it) and its stale-approval case has no test; `OFFICE_STEP_TIMEOUT_MS` is an undocumented override in the payload; no test feeds `claim` a `spec-approval.json` without `mode`; the merge to `main` publishes 1.0.0 unless forced with `--bump minor`.
**Blockers**: none
**Uncommitted**: none
**Branch**: feat/headless-run
