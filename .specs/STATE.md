# Project state

## Decisions

Decisions that reach past one feature live in `docs/rfcs/` (one RFC per roadmap phase). No second
log is kept here.

## Handoff

**Feature**: event-log-stats (RFC 0001, `docs/rfcs/0001-instrument.md`)
**Where**: built and verified on 2026-11-25. Commits `7167fdd` (feat) and `1b08c4c` (docs) over base `13f24e9`; the independent Verifier passed 43/43 checks at profile `light` and `validate_verification.py` exits 0.
**In progress**: nothing
**Next step**: the user decides when to push `development` and merge to `main` (the merge publishes a minor release). Open follow-ups from the Verifier: C16 does not pin "takes no lock"; C31 snapshots only `.the-office/`; README and skill docs do not mention `office stats`.
**Blockers**: none
**Uncommitted**: none
**Branch**: development
