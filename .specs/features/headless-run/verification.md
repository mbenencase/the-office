# Headless runs verification

**Verdict**: PASS
**Profile**: light
**Diff range**: development..HEAD (84e5638..b9bf0c7)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Scope of round 2: the fix `b9bf0c7` (`6d711bc..b9bf0c7`; `892a987` in between added only this
report and a `STATE.md` handoff). Round 1 was PASS, 72/72, verified at `6d711bc`, so no non-PASS
verdict is owed a re-judgment. Every proof was re-run in full at `b9bf0c7`. C73 and C74 are new and
fully verified. Every check whose behaviour runs through the resume / plan / gate 2 path was
re-judged against the diff. Everything else is carried from `6d711bc` and says so, row by row and
section by section.

Profile `light`: the `Coverage` recompute, `Test policy` verdicts and fault injection did not run
in either round. No assertion below has been made to fail once, so "a test that would pass under a
wrong implementation" is not excluded by this report; that includes the two new tests. Step 1
(binding sources) is `ui` only and did not run. Step 5 does not apply (no user-facing flow).

## Proofs - verified at b9bf0c7

All run by the Verifier at `b9bf0c7` on a clean tree:

- `R` = `node --test --test-reporter=tap tests/run.test.mjs` - exit 0, 72 top-level tests and 20
  subtests, 92 pass, 0 fail, 0 skipped, 0 todo. Each named test below appeared individually as
  `ok N - <name>`; no pattern in `checks.md` matched zero tests.
- `E` = `node --test --test-reporter=tap --test-name-pattern="office.mjs imports only node modules" --test-name-pattern="inline config equals the template" tests/events.test.mjs` - exit 0, 2 tests matched, 2 pass.
- `S70` = the C70 shell proof as written - exit 0.
- `S72` = the C72 grep proof as written - exit 0.
- `G` = `bash tests/run.sh` - exit 0, 51 passed, 0 failed.

All `file:line` citations without a file name are in `tests/run.test.mjs`. The fix inserted 30
lines at `tests/run.test.mjs:1009-1038` in a single hunk, so every citation from the old `:1009`
on moved by +30 and was refreshed; citations above it are byte-identical to round 1.
`payload/bin/office.mjs` gained 6 lines at `:1693-1698`; no round 1 citation sits below that point.
`README.md` gained 3 lines at `:265-267`.

## Checks

Proof column: every row re-run at `b9bf0c7`. Evidence column: each row ends with `verified at`,
`re-judged at` (touched path, assertion and behaviour re-read at the new head) or `carried from`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | happy run exits 0, both tasks completed, exact 8-role sequence | R `ok 1 - happy feature run completes the board` | `:172` `assert.equal(r.status, 0)` · `:173-174` `assert.equal(f.status(T1/T2), 'completed')` · `:175` `assert.deepEqual(f.roles(), HAPPY_ROLES)` · re-judged at `b9bf0c7`: fresh run: `review` is false (`opts.resume` false, `office.mjs:1696`), sequence unchanged | PASS |
| C2 | first event `run_start` with id pattern, request hash, runtime, outcome, v; request text stored nowhere | R `ok 2 - run_start event and no stored request` | `:182` `assert.match(first.run, /^r-\d{8}T\d{9}Z$/)` · `:183` `assert.equal(first.request_hash, sha256(REQUEST))` · `:184-186` runtime/outcome/v · `:191` `assert.ok(!fs.readFileSync(name, 'utf8').includes(REQUEST))` over every file under `.the-office` · carried from `6d711bc` | PASS |
| C3 | argv exactly the 8 arguments in order, nothing after; cwd is the board root | R `ok 3 - runtime argv and cwd` | `:199` `assert.equal(call.argv.length, 8)` · `:201` `assert.deepEqual([p, agent, role, fmt, json, mode, accept], ['-p', '--agent', HAPPY_ROLES[i], '--output-format', 'json', '--permission-mode', 'acceptEdits'])` · `:203` `assert.equal(fs.realpathSync(call.cwd), f.root)` · carried from `6d711bc` | PASS |
| C4 | `plan` after `--permission-mode`; argv ends with `--allowedTools`, `Read`, `Bash(git diff *)` | R `ok 4 - permission mode and allowed tools pass through` | `:214` `assert.equal(call.argv[call.argv.indexOf('--permission-mode') + 1], 'plan')` · `:216` `assert.deepEqual(call.argv.slice(8), ['--allowedTools', 'Read', 'Bash(git diff *)'])` · carried from `6d711bc` | PASS |
| C5 | unset: the `claude` on PATH runs (marker); set: marker not written | R `ok 5 - OFFICE_RUNTIME_CMD overrides claude` | `:236` `assert.ok(fs.existsSync(marker))` · `:242` `assert.ok(!fs.existsSync(marker))` · `:243` `assert.equal(f.calls().length, 1)` · carried from `6d711bc` | PASS |
| C6 | slug from the Judge, or from `--feature`; `run_end` has `feature: "salute"` | R `ok 6 - route and slug come from the judge or --feature` | `:251` `assert.ok(judged.prompts('office-product-owner')[0].includes('greeting'))` · `:262-263` `prompt.includes('salute')` and `!prompt.includes('greeting')` · `:265` `assert.equal(lastEvent(flagged).feature, 'salute')` · carried from `6d711bc` | PASS |
| C7 | Product Owner prompt holds the request verbatim and the slug | R `ok 7 - spec step prompt carries request and slug` | `:275` `assert.ok(prompts[0].includes(REQUEST))` · `:276` `assert.ok(prompts[0].includes('salutation'))` · carried from `6d711bc` | PASS |
| C8 | PO steps `unmet` then `ok`, run proceeds | R `ok 8 - unmet step is retried once` | `:283` `assert.deepEqual(...map((e) => e.outcome), ['unmet', 'ok'])` · `:282` exit 0 · carried from `6d711bc` | PASS |
| C9 | PO invoked exactly twice, `run_end` failed, exit 1 | R `ok 9 - step unmet twice fails the run` | `:290` `assert.equal(r.status, 1)` · `:291` `...length, 2` · `:294` `assert.equal(lastEvent(f).outcome, 'failed')` · carried from `6d711bc` | PASS |
| C10 | three unusable Judge outputs each recorded `unmet` and re-invoked | R `ok 10 - unusable judge output is unmet` with subtests `no route line`, `route: other`, `route: feature without a slug` each ok | `:309` `assert.deepEqual(f.roles().slice(0, 2), ['office-judge', 'office-judge'])` · `:310` `assert.deepEqual(...outcome), ['unmet', 'ok'])` · carried from `6d711bc` | PASS |
| C11 | planner, DA, planner, DA between gate 1 and the first SWE | R `ok 11 - plan loop repeats until approved` | `:322` `assert.deepEqual(roles.slice(2, firstSwe), ['office-planner', 'office-devils-advocate', 'office-planner', 'office-devils-advocate'])` · re-judged at `b9bf0c7`: fresh run: the Planner guard `i > 0 || !review` (`office.mjs:1710`) is true on every pass | PASS |
| C12 | planner and DA twice each, no SWE, blocked, exit 10 | R `ok 12 - plan that does not converge is blocked` | `:328` `assert.equal(r.status, 10)` · `:330-331` counts `2` · `:332` no SWE · `:334` `assert.equal(lastEvent(f).outcome, 'blocked')` · re-judged at `b9bf0c7`: fresh run: same guard, two Planner and two Devil's Advocate calls still asserted exactly | PASS |
| C13 | approved verdict with a failing `office validate`: no gate 2 approval, no SWE | R `ok 13 - approved verdict does not override a failing validate` | `:341` `f.office(1, 'validate')` · `:343` `assert.ok(!f.exists(PLAN_APPROVAL))` · `:344` no `approve` event with `gate === 'plan'` · `:345` `assert.ok(!f.roles().some((role) => role.startsWith('office-swe')))` · re-judged at `b9bf0c7`: fresh run; the result is unchanged and the round 1 precision gap (no exit code pinned) stands | PASS |
| C14 | trivial route: exit 0, no DA, no `plan-approval.json`, no plan `approve` event | R `ok 14 - trivial route skips the devil's advocate and gate 2` | `:353` exit 0 · `:355` exact role list · `:357` `assert.ok(!f.exists(PLAN_APPROVAL))` · `:358` no plan approve event · re-judged at `b9bf0c7`: route `trivial` never sets `review` (`route === 'feature'`, `office.mjs:1696`) | PASS |
| C15 | SWE role per tier (3 tiers), lowest ready `task_no` first | R `ok 15 - swe role by tier in task order` | `:367-371` `assert.deepEqual(swe, [['office-swe-fast', 'greeting/task-02'], ['office-swe-deep', 'greeting/task-01'], ['office-swe', 'greeting/task-03']])` · carried from `6d711bc` | PASS |
| C16 | SWE, Reviewer, SWE, Reviewer for the retried task; ends completed | R `ok 16 - reviewer retry re-invokes the swe` | `:378` `assert.deepEqual(..., ['office-swe-fast', 'office-reviewer', 'office-swe-fast', 'office-reviewer'])` · `:379` `'completed'` · carried from `6d711bc` | PASS |
| C17 | two pairs, task blocked, `block` event with reason and `from` | R `ok 17 - review iterations exhausted blocks the task` | `:390-391` counts `2` · `:392` `'blocked'` · `:396` `assert.equal(blocks[0].reason, 'review_iterations exhausted')` · `:397` `assert.equal(blocks[0].from, 'in-progress')` · carried from `6d711bc` | PASS |
| C18 | task-03 completed, task-02 never claimed, blocked, exit 10 | R `ok 18 - a blocked task does not stop independent tasks` | `:402` exit 10 · `:404` task-03 `'completed'` · `:406` no `claim` event for T2 · `:409` `'blocked'` · carried from `6d711bc` | PASS |
| C19 | janitor exactly once, after the last Reviewer, before `run_end`; never when no class recurs | R `ok 19 - janitor runs only when a class recurs` | `:419` count `1` · `:421` after last reviewer · `:423-425` `run_end` last, janitor step before it · `:430` `assert.ok(!none.f.roles().includes('office-janitor'))` · carried from `6d711bc` | PASS |
| C20 | 8 `step` events in invocation order with the required keys; feature/task placement | R `ok 20 - one step event per invocation` | `:436` `assert.equal(steps.length, 8)` · `:437` roles equal invocation order · `:442-444` outcome, `duration_ms`, `usage` · `:446-447` Judge has no `feature`/`task` · `:449-450` · `:452` `assert.deepEqual(steps.slice(4).map((e) => e.task), [T1, T1, T2, T2])` · carried from `6d711bc` | PASS |
| C21 | four crash causes: invoked once, `crashed`, stderr names the cause, failed, exit 1 | R `ok 21 - crashed step fails the run without retry` with subtests `exit3`, `notjson`, `is_error`, `no_usage` each ok | `:456` the four causes · `:461` exit 1 · `:462` count `1` · `:466` `assert.equal(planner[0].outcome, 'crashed')` · `:467` `assert.match(r.stderr, cause)` · `:469` `'failed'` · carried from `6d711bc` | PASS |
| C22 | timed-out stub is dead, step `timeout`, failed, exit 1; flag stays whole minutes, default 30 | R `ok 22 - timed-out step is killed and fails the run` | `:477` exit 1 · `:480` `assert.ok(!alive(planner[0].pid))` · `:482` `'timeout'` · `:484` `'failed'` · `:488` `assert.match(usage.stderr, /--step-timeout <minutes>.*default 30\b/)` · `:489` `--step-timeout 0.5` exits 2; code: `payload/bin/office.mjs:1635` `opts.stepTimeout * 60000` · carried from `6d711bc` | PASS |
| C23 | `--max-steps 3`: 3 invocations, failed, exit 1; usage states default 100 | R `ok 23 - max-steps stops the run` | `:495` exit 1 · `:496` `assert.equal(f.calls().length, 3)` · `:498` `'failed'` · `:499` `/--max-steps <n>.*default 100\b/` · carried from `6d711bc` | PASS |
| C24 | missing runtime: exit 1, stderr names it, log byte-identical | R `ok 24 - missing runtime executable` | `:506` exit 1 · `:507` `r.stderr.includes('/nonexistent/runtime')` · `:508` `assert.equal(f.log(), before)` · carried from `6d711bc` | PASS |
| C25 | `dup-id` board: exit 1, stub never invoked, no log line | R `ok 25 - invalid board refuses to start` | `:516` exit 1 · `:517` `assert.equal(s.calls().length, 0)` · `:518` `assert.equal(s.log(), before)` · carried from `6d711bc` | PASS |
| C26 | pre-existing `run.lock`: exit 1, named, stub uninvoked, log identical, lock intact | R `ok 26 - existing run lock refuses a second run` | `:526-529` · `:530` `assert.equal(f.read('.the-office/run.lock'), '424242')` · carried from `6d711bc` | PASS |
| C27 | `run.lock` present and `execution.lock` absent in every invocation; lock gone after exits 0, 1, 10, 11 | R `ok 27 - run lock lifecycle` | `:538` `assert.equal(call.run_lock, true)` · `:539` `assert.equal(call.execution_lock, false)` · `:541` · `:551` exit code · `:553` `assert.ok(!other.exists('.the-office/run.lock'))` over 1, 10, 11 · carried from `6d711bc` | PASS |
| C28 | eight usage errors: exit 2, usage on stderr, log identical, stub uninvoked | R `ok 28 - usage errors exit 2` | `:562-563` the eight argv rows, matching the check's list · `:565` `assert.equal(cases.length, 8)` · `:569` exit 2 · `:570` `/usage: office run/` · `:571` log · `:572` calls `0` · carried from `6d711bc` | PASS |
| C29 | no `approvals:` key, default gates: stops after PO with exit 11 | R `ok 29 - default policy is human` | `:582` config has no `approvals` · `:586` exit 11 · `:587` `assert.deepEqual(f.roles(), ['office-judge', 'office-product-owner'])` · carried from `6d711bc` | PASS |
| C30 | four policy rows at each of two gates | R `ok 30 - approvals win over gates` with 8 subtests each ok (4 `gate 1:`, 4 `gate 2:`) | `:591` the four rows · `:599-600` exit 11, no `SPEC_APPROVAL` · `:603` `assert.equal(JSON.parse(f.read(SPEC_APPROVAL)).mode, 'policy')` · `:611-612` · `:615` same for `PLAN_APPROVAL` · re-judged at `b9bf0c7`: all eight rows are fresh runs; `gatePolicy` (`office.mjs:230`) is untouched and now also read by `review` | PASS |
| C31 | gate 1 human: printed approve command with the current hash, `awaiting_approval`, exit 11, no file | R `ok 31 - gate 1 human stops with exit 11` | `:624` exit 11 · `:627` ``r.out.includes(`office spec approve greeting --hash ${hash} --by`)`` · `:629` · `:630` `assert.ok(!f.exists(SPEC_APPROVAL))` · carried from `6d711bc` | PASS |
| C32 | gate 2 human: printed plan approve command, `awaiting_approval`, exit 11, no file, no SWE | R `ok 32 - gate 2 human stops with exit 11` | `:636` · `:639` ``r.out.includes(`office plan approve greeting --hash ${hash} --by`)`` · `:641-643` · re-judged at `b9bf0c7`: fresh run under `human`; `gate()` (`office.mjs:1658-1665`) untouched | PASS |
| C33 | gate 1 auto: file fields and one `approve` event with the stated fields | R `ok 33 - gate 1 auto approval` | `:650-653` hash, `'policy:auto'`, `'policy'`, ISO `at` · `:655` count `1` · `:657-661` by, mode, hash, feature, outcome · carried from `6d711bc` | PASS |
| C34 | gate 2 auto: file fields, one plan `approve` event with that hash | R `ok 34 - gate 2 auto approval` | `:669-672` · `:674` count `1` · `:675-676` `mode`, `hash` · re-judged at `b9bf0c7`: fresh happy run; the gate call now takes `planFile` (`office.mjs:1722`), same path as before | PASS |
| C35 | matching human approval: gate passes, file byte-identical, no new spec `approve` event | R `ok 35 - matching approval is not rewritten` | `:687` exit 0 · `:688` `assert.equal(f.read(SPEC_APPROVAL), bytes)` · `:689` `assert.equal(count(), 1)` · re-judged at `b9bf0c7`: resume with no tasks: `tasksOf().length > 0` is false, so `review` is false and the Planner branch is entered as in round 1 | PASS |
| C36 | stale approval under auto is rewritten with the current hash and `mode: "policy"` | R `ok 36 - stale approval is replaced under auto` | `:700` `assert.equal(approval.hash, hash)` · `:701` `assert.equal(approval.mode, 'policy')` · re-judged at `b9bf0c7`: resume with no tasks and `--max-steps 1`; the spec gate runs before the new code | PASS |
| C37 | open questions: printed, no approval, blocked, exit 10; resume exits 10 with the question again | R `ok 37 - open questions block the run` | `:707-709` · `:711` `'blocked'` · `:713` `assert.equal(again.status, 10)` · `:714` `again.out.includes('Which locale?')` · carried from `6d711bc` | PASS |
| C38 | harness route: one invocation, `/office` printed, `awaiting_approval`, `route: "harness"`, exit 11 | R `ok 38 - harness route stops at exit 11` | `:721-723` · `:725` · `:726` `assert.equal(lastEvent(f).route, 'harness')` · carried from `6d711bc` | PASS |
| C39 | `spec approve` writes `mode: "human"`, appends exactly one `approve` event, stdout keys unchanged | R `ok 39 - spec approve records mode human` | `:737` `assert.deepEqual(Object.keys(printed).sort(), ['hash', 'id', 'open_questions', 'status', 'type'])` · `:740` `'human'` · `:741` `before + 1` · `:743-749` · carried from `6d711bc` | PASS |
| C40 | `plan approve` exits 0, writes the four fields, one plan `approve` event | R `ok 40 - plan approve writes the approval` | `:758` exit 0 · `:760-763` hash, `'ana'`, ISO, `'human'` · `:764` `before + 1` · `:766-770` · carried from `6d711bc` | PASS |
| C41 | five refusals exit 1, no file, log identical | R `ok 41 - plan approve refusals` with 5 subtests each ok | `:775-783` the five cases · `:785` `assert.equal(Object.keys(cases).length, 5)` · `:792` `f.office(1, ...args)` · `:793` no file · `:794` `assert.equal(f.log(), before)` · carried from `6d711bc` | PASS |
| C42 | `--by policy:*` refused on both commands, nothing written | R `ok 42 - command line refuses policy as approver` | `:803` `f.office(1, 'spec', 'approve', ..., '--by', 'policy:auto')` · `:804` `f.office(1, 'plan', 'approve', ..., '--by', 'policy:x')` · `:805-807` · carried from `6d711bc` | PASS |
| C43 | `plan status` object; draft, approved, stale; exit 0 and exit 1 | R `ok 43 - plan status` | `:815` exit 0 · `:820-824` id, hash, tasks `2`, `'draft'` · `:826` `'approved'` · `:829` `'stale'` · `:831` `f.office(1, 'plan', 'status', 'ghost')` · carried from `6d711bc` | PASS |
| C44 | plan hash unchanged by 6 fields, changed by 13 changes | R `ok 44 - plan hash covers the contract only` | `:848-855` six rows · `:856-870` thirteen rows, matching the check's lists · `:871-872` counts `6` and `13` · `:875` `assert.equal(f.planStatus().hash, base)` · `:880` `assert.notEqual(f.planStatus().hash, base)` · carried from `6d711bc` | PASS |
| C45 | five invalid config values exit 1 naming key and value; the valid config exits 0 | R `ok 45 - validate rejects invalid approvals and run config` | `:892-898` five rows · `:899` length `5` · `:901` `office(1, 'validate')` · `:902-904` line with key includes value · `:906` `office(0, 'validate')` · carried from `6d711bc` | PASS |
| C46 | PO prompt carries the headless rule | R `ok 46 - product owner prompt carries the headless rule` | `:911` · `:916-917` `Assumptions`, `open_questions` · `:918` ``assert.match(section, /never[^.]*`?office spec approve/i)``; file `payload/agents/office-product-owner.md:52-66` · carried from `6d711bc` | PASS |
| C47 | resume after gate 1 approval: exit 0, both completed, no Judge, no PO | R `ok 47 - resume after gate 1 approval completes the board` | `:927-929` 11, 0, 0 · `:930-931` · `:934-935` `!roles.includes('office-judge')`, `!roles.includes('office-product-owner')` · re-judged at `b9bf0c7`: resume with no tasks (`resumed`, `:140-148`): `review` false, Planner then Devil's Advocate as in round 1 | PASS |
| C48 | resume after gate 2 approval: exit 0, no planner, no DA | R `ok 48 - resume after gate 2 approval completes the board` | `:946` exit 0 · `:949-950` · re-judged at `b9bf0c7`: resume under `approvals.plan: human` with a current approval: `review` false on two counts; `:949-950` still exclude both roles | PASS |
| C49 | resumed `run_start`: new id, `request_hash: null`, `feature: "greeting"` | R `ok 49 - resume run_start` | `:958` `assert.notEqual(secondId, firstId)` · `:962` `assert.equal(start.request_hash, null)` · `:964` `'greeting'` · carried from `6d711bc` | PASS |
| C50 | resume takes the feature from the last `run_end` carrying one, or from `--feature` | R `ok 50 - resume picks its feature` | `:978` `assert.ok(id.startsWith('alpha/'))` · `:983` `assert.ok(id.startsWith('beta/'))` · `:977,982` non-empty · re-judged at `b9bf0c7`: behaviour on this test's path changed: default `AUTO`, tasks pending, no plan approval, so each resume now starts with `office-devils-advocate` (probe I). That step carries no `task`, so `:978` and `:983` still assert the claim | PASS |
| C51 | prior `route: "trivial"` proceeds and exits 0; no prior `run_end` stops at gate 2 with exit 11 | R `ok 51 - resume recovers the route` | `:997` exit 0 · `:999` no `PLAN_APPROVAL` · `:1004` `assert.equal(b.status, 11)` · `:1005` no calls · re-judged at `b9bf0c7`: both halves run under `approvals.plan: human`, so `review` is false; `:1005` `assert.equal(unknown.calls().length, 0)` pins that a human-policy resume invokes no Devil's Advocate | PASS |
| C52 | nothing to resume: exit 2 twice, no event, no stub | R `ok 54 - resume with nothing to resume` | `:1045` exit 2 · `:1046` log identical · `:1047` calls `0` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C53 | resume on a spec that fails `office spec validate`: `run_start` and `run_end` failed, no role, exit 1 | R `ok 55 - resume on an invalid spec fails` | `:1056` `f.office(1, 'spec', 'validate', 'greeting')` · `:1058` exit 1 · `:1059` `assert.deepEqual(f.runEvents().map((e) => [e.event, e.outcome]), [['run_start', 'ok'], ['run_end', 'failed']])` · `:1060` calls `0` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C54 | resume with an approved spec and no tasks: first role is the planner | R `ok 56 - resume plans when there are no tasks` | `:1067` `assert.deepEqual(f.roles(), ['office-planner'])` · re-judged at `b9bf0c7`: no tasks: `review` false; first and only role is still the Planner | PASS |
| C55 | resume continues the `in-progress` task with its SWE, the `review` task with the Reviewer | R `ok 57 - resume continues work in flight` | `:1083` `assert.deepEqual(..., [['office-swe', T2]])` · `:1084` step `task` · `:1091` `assert.deepEqual(..., [['office-reviewer', T2]])` · re-judged at `b9bf0c7`: task-01 is `completed`, so `every(... === 'pending')` is false and `review` is false; first role unchanged | PASS |
| C73 | under `auto`, resume after a non-converged plan runs exactly Devil's Advocate, Planner, Devil's Advocate, exits 10 `blocked`, writes no plan approval and no plan `approve` event | R `ok 52 - resume does not auto-approve a rejected plan` | `tests/run.test.mjs:1011` `assert.equal(f.run(REQUEST).status, 10)` · `:1015` `assert.equal(r.status, 10, r.out)` · `:1016` `assert.deepEqual(f.roles(), ['office-devils-advocate', 'office-planner', 'office-devils-advocate'])` (after `f.clearCalls()` at `:1013`, so the list is the resumed run's whole record) · `:1017` `assert.ok(!f.exists(PLAN_APPROVAL))` · `:1018` `assert.ok(!f.events().some((e) => e.event === 'approve' && e.gate === 'plan'))` (whole log, both runs) · `:1019-1020` `lastEvent(f).event === 'run_end'`, `.outcome === 'blocked'`; code `payload/bin/office.mjs:1696-1698`, `:1710` · verified at `b9bf0c7` | PASS |
| C74 | under `auto`, resume reviews first; on approval goes straight to `office-swe-fast`, never the Planner, exits 0, task-01 completed, `plan-approval.json` has `mode: "policy"` and the `plan status` hash | R `ok 53 - resume re-reviews an unapproved plan under auto` | `tests/run.test.mjs:1025` `assert.equal(f.run(REQUEST).status, 10)` · `:1029` `assert.equal(r.status, 0, r.out)` · `:1031` `assert.deepEqual(resumed.slice(0, 2), ['office-devils-advocate', 'office-swe-fast'])` with `resumed = f.roles().slice(before)` (`:1030`) · `:1032` `assert.ok(!resumed.includes('office-planner'))` · `:1034` `assert.equal(approval.mode, 'policy')` · `:1035` `assert.equal(approval.hash, f.planStatus().hash)` · `:1036` `assert.equal(f.status(T1), 'completed')` · verified at `b9bf0c7` | PASS |
| C56 | four endings with exit code and exactly one `run_end`; feature and route where the Judge returned | R `ok 58 - five endings five exit codes` | `:1103-1104` one `run_end`, outcome · `:1107` feature, route · `:1110-1111` 0 · `:1114-1117` 1 · `:1120-1122` 10 · `:1125-1126` 11 · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C57 | `--json`: one object with exactly five keys; run id, outcome, duration; stderr at least 8 lines | R `ok 59 - json report envelope` | `:1138` `assert.deepEqual(Object.keys(report).sort(), ['duration_ms', 'outcome', 'run', 'tasks', 'usage'])` · `:1139-1142` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C58 | `--report` equals `--json`; written for failed, blocked, awaiting_approval; not by a usage error | R `ok 60 - report file for every outcome` | `:1147` `assert.deepEqual(JSON.parse(f.read('out.json')), JSON.parse(r.stdout))` · `:1158` `assert.equal(report.outcome, outcome)` over three · `:1164` `assert.ok(!usage.exists('out.json'))` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C59 | step `usage` from a two-model `modelUsage` | R `ok 61 - step usage from modelUsage` | `:1175-1178` expected literal equal to the check's · `:1179` keys · `:1182` totals · `:1183-1184` per model, cost to 1e-9 (`:159`) · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C60 | `by_role` seven keys and values, `by_model`, `total` | R `ok 62 - report usage by role, model and total` | `:1191` seven keys · `:1192` reviewer doubled, others `STUB_A` · `:1193-1196` `by_model` and `total` equal `{800, 80, 40, 16, 0.08}` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C61 | crashed step with no `modelUsage`: `usage` null, role listed with zeros, total is the other steps | R `ok 63 - a step with no usage adds nothing` | `:1205` `assert.equal(planner.usage, null)` · `:1208` `assert.deepEqual(report.usage.by_role['office-planner'], { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0 })` · `:1209` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C62 | `tasks` counts for the three runs | R `ok 64 - report task counts` | `:1213` `{ completed: 2, blocked: 0 }` · `:1216` `{ completed: 1, blocked: 1 }` · `:1220` `{ completed: 0, blocked: 0 }` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C63 | report recomputed from the run's events alone, happy run and resumed run | R `ok 65 - report is derivable from the log` | `:1241-1244` outcome, `by_role`, `by_model`, `total` deep-equal · `:1256-1257` first run's roles absent · `:1258` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C64 | plain summary: `completed`, one line per role (7), not JSON | R `ok 66 - human-readable summary` | `:1264` · `:1267` `assert.equal(lines.filter(...).length, 1)` over `SEVEN_ROLES` · `:1269` `assert.throws(() => JSON.parse(r.stdout))` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C65 | `office next` exit codes in seven situations | R `ok 67 - next exit codes` | `:1292` 0 and `sample/task-01` · `:1296` 12 in-progress · `:1299` 12 review · `:1303` 10 · `:1307` 3 complete · `:1311` 3 empty · `:1316` 12 with blocked and in-progress · `:1320` 0 with blocked and ready · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C66 | four run event lines leave both `stats --json` outputs byte-identical; `validate` exits 0 on the happy log | R `ok 68 - run events do not disturb stats or validate` | `:1338` `assert.equal(s.raw('stats', '--json').stdout, all.stdout)` · `:1339` same for `alpha` · `:1344` `f.office(0, 'validate')` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C67 | help lists run, resume, plan, the three `next` codes, the new footer; old footer gone | R `ok 69 - help lists run, plan and the new footer` | `:1350-1352` · `:1359` codes on the `next` entry · `:1360` `help.includes('Nothing here asks a model to decide anything.')` · `:1361` `!help.includes('Nothing here uses a model')` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C68 | every import in `office.mjs` is a `node:` module | E `ok 2 - office.mjs imports only node modules` | `tests/events.test.mjs:632` `assert.ok(spec.startsWith('node:'))`; `payload/bin/office.mjs:14-18` five `node:` imports, no other · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C69 | `init` writes `run` and `approvals` as stated, byte-identical to the template | R `ok 70 - init writes run and approvals` · E `ok 1 - inline config equals the template` | `:1380` `assert.deepEqual(block('run'), { runtime: 'claude', permission_mode: 'acceptEdits', allowed_tools: [] })` · `:1381` `assert.deepEqual(block('approvals'), { spec: 'human', plan: 'human', harness: 'human' })` · `:1384` · `tests/events.test.mjs:534` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C70 | no doc says `next` exits 1 when none is ready; `office-next.md` names 3, 10, 12 | S70 exit 0 | the proof's own grep; `payload/commands/office-next.md:13-15` name `3`, `10`, `12` with meanings · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C71 | README headless section, skill doc, mermaid still parses | R `ok 71 - headless docs` · G `2/2 diagram(s) parse` | `:1406` · `:1409` each of five codes on a line with its meaning · `:1411-1412` · `:1417` `container` within 5 lines · `:1420-1423`; `README.md:224`, `README.md:240-244`, `README.md:300` · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |
| C72 | manual-only workflow; `run.sh` runs the headless tests on the stub; RFC marked Implemented | R `ok 72 - headless workflow is manual only` · G exit 0, 51 passed, 0 failed · S72 exit 0 | `:1440` `assert.deepEqual(triggers, ['workflow_dispatch'])` · `:1441-1445` · `:1448` · `:1449-1450`; read directly: `.github/workflows/headless.yml`, `docs/rfcs/0002-headless.md:274-290` (three questions answered) · judgment carried from `6d711bc`, line numbers refreshed (+30) | PASS |

## The fix, judged against the diff - verified at b9bf0c7

`payload/bin/office.mjs:1696-1698` adds one predicate, `review`: `opts.resume`, route `feature`,
`gatePolicy(cfg, 'plan') === 'auto'`, at least one task, every task `pending`, and
`readApproval(planFile)?.hash !== planHash(tasksOf())`. `:1699` enters the plan box when it holds;
`:1710` skips the Planner on the first pass only (`i > 0 || !review`). Nothing else changed in the
CLI (`:1722` only reuses `planFile`).

Accounting on the review-first path, read and observed:

- `plan_iterations` counts reviews: with `2` the resumed run is Devil's Advocate, Planner, Devil's
  Advocate (C73, `:1016`); no off-by-one against AC 71's "up to `caps.plan_iterations` reviews".
  With `1` it is one Devil's Advocate call and exit 10 (probe D): the Planner never gets a turn on
  such a resume. Consistent with the AC, pinned by no check.
- `--max-steps` counts the skipped Planner as nothing: `--resume --max-steps 2` ran Devil's
  Advocate, Planner and failed before the third step (probe E). Correct, pinned by no check.

Probes: nine throwaway boards built outside the repository with the test file's own helpers and
the stub runtime, run against the CLI at `b9bf0c7`. They are observations, not proofs; nothing in
the tree was written (`git status --porcelain` empty before and after).

| Probe | State at `--resume` | Observed |
| --- | --- | --- |
| A | `auto`, stale human plan approval, tasks pending, Devil's Advocate rejects | Devil's Advocate, Planner, Devil's Advocate; exit 10; stale file left as it was |
| B | `auto`, rejected plan, task-01 claimed by hand | no review; `plan-approval.json` written `by: policy:auto`; both tasks built; exit 0 |
| C | rejected plan, policy switched to `human` | no role invoked; exit 11 with the approve command |
| D | `auto`, `plan_iterations: 1`, rejected plan | Devil's Advocate only; exit 10 |
| E | `auto`, rejected plan, `--max-steps 2` | Devil's Advocate, Planner; exit 1 |
| F | stopped at gate 2 under `human` (plan already approved by the Devil's Advocate), policy switched to `auto` | Devil's Advocate again, then the tasks; exit 0 |
| G | `auto`, prior route `trivial`, tasks pending, no approval | no review, no approval file; exit 0 |
| H | `auto`, rejected plan, task-01 claimed then blocked by hand | no review; `plan-approval.json` written `by: policy:auto`; exit 10 |
| I | `auto`, hand-built feature, tasks pending, no approval (the shape of C50) | Devil's Advocate first, then the tasks; exit 0 |

## Gaps

Findings about the checks and their proofs. None changes a row's result; none was softened.

New in round 2 - verified at b9bf0c7, ranked:

1. AC 71 / C73, C74 - the fix's guard stops at "every task `pending`". With a plan the Devil's
   Advocate rejected, `auto`, and one task claimed (or claimed and blocked) by hand, a resume writes
   `plan-approval.json` with `by: policy:auto` and no review (probes B and H); under B it builds the
   whole plan. That is inside AC 71's stated precondition, so no check fails, and no run reaches
   that state by itself (a run starts tasks only after gate 2). But `README.md:265` says "A resumed
   run never auto-approves a plan it has not seen converge", which is wider than what the code
   does, and no check pins either side of the boundary.
2. AC 71 names a plan approval "missing or stale"; C73 and C74 both start from a missing one. The
   stale member has no proof. It behaves as the AC says (probe A). The `Coverage` row in
   `checks.md` lists two members (rejects, approves) and does not show this axis.
3. C50 - the test now passes through the new branch (probe I): each of its resumes starts with a
   Devil's Advocate step that round 1 did not have. Its assertions hold because that step has no
   `task`. Nothing in C50 notices the extra role; C74 pins the same behaviour on a different board.
4. Policy switched from `human` to `auto` between a gate 2 stop and the resume: a plan the Devil's
   Advocate already approved is reviewed a second time (probe F), and a second verdict of
   `rejected` would send it back to the Planner. A cost and a possible plan rewrite, pinned by no
   check and stated in no AC.
5. C73 precision - "invokes exactly ... in that order" is asserted on the stub's call record
   (`:1016`), not on the run's `step` events; the two agree by C20's construction, and the check
   does not say which.
6. Neither new test has been made to fail once (profile `light`, no fault injection). The fix
   added an assertion surface that has never been shown to catch a regression.

Not gaps, checked because the fix could have moved them: a resume under `approvals.plan: human`
invokes no Devil's Advocate (probe C; pinned by C51 `:1005` and C48 `:950`); route `trivial` is
untouched (probe G; C51 `:997-999`); a resume with a task in flight is untouched (C55).

Carried from 6d711bc (round 1, numbering kept; line numbers refreshed):

Coverage gaps (a clause of a claim that no named proof asserts):

1. C72 - "its three open questions are answered in the RFC text" has no assertion in any of the
   three proofs. It holds by direct read (`docs/rfcs/0002-headless.md:274-290`), and nothing would
   catch its removal.
2. C72 - "no test invokes `claude`" has no assertion. It holds by read: `tests/run.test.mjs:57`
   sets `OFFICE_RUNTIME_CMD` to the stub in every sandbox, and the one test that unsets it
   (`:234`) runs with a private `PATH` whose first entry holds a fake `claude`.
3. C72 - the workflow clauses are presence greps (`:1443` `/-eq 0/`, `:1444` `/by_role/`), not
   behaviour. The file was read and does what the check says; the workflow has never run.

Precision gaps (the check left a value undefined, the test asserts something weaker):

4. C13 - the check names no exit code or outcome. The test asserts `assert.notEqual(r.status, 0)`
   (`:340`). The implementation repeats the pair until `plan_iterations` and ends `blocked`/10;
   nothing pins that.
5. C53 - "a spec that fails `office spec validate`" is proven only on a legacy `overview.md` with
   no `spec_version`. A typed spec that fails it also fails `office validate`
   (`payload/bin/office.mjs:947`), so that run stops under AC 24 with no event. The claim as
   written is met; AC 48 for a typed spec is unreachable and the check does not say so.
6. C30 - the `auto` rows assert `assert.notEqual(r.status, 11)` plus the written file, not the
   exit code of the run.
7. C22 - the kill is asserted on the direct child's pid only, through `OFFICE_STEP_TIMEOUT_MS`.
   `--step-timeout` itself is whole minutes, default 30 (`office.mjs:1466`, `office.mjs:1635`); the flag path
   is never exercised with a real timeout.
8. C6 - "the feature directory checked is `greeting`" is not observable; the test asserts the
   spec file exists there and the step carries `feature: 'greeting'` (`:252-255`).

Level gaps: none. Every claim naming an exit code or output shape is proven through a CLI
subprocess.

## Swept rows resolving to existing behaviour - carried from 6d711bc

The fix touched none of the cited lines (`payload/bin/office.mjs:520` is above the changed hunk).

| Row | Cited | In the code | Finding |
| --- | --- | --- | --- |
| data lifecycle | a `spec-approval.json` with no `mode` is still accepted by `claim` | yes - `payload/bin/office.mjs:520` compares `hash` only; `mode` is never read | the row says `tests/spec.test.mjs` exercises it. It does not: that suite approves through `office spec approve` (`tests/spec.test.mjs:35`), which now writes `mode`. No test feeds `claim` a file with no `mode` |

Other `Swept` rows resolve to checks of this feature, not to existing behaviour.

## Unchanged surfaces - verified at b9bf0c7

- `git show b9bf0c7 -- tests/`: one hunk, `tests/run.test.mjs` +30 -0, two tests added. No line
  removed or changed, so no existing assertion was weakened, deleted or skipped. No `.skip`,
  `.todo` or `.only` in `tests/*.test.mjs`; `R` reports 0 skipped, 0 todo.
- `git diff 6d711bc..b9bf0c7 --stat`: `payload/bin/office.mjs` +9 -3, `tests/run.test.mjs` +30,
  `README.md` +3, `checks.md`, `plan.md`, `STATE.md`, this report. `tests/stub-runtime.mjs`,
  `tests/run.sh`, `tests/events.test.mjs`, `VERSION`, `package.json`, `CHANGELOG.md`: no diff.

Carried from 6d711bc:

- `git diff development..HEAD -- tests/lifecycle.test.mjs tests/spec.test.mjs tests/events.test.mjs tests/run.sh`:
  two lines. `tests/lifecycle.test.mjs:77` `f.office(1, 'next')` became `f.office(12, 'next')`;
  `tests/run.sh:53` gained `tests/run.test.mjs`. No assertion deleted, weakened or skipped; no
  `.skip`, `.todo` or `.only` in `tests/*.test.mjs`.
- `VERSION`, `package.json`, `CHANGELOG.md`: no diff in the range.
- `payload/bin/office.mjs:14-18`: `node:fs`, `node:crypto`, `node:path`, `node:child_process`,
  `node:url` only.

## Gate - verified at b9bf0c7

`bash tests/run.sh` - 51 passed, 0 failed
