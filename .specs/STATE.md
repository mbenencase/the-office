# Project state

## Decisions

Decisions that reach past one feature live in `docs/rfcs/` (one RFC per roadmap phase). No second
log is kept here.

## Handoff

**Feature**: event-log-stats (RFC 0001, `docs/rfcs/0001-instrument.md`)
**Where**: plan approved by the user on 2026-11-25; `checks.md` written and `validate_checks.py` exits 0 (43 checks, profile `light`). No test and no code written yet; C1-C43 all open.
**In progress**: nothing
**Next step**: Build. Read `.specs/features/event-log-stats/checks.md` and `plan.md`, write `tests/events.test.mjs` from the checks (never from the implementation), implement in `payload/bin/office.mjs`, run each proof, commit with Conventional Commits. After the last commit, the session holding the feature dispatches a fresh Verifier over `13f24e9..HEAD` with every check, then runs `validate_verification.py event-log-stats`.
**Blockers**: none
**Uncommitted**: none
**Branch**: development (feature base `13f24e9`)
