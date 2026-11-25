# Headless runs verification

**Verdict**: PASS
**Profile**: light
**Diff range**: development..HEAD (84e5638..6d711bc)
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Scope: every check C1-C72 in `checks.md`, over `development..HEAD`, proofs run at `6d711bc`.

Profile `light`: the `Coverage` recompute, `Test policy` verdicts and fault injection did not run.
No assertion below has been made to fail once, so "a test that would pass under a wrong
implementation" is not excluded by this report. Step 1 (binding sources) is `ui` only and did not
run. Step 5 does not apply (no user-facing flow).

Proof invocations (all at HEAD, run by the Verifier):

- `R` = `node --test --test-reporter=tap tests/run.test.mjs` - exit 0, 70 top-level tests and 20
  subtests, 90 pass, 0 fail, 0 skipped. Each named test below appeared individually as `ok N - <name>`.
- `E` = `node --test --test-reporter=tap --test-name-pattern="office.mjs imports only node modules" --test-name-pattern="inline config equals the template" tests/events.test.mjs` - exit 0, 2 tests matched, 2 pass.
- `S70` = the C70 shell proof as written - exit 0.
- `S72` = the C72 grep proof as written - exit 0.
- `G` = `bash tests/run.sh` - exit 0, 51 passed, 0 failed.

All `file:line` citations without a file name are in `tests/run.test.mjs`.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | happy run exits 0, both tasks completed, exact 8-role sequence | R `ok 1 - happy feature run completes the board` | `:172` `assert.equal(r.status, 0)` · `:173-174` `assert.equal(f.status(T1/T2), 'completed')` · `:175` `assert.deepEqual(f.roles(), HAPPY_ROLES)` | PASS |
| C2 | first event `run_start` with id pattern, request hash, runtime, outcome, v; request text stored nowhere | R `ok 2 - run_start event and no stored request` | `:182` `assert.match(first.run, /^r-\d{8}T\d{9}Z$/)` · `:183` `assert.equal(first.request_hash, sha256(REQUEST))` · `:184-186` runtime/outcome/v · `:191` `assert.ok(!fs.readFileSync(name, 'utf8').includes(REQUEST))` over every file under `.the-office` | PASS |
| C3 | argv exactly the 8 arguments in order, nothing after; cwd is the board root | R `ok 3 - runtime argv and cwd` | `:199` `assert.equal(call.argv.length, 8)` · `:201` `assert.deepEqual([p, agent, role, fmt, json, mode, accept], ['-p', '--agent', HAPPY_ROLES[i], '--output-format', 'json', '--permission-mode', 'acceptEdits'])` · `:203` `assert.equal(fs.realpathSync(call.cwd), f.root)` | PASS |
| C4 | `plan` after `--permission-mode`; argv ends with `--allowedTools`, `Read`, `Bash(git diff *)` | R `ok 4 - permission mode and allowed tools pass through` | `:214` `assert.equal(call.argv[call.argv.indexOf('--permission-mode') + 1], 'plan')` · `:216` `assert.deepEqual(call.argv.slice(8), ['--allowedTools', 'Read', 'Bash(git diff *)'])` | PASS |
| C5 | unset: the `claude` on PATH runs (marker); set: marker not written | R `ok 5 - OFFICE_RUNTIME_CMD overrides claude` | `:236` `assert.ok(fs.existsSync(marker))` · `:242` `assert.ok(!fs.existsSync(marker))` · `:243` `assert.equal(f.calls().length, 1)` | PASS |
| C6 | slug from the Judge, or from `--feature`; `run_end` has `feature: "salute"` | R `ok 6 - route and slug come from the judge or --feature` | `:251` `assert.ok(judged.prompts('office-product-owner')[0].includes('greeting'))` · `:262-263` `prompt.includes('salute')` and `!prompt.includes('greeting')` · `:265` `assert.equal(lastEvent(flagged).feature, 'salute')` | PASS |
| C7 | Product Owner prompt holds the request verbatim and the slug | R `ok 7 - spec step prompt carries request and slug` | `:275` `assert.ok(prompts[0].includes(REQUEST))` · `:276` `assert.ok(prompts[0].includes('salutation'))` | PASS |
| C8 | PO steps `unmet` then `ok`, run proceeds | R `ok 8 - unmet step is retried once` | `:283` `assert.deepEqual(...map((e) => e.outcome), ['unmet', 'ok'])` · `:282` exit 0 | PASS |
| C9 | PO invoked exactly twice, `run_end` failed, exit 1 | R `ok 9 - step unmet twice fails the run` | `:290` `assert.equal(r.status, 1)` · `:291` `...length, 2` · `:294` `assert.equal(lastEvent(f).outcome, 'failed')` | PASS |
| C10 | three unusable Judge outputs each recorded `unmet` and re-invoked | R `ok 10 - unusable judge output is unmet` with subtests `no route line`, `route: other`, `route: feature without a slug` each ok | `:309` `assert.deepEqual(f.roles().slice(0, 2), ['office-judge', 'office-judge'])` · `:310` `assert.deepEqual(...outcome), ['unmet', 'ok'])` | PASS |
| C11 | planner, DA, planner, DA between gate 1 and the first SWE | R `ok 11 - plan loop repeats until approved` | `:322` `assert.deepEqual(roles.slice(2, firstSwe), ['office-planner', 'office-devils-advocate', 'office-planner', 'office-devils-advocate'])` | PASS |
| C12 | planner and DA twice each, no SWE, blocked, exit 10 | R `ok 12 - plan that does not converge is blocked` | `:328` `assert.equal(r.status, 10)` · `:330-331` counts `2` · `:332` no SWE · `:334` `assert.equal(lastEvent(f).outcome, 'blocked')` | PASS |
| C13 | approved verdict with a failing `office validate`: no gate 2 approval, no SWE | R `ok 13 - approved verdict does not override a failing validate` | `:341` `f.office(1, 'validate')` · `:343` `assert.ok(!f.exists(PLAN_APPROVAL))` · `:344` no `approve` event with `gate === 'plan'` · `:345` `assert.ok(!f.roles().some((role) => role.startsWith('office-swe')))` | PASS |
| C14 | trivial route: exit 0, no DA, no `plan-approval.json`, no plan `approve` event | R `ok 14 - trivial route skips the devil's advocate and gate 2` | `:353` exit 0 · `:355` exact role list · `:357` `assert.ok(!f.exists(PLAN_APPROVAL))` · `:358` no plan approve event | PASS |
| C15 | SWE role per tier (3 tiers), lowest ready `task_no` first | R `ok 15 - swe role by tier in task order` | `:367-371` `assert.deepEqual(swe, [['office-swe-fast', 'greeting/task-02'], ['office-swe-deep', 'greeting/task-01'], ['office-swe', 'greeting/task-03']])` | PASS |
| C16 | SWE, Reviewer, SWE, Reviewer for the retried task; ends completed | R `ok 16 - reviewer retry re-invokes the swe` | `:378` `assert.deepEqual(..., ['office-swe-fast', 'office-reviewer', 'office-swe-fast', 'office-reviewer'])` · `:379` `'completed'` | PASS |
| C17 | two pairs, task blocked, `block` event with reason and `from` | R `ok 17 - review iterations exhausted blocks the task` | `:390-391` counts `2` · `:392` `'blocked'` · `:396` `assert.equal(blocks[0].reason, 'review_iterations exhausted')` · `:397` `assert.equal(blocks[0].from, 'in-progress')` | PASS |
| C18 | task-03 completed, task-02 never claimed, blocked, exit 10 | R `ok 18 - a blocked task does not stop independent tasks` | `:402` exit 10 · `:404` task-03 `'completed'` · `:406` no `claim` event for T2 · `:409` `'blocked'` | PASS |
| C19 | janitor exactly once, after the last Reviewer, before `run_end`; never when no class recurs | R `ok 19 - janitor runs only when a class recurs` | `:419` count `1` · `:421` after last reviewer · `:423-425` `run_end` last, janitor step before it · `:430` `assert.ok(!none.f.roles().includes('office-janitor'))` | PASS |
| C20 | 8 `step` events in invocation order with the required keys; feature/task placement | R `ok 20 - one step event per invocation` | `:436` `assert.equal(steps.length, 8)` · `:437` roles equal invocation order · `:442-444` outcome, `duration_ms`, `usage` · `:446-447` Judge has no `feature`/`task` · `:449-450` · `:452` `assert.deepEqual(steps.slice(4).map((e) => e.task), [T1, T1, T2, T2])` | PASS |
| C21 | four crash causes: invoked once, `crashed`, stderr names the cause, failed, exit 1 | R `ok 21 - crashed step fails the run without retry` with subtests `exit3`, `notjson`, `is_error`, `no_usage` each ok | `:456` the four causes · `:461` exit 1 · `:462` count `1` · `:466` `assert.equal(planner[0].outcome, 'crashed')` · `:467` `assert.match(r.stderr, cause)` · `:469` `'failed'` | PASS |
| C22 | timed-out stub is dead, step `timeout`, failed, exit 1; flag stays whole minutes, default 30 | R `ok 22 - timed-out step is killed and fails the run` | `:477` exit 1 · `:480` `assert.ok(!alive(planner[0].pid))` · `:482` `'timeout'` · `:484` `'failed'` · `:488` `assert.match(usage.stderr, /--step-timeout <minutes>.*default 30\b/)` · `:489` `--step-timeout 0.5` exits 2; code: `payload/bin/office.mjs:1635` `opts.stepTimeout * 60000` | PASS |
| C23 | `--max-steps 3`: 3 invocations, failed, exit 1; usage states default 100 | R `ok 23 - max-steps stops the run` | `:495` exit 1 · `:496` `assert.equal(f.calls().length, 3)` · `:498` `'failed'` · `:499` `/--max-steps <n>.*default 100\b/` | PASS |
| C24 | missing runtime: exit 1, stderr names it, log byte-identical | R `ok 24 - missing runtime executable` | `:506` exit 1 · `:507` `r.stderr.includes('/nonexistent/runtime')` · `:508` `assert.equal(f.log(), before)` | PASS |
| C25 | `dup-id` board: exit 1, stub never invoked, no log line | R `ok 25 - invalid board refuses to start` | `:516` exit 1 · `:517` `assert.equal(s.calls().length, 0)` · `:518` `assert.equal(s.log(), before)` | PASS |
| C26 | pre-existing `run.lock`: exit 1, named, stub uninvoked, log identical, lock intact | R `ok 26 - existing run lock refuses a second run` | `:526-529` · `:530` `assert.equal(f.read('.the-office/run.lock'), '424242')` | PASS |
| C27 | `run.lock` present and `execution.lock` absent in every invocation; lock gone after exits 0, 1, 10, 11 | R `ok 27 - run lock lifecycle` | `:538` `assert.equal(call.run_lock, true)` · `:539` `assert.equal(call.execution_lock, false)` · `:541` · `:551` exit code · `:553` `assert.ok(!other.exists('.the-office/run.lock'))` over 1, 10, 11 | PASS |
| C28 | eight usage errors: exit 2, usage on stderr, log identical, stub uninvoked | R `ok 28 - usage errors exit 2` | `:562-563` the eight argv rows, matching the check's list · `:565` `assert.equal(cases.length, 8)` · `:569` exit 2 · `:570` `/usage: office run/` · `:571` log · `:572` calls `0` | PASS |
| C29 | no `approvals:` key, default gates: stops after PO with exit 11 | R `ok 29 - default policy is human` | `:582` config has no `approvals` · `:586` exit 11 · `:587` `assert.deepEqual(f.roles(), ['office-judge', 'office-product-owner'])` | PASS |
| C30 | four policy rows at each of two gates | R `ok 30 - approvals win over gates` with 8 subtests each ok (4 `gate 1:`, 4 `gate 2:`) | `:591` the four rows · `:599-600` exit 11, no `SPEC_APPROVAL` · `:603` `assert.equal(JSON.parse(f.read(SPEC_APPROVAL)).mode, 'policy')` · `:611-612` · `:615` same for `PLAN_APPROVAL` | PASS |
| C31 | gate 1 human: printed approve command with the current hash, `awaiting_approval`, exit 11, no file | R `ok 31 - gate 1 human stops with exit 11` | `:624` exit 11 · `:627` ``r.out.includes(`office spec approve greeting --hash ${hash} --by`)`` · `:629` · `:630` `assert.ok(!f.exists(SPEC_APPROVAL))` | PASS |
| C32 | gate 2 human: printed plan approve command, `awaiting_approval`, exit 11, no file, no SWE | R `ok 32 - gate 2 human stops with exit 11` | `:636` · `:639` ``r.out.includes(`office plan approve greeting --hash ${hash} --by`)`` · `:641-643` | PASS |
| C33 | gate 1 auto: file fields and one `approve` event with the stated fields | R `ok 33 - gate 1 auto approval` | `:650-653` hash, `'policy:auto'`, `'policy'`, ISO `at` · `:655` count `1` · `:657-661` by, mode, hash, feature, outcome | PASS |
| C34 | gate 2 auto: file fields, one plan `approve` event with that hash | R `ok 34 - gate 2 auto approval` | `:669-672` · `:674` count `1` · `:675-676` `mode`, `hash` | PASS |
| C35 | matching human approval: gate passes, file byte-identical, no new spec `approve` event | R `ok 35 - matching approval is not rewritten` | `:687` exit 0 · `:688` `assert.equal(f.read(SPEC_APPROVAL), bytes)` · `:689` `assert.equal(count(), 1)` | PASS |
| C36 | stale approval under auto is rewritten with the current hash and `mode: "policy"` | R `ok 36 - stale approval is replaced under auto` | `:700` `assert.equal(approval.hash, hash)` · `:701` `assert.equal(approval.mode, 'policy')` | PASS |
| C37 | open questions: printed, no approval, blocked, exit 10; resume exits 10 with the question again | R `ok 37 - open questions block the run` | `:707-709` · `:711` `'blocked'` · `:713` `assert.equal(again.status, 10)` · `:714` `again.out.includes('Which locale?')` | PASS |
| C38 | harness route: one invocation, `/office` printed, `awaiting_approval`, `route: "harness"`, exit 11 | R `ok 38 - harness route stops at exit 11` | `:721-723` · `:725` · `:726` `assert.equal(lastEvent(f).route, 'harness')` | PASS |
| C39 | `spec approve` writes `mode: "human"`, appends exactly one `approve` event, stdout keys unchanged | R `ok 39 - spec approve records mode human` | `:737` `assert.deepEqual(Object.keys(printed).sort(), ['hash', 'id', 'open_questions', 'status', 'type'])` · `:740` `'human'` · `:741` `before + 1` · `:743-749` | PASS |
| C40 | `plan approve` exits 0, writes the four fields, one plan `approve` event | R `ok 40 - plan approve writes the approval` | `:758` exit 0 · `:760-763` hash, `'ana'`, ISO, `'human'` · `:764` `before + 1` · `:766-770` | PASS |
| C41 | five refusals exit 1, no file, log identical | R `ok 41 - plan approve refusals` with 5 subtests each ok | `:775-783` the five cases · `:785` `assert.equal(Object.keys(cases).length, 5)` · `:792` `f.office(1, ...args)` · `:793` no file · `:794` `assert.equal(f.log(), before)` | PASS |
| C42 | `--by policy:*` refused on both commands, nothing written | R `ok 42 - command line refuses policy as approver` | `:803` `f.office(1, 'spec', 'approve', ..., '--by', 'policy:auto')` · `:804` `f.office(1, 'plan', 'approve', ..., '--by', 'policy:x')` · `:805-807` | PASS |
| C43 | `plan status` object; draft, approved, stale; exit 0 and exit 1 | R `ok 43 - plan status` | `:815` exit 0 · `:820-824` id, hash, tasks `2`, `'draft'` · `:826` `'approved'` · `:829` `'stale'` · `:831` `f.office(1, 'plan', 'status', 'ghost')` | PASS |
| C44 | plan hash unchanged by 6 fields, changed by 13 changes | R `ok 44 - plan hash covers the contract only` | `:848-855` six rows · `:856-870` thirteen rows, matching the check's lists · `:871-872` counts `6` and `13` · `:875` `assert.equal(f.planStatus().hash, base)` · `:880` `assert.notEqual(f.planStatus().hash, base)` | PASS |
| C45 | five invalid config values exit 1 naming key and value; the valid config exits 0 | R `ok 45 - validate rejects invalid approvals and run config` | `:892-898` five rows · `:899` length `5` · `:901` `office(1, 'validate')` · `:902-904` line with key includes value · `:906` `office(0, 'validate')` | PASS |
| C46 | PO prompt carries the headless rule | R `ok 46 - product owner prompt carries the headless rule` | `:911` · `:916-917` `Assumptions`, `open_questions` · `:918` ``assert.match(section, /never[^.]*`?office spec approve/i)``; file `payload/agents/office-product-owner.md:52-66` | PASS |
| C47 | resume after gate 1 approval: exit 0, both completed, no Judge, no PO | R `ok 47 - resume after gate 1 approval completes the board` | `:927-929` 11, 0, 0 · `:930-931` · `:934-935` `!roles.includes('office-judge')`, `!roles.includes('office-product-owner')` | PASS |
| C48 | resume after gate 2 approval: exit 0, no planner, no DA | R `ok 48 - resume after gate 2 approval completes the board` | `:946` exit 0 · `:949-950` | PASS |
| C49 | resumed `run_start`: new id, `request_hash: null`, `feature: "greeting"` | R `ok 49 - resume run_start` | `:958` `assert.notEqual(secondId, firstId)` · `:962` `assert.equal(start.request_hash, null)` · `:964` `'greeting'` | PASS |
| C50 | resume takes the feature from the last `run_end` carrying one, or from `--feature` | R `ok 50 - resume picks its feature` | `:978` `assert.ok(id.startsWith('alpha/'))` · `:983` `assert.ok(id.startsWith('beta/'))` · `:977,982` non-empty | PASS |
| C51 | prior `route: "trivial"` proceeds and exits 0; no prior `run_end` stops at gate 2 with exit 11 | R `ok 51 - resume recovers the route` | `:997` exit 0 · `:999` no `PLAN_APPROVAL` · `:1004` `assert.equal(b.status, 11)` · `:1005` no calls | PASS |
| C52 | nothing to resume: exit 2 twice, no event, no stub | R `ok 52 - resume with nothing to resume` | `:1015` exit 2 · `:1016` log identical · `:1017` calls `0` | PASS |
| C53 | resume on a spec that fails `office spec validate`: `run_start` and `run_end` failed, no role, exit 1 | R `ok 53 - resume on an invalid spec fails` | `:1026` `f.office(1, 'spec', 'validate', 'greeting')` · `:1028` exit 1 · `:1029` `assert.deepEqual(f.runEvents().map((e) => [e.event, e.outcome]), [['run_start', 'ok'], ['run_end', 'failed']])` · `:1030` calls `0` | PASS |
| C54 | resume with an approved spec and no tasks: first role is the planner | R `ok 54 - resume plans when there are no tasks` | `:1037` `assert.deepEqual(f.roles(), ['office-planner'])` | PASS |
| C55 | resume continues the `in-progress` task with its SWE, the `review` task with the Reviewer | R `ok 55 - resume continues work in flight` | `:1053` `assert.deepEqual(..., [['office-swe', T2]])` · `:1054` step `task` · `:1061` `assert.deepEqual(..., [['office-reviewer', T2]])` | PASS |
| C56 | four endings with exit code and exactly one `run_end`; feature and route where the Judge returned | R `ok 56 - five endings five exit codes` | `:1073-1074` one `run_end`, outcome · `:1077` feature, route · `:1080-1081` 0 · `:1084-1087` 1 · `:1090-1092` 10 · `:1095-1096` 11 | PASS |
| C57 | `--json`: one object with exactly five keys; run id, outcome, duration; stderr at least 8 lines | R `ok 57 - json report envelope` | `:1108` `assert.deepEqual(Object.keys(report).sort(), ['duration_ms', 'outcome', 'run', 'tasks', 'usage'])` · `:1109-1112` | PASS |
| C58 | `--report` equals `--json`; written for failed, blocked, awaiting_approval; not by a usage error | R `ok 58 - report file for every outcome` | `:1117` `assert.deepEqual(JSON.parse(f.read('out.json')), JSON.parse(r.stdout))` · `:1128` `assert.equal(report.outcome, outcome)` over three · `:1134` `assert.ok(!usage.exists('out.json'))` | PASS |
| C59 | step `usage` from a two-model `modelUsage` | R `ok 59 - step usage from modelUsage` | `:1145-1148` expected literal equal to the check's · `:1149` keys · `:1152` totals · `:1153-1154` per model, cost to 1e-9 (`:159`) | PASS |
| C60 | `by_role` seven keys and values, `by_model`, `total` | R `ok 60 - report usage by role, model and total` | `:1161` seven keys · `:1162` reviewer doubled, others `STUB_A` · `:1163-1166` `by_model` and `total` equal `{800, 80, 40, 16, 0.08}` | PASS |
| C61 | crashed step with no `modelUsage`: `usage` null, role listed with zeros, total is the other steps | R `ok 61 - a step with no usage adds nothing` | `:1175` `assert.equal(planner.usage, null)` · `:1178` `assert.deepEqual(report.usage.by_role['office-planner'], { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0 })` · `:1179` | PASS |
| C62 | `tasks` counts for the three runs | R `ok 62 - report task counts` | `:1183` `{ completed: 2, blocked: 0 }` · `:1186` `{ completed: 1, blocked: 1 }` · `:1190` `{ completed: 0, blocked: 0 }` | PASS |
| C63 | report recomputed from the run's events alone, happy run and resumed run | R `ok 63 - report is derivable from the log` | `:1211-1214` outcome, `by_role`, `by_model`, `total` deep-equal · `:1226-1227` first run's roles absent · `:1228` | PASS |
| C64 | plain summary: `completed`, one line per role (7), not JSON | R `ok 64 - human-readable summary` | `:1234` · `:1237` `assert.equal(lines.filter(...).length, 1)` over `SEVEN_ROLES` · `:1239` `assert.throws(() => JSON.parse(r.stdout))` | PASS |
| C65 | `office next` exit codes in seven situations | R `ok 65 - next exit codes` | `:1262` 0 and `sample/task-01` · `:1266` 12 in-progress · `:1269` 12 review · `:1273` 10 · `:1277` 3 complete · `:1281` 3 empty · `:1286` 12 with blocked and in-progress · `:1290` 0 with blocked and ready | PASS |
| C66 | four run event lines leave both `stats --json` outputs byte-identical; `validate` exits 0 on the happy log | R `ok 66 - run events do not disturb stats or validate` | `:1308` `assert.equal(s.raw('stats', '--json').stdout, all.stdout)` · `:1309` same for `alpha` · `:1314` `f.office(0, 'validate')` | PASS |
| C67 | help lists run, resume, plan, the three `next` codes, the new footer; old footer gone | R `ok 67 - help lists run, plan and the new footer` | `:1320-1322` · `:1329` codes on the `next` entry · `:1330` `help.includes('Nothing here asks a model to decide anything.')` · `:1331` `!help.includes('Nothing here uses a model')` | PASS |
| C68 | every import in `office.mjs` is a `node:` module | E `ok 2 - office.mjs imports only node modules` | `tests/events.test.mjs:632` `assert.ok(spec.startsWith('node:'))`; `payload/bin/office.mjs:14-18` five `node:` imports, no other | PASS |
| C69 | `init` writes `run` and `approvals` as stated, byte-identical to the template | R `ok 68 - init writes run and approvals` · E `ok 1 - inline config equals the template` | `:1350` `assert.deepEqual(block('run'), { runtime: 'claude', permission_mode: 'acceptEdits', allowed_tools: [] })` · `:1351` `assert.deepEqual(block('approvals'), { spec: 'human', plan: 'human', harness: 'human' })` · `:1354` · `tests/events.test.mjs:534` | PASS |
| C70 | no doc says `next` exits 1 when none is ready; `office-next.md` names 3, 10, 12 | S70 exit 0 | the proof's own grep; `payload/commands/office-next.md:13-15` name `3`, `10`, `12` with meanings | PASS |
| C71 | README headless section, skill doc, mermaid still parses | R `ok 69 - headless docs` · G `2/2 diagram(s) parse` | `:1376` · `:1379` each of five codes on a line with its meaning · `:1381-1382` · `:1387` `container` within 5 lines · `:1390-1393`; `README.md:224`, `README.md:240-244`, `README.md:295-300` | PASS |
| C72 | manual-only workflow; `run.sh` runs the headless tests on the stub; RFC marked Implemented | R `ok 70 - headless workflow is manual only` · G exit 0, 51 passed, 0 failed · S72 exit 0 | `:1410` `assert.deepEqual(triggers, ['workflow_dispatch'])` · `:1411-1415` · `:1418` · `:1419-1420`; read directly: `.github/workflows/headless.yml`, `docs/rfcs/0002-headless.md:274-290` (three questions answered) | PASS |

## Gaps

Findings about the checks and their proofs. None changes a row's result; none was softened.

Coverage gaps (a clause of a claim that no named proof asserts):

1. C72 - "its three open questions are answered in the RFC text" has no assertion in any of the
   three proofs. It holds by direct read (`docs/rfcs/0002-headless.md:274-290`), and nothing would
   catch its removal.
2. C72 - "no test invokes `claude`" has no assertion. It holds by read: `tests/run.test.mjs:57`
   sets `OFFICE_RUNTIME_CMD` to the stub in every sandbox, and the one test that unsets it
   (`:234`) runs with a private `PATH` whose first entry holds a fake `claude`.
3. C72 - the workflow clauses are presence greps (`:1413` `/-eq 0/`, `:1414` `/by_role/`), not
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
   `--step-timeout` itself is whole minutes, default 30 (`office.mjs:1466`, `:1635`); the flag path
   is never exercised with a real timeout.
8. C6 - "the feature directory checked is `greeting`" is not observable; the test asserts the
   spec file exists there and the step carries `feature: 'greeting'` (`:252-255`).

Level gaps: none. Every claim naming an exit code or output shape is proven through a CLI
subprocess.

## Swept rows resolving to existing behaviour

| Row | Cited | In the code | Finding |
| --- | --- | --- | --- |
| data lifecycle | a `spec-approval.json` with no `mode` is still accepted by `claim` | yes - `payload/bin/office.mjs:520` compares `hash` only; `mode` is never read | the row says `tests/spec.test.mjs` exercises it. It does not: that suite approves through `office spec approve` (`tests/spec.test.mjs:35`), which now writes `mode`. No test feeds `claim` a file with no `mode` |

Other `Swept` rows resolve to checks of this feature, not to existing behaviour.

## Unchanged surfaces

- `git diff development..HEAD -- tests/lifecycle.test.mjs tests/spec.test.mjs tests/events.test.mjs tests/run.sh`:
  two lines. `tests/lifecycle.test.mjs:77` `f.office(1, 'next')` became `f.office(12, 'next')`;
  `tests/run.sh:53` gained `tests/run.test.mjs`. No assertion deleted, weakened or skipped; no
  `.skip`, `.todo` or `.only` in `tests/*.test.mjs`.
- `VERSION`, `package.json`, `CHANGELOG.md`: no diff in the range.
- `payload/bin/office.mjs:14-18`: `node:fs`, `node:crypto`, `node:path`, `node:child_process`,
  `node:url` only.

## Gate

`bash tests/run.sh` - 51 passed, 0 failed
