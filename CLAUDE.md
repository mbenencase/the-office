# the-office

A versioned set of Claude Code skills that install a working harness into a
repository, then build software through it.

## What this repo is

- `payload/` — everything `install.sh` copies into a target repo's `.claude/`.
  Agents, skills, commands, and the CLI.
- `packs/` — per-stack control catalogues. `pack.json` is the machine-readable
  manifest; `GUIDE.md` is the feedforward text merged into a target's CLAUDE.md.
- `templates/` — scaffolds the roles fill in.
- `tests/run.sh` — this repo's own sensor suite. Run it before every commit.

## Working here

```bash
bash tests/run.sh                        # the sensor suite; must be green
node payload/bin/office.mjs help         # the CLI, run from this repo
./install.sh /path/to/target --link      # symlink install, for iterating
```

`git config core.hooksPath .githooks` installs the pre-commit hook.

## Conventions

- **The CLI stays zero-dependency.** No `node_modules` in this repo. The
  installer's whole value is that a target repo can run the CLI with nothing but
  the Node that Claude Code already requires. A dependency here costs that.
- **Anything deterministic goes in the CLI, not in a prompt.** If a model is
  reasoning about something a CPU could settle — board state, dependency order,
  whether a check passed — that logic is in the wrong place.
- **`VERSION` and the `VERSION` constant in `office.mjs` must match.**
  `tests/run.sh` enforces it.
- **Every agent needs `name`, `description`, and a model alias** of `haiku`,
  `sonnet`, `opus`, or `inherit`. An unknown alias falls back silently.
- **Every skill needs a `description`** — it is what Claude Code matches against
  when deciding whether to load the skill.
- **A new control in a pack needs its files to exist.** `tests/run.sh` checks
  that every `files:` entry in every `pack.json` resolves.
- **Agents reference skills by name.** Renaming a skill directory breaks every
  agent that names it, and nothing currently catches that — grep before renaming.

## The thing this repo is about

`Agent = Model + Harness`. A harness is guides that steer before the model acts
and sensors that catch it after, each either computational (deterministic,
cheap, every change) or inferential (a model's judgement).

The roles in `payload/agents/` are inferential controls. Their purpose is to
produce *computational* ones. When adding to this repo, ask which cell a change
lands in — a pipeline of review agents that produces no linters, no types, and
no tests has rebuilt the problem it was built to solve.
