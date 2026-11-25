# RFCs

One RFC per phase of the [product roadmap](../ROADMAP.md). The roadmap says what
each phase delivers and in what order; an RFC says how, and which decisions are
still open.

| RFC | Phase | Status | Depends on |
|---|---|---|---|
| [0001 — Event log and stats](./0001-instrument.md) | 1 — Instrument | Draft | — |
| [0002 — Headless runs](./0002-headless.md) | 2 — Headless | Draft | 0001 |
| [0003 — Golden set and benchmark](./0003-golden-set-and-benchmark.md) | 3 — Golden set and benchmark | Draft | 0001, 0002 |
| [0004 — Ablation and tuning](./0004-ablate-and-tune.md) | 4 — Ablate and tune | Draft | 0003 |
| [0005 — Distribution](./0005-distribute.md) | 5 — Distribute | Draft | 0001 |
| [0006 — Integrations](./0006-integrate.md) | 6 — Integrate | Draft | 0002, 0005 |

## Status

- **Draft** — open for comment; nothing in it is decided.
- **Accepted** — the design is agreed and its open questions are answered in the
  text. Implementation may start.
- **Implemented** — the phase's exit criteria are met.
- **Superseded** — replaced by a later RFC, which is linked from the header.

## Conventions

- An RFC is numbered in roadmap order and never renumbered.
- Every RFC states the phase's exit criteria as checks a machine can run, and
  says which cell of the harness each change lands in: guide or sensor,
  computational or inferential.
- An RFC does not promise a version. Versions come from Conventional Commits
  through `scripts/release.mjs`.
- When an RFC and the roadmap disagree, the RFC is wrong until the roadmap is
  changed in the same pull request.
