import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'payload/bin/office.mjs');
const stub = path.join(repo, 'tests/stub-runtime.mjs');
const LOG = '.the-office/events.jsonl';
const REQUEST = 'add a greeting';
const T1 = 'greeting/task-01';
const T2 = 'greeting/task-02';
const SPEC_APPROVAL = '.the-office/features/greeting/spec-approval.json';
const PLAN_APPROVAL = '.the-office/features/greeting/plan-approval.json';
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const HEX64 = /^[0-9a-f]{64}$/;
const HAPPY_ROLES = [
  'office-judge', 'office-product-owner', 'office-planner', 'office-devils-advocate',
  'office-swe-fast', 'office-reviewer', 'office-swe', 'office-reviewer',
];
const SEVEN_ROLES = [
  'office-judge', 'office-product-owner', 'office-planner', 'office-devils-advocate',
  'office-swe-fast', 'office-swe', 'office-reviewer',
];
const STUB_A = { input: 100, output: 10, cache_read: 5, cache_write: 2, cost_usd: 0.01 };
const USAGE_KEYS = ['input', 'output', 'cache_read', 'cache_write', 'cost_usd'];
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// config.yml for a test board. With no `approvals`, the key is absent from the file.
function config({ approvals, gates = {}, caps = {}, run = '' } = {}) {
  const g = { after_po_clarification: true, after_plan_converges: true, before_harness_change: true, ...gates };
  const k = { plan_iterations: 3, review_iterations: 3, ...caps };
  return [
    'version: 0.0.0', 'schema: 1',
    'caps:', ...Object.entries(k).map(([key, v]) => `  ${key}: ${v}`),
    'gates:', ...Object.entries(g).map(([key, v]) => `  ${key}: ${v}`),
    'janitor:', '  recurrence_threshold: 3',
    ...(run ? ['run:', ...run.split('\n').map((l) => `  ${l}`)] : []),
    ...(approvals ? ['approvals:', ...Object.entries(approvals).map(([key, v]) => `  ${key}: ${v}`)] : []),
    '',
  ].join('\n');
}
const AUTO = { spec: 'auto', plan: 'auto' };

// A temp directory, optionally a copy of a fixture board, with the stub's own
// directory kept outside it so the stub's records never dirty the tree.
function sandbox(t, from) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'office-run-')));
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-stub-'));
  const cleanup = () => { for (const d of [root, stubDir]) fs.rmSync(d, { recursive: true, force: true }); };
  if (t) t.after(cleanup); else process.on('exit', cleanup);
  if (from) fs.cpSync(path.join(repo, 'tests/fixtures', from), root, { recursive: true });
  const baseEnv = { ...process.env, NO_COLOR: '1', OFFICE_RUNTIME_CMD: stub, OFFICE_STUB_DIR: stubDir };
  delete baseEnv.OFFICE_STEP_TIMEOUT_MS;
  // An extra variable set to undefined is removed from the child's environment.
  const exec = (cmd, args, extra = {}) => {
    const env = { ...baseEnv, ...extra };
    for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
    return spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env });
  };
  const raw = (...args) => exec(process.execPath, [cli, ...args]);
  const office = (want, ...args) => {
    const r = raw(...args);
    assert.equal(r.status, want, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    return r.stdout + r.stderr;
  };
  // `office run`, with optional extra environment as a trailing object.
  const run = (...args) => {
    const env = typeof args.at(-1) === 'object' ? args.pop() : {};
    const r = exec(process.execPath, [cli, 'run', ...args], env);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, out: r.stdout + r.stderr };
  };
  const file = (name) => path.join(root, name);
  const read = (name) => fs.readFileSync(file(name), 'utf8');
  const exists = (name) => fs.existsSync(file(name));
  const put = (name, text) => { fs.mkdirSync(path.dirname(file(name)), { recursive: true }); fs.writeFileSync(file(name), text); };
  const edit = (name, from, to) => { assert.ok(read(name).includes(from), `${name} lacks ${from}`); put(name, read(name).replace(from, to)); };
  const log = () => (exists(LOG) ? read(LOG) : null);
  const events = () => (log() ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const runIds = () => events().filter((e) => e.event === 'run_start').map((e) => e.run);
  const runEvents = (id = runIds().at(-1)) => events().filter((e) => e.run === id);
  const steps = (id) => runEvents(id).filter((e) => e.event === 'step');
  const callsFile = path.join(stubDir, 'calls.jsonl');
  const calls = () => (fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const roles = () => calls().map((call) => call.argv[call.argv.indexOf('--agent') + 1]);
  const prompts = (role) => calls().filter((call) => call.role === role).map((call) => call.argv[call.argv.indexOf('-p') + 1]);
  const clearCalls = () => fs.rmSync(callsFile, { force: true });
  const scenario = (value) => fs.writeFileSync(path.join(stubDir, 'scenario.json'), JSON.stringify(value));
  // Runs the stub as one role outside any run, to script a board state by hand.
  const act = (role, { slug, task } = {}) => {
    const r = exec(stub, ['-p', `${slug ? `Feature slug: ${slug}\n` : ''}${task ? `Task: ${task}\n` : ''}`, '--agent', role]);
    assert.equal(r.status, 0, `${role}: ${r.stdout}${r.stderr}`);
  };
  const status = (id) => /^status: (.+)$/m.exec(read(`.the-office/features/${id}.md`))[1];
  const specHash = (slug = 'greeting') => JSON.parse(raw('spec', 'status', slug).stdout).hash;
  const planStatus = (slug = 'greeting') => JSON.parse(raw('plan', 'status', slug).stdout);
  return { root, stubDir, exec, raw, office, run, file, read, exists, put, edit, log, events, runIds, runEvents, steps, calls, roles, prompts, clearCalls, scenario, act, status, specHash, planStatus };
}

// An initialised board in a Git repo with one committed source file.
function board(t, { cfg = config({ approvals: AUTO }), scenario } = {}) {
  const s = sandbox(t);
  const git = (...args) => {
    const r = s.exec('git', args);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  s.office(0, 'init');
  s.put('.the-office/config.yml', cfg);
  s.put('src/a.txt', 'baseline');
  git('add', '.'); git('commit', '-qm', 'baseline');
  if (scenario) s.scenario(scenario);
  return { ...s, git };
}

// A feature scripted by hand through the stub's roles: spec, human spec approval, tasks.
function handBuilt(f, slug = 'greeting', { approve = true, plan = true } = {}) {
  f.act('office-product-owner', { slug });
  if (approve) f.office(0, 'spec', 'approve', slug, '--hash', f.specHash(slug), '--by', 'ana');
  if (plan) f.act('office-planner', { slug });
  f.clearCalls();
}

// One run of each kind is shared by the tests that only read it.
const memo = (make) => { let value; return () => (value ??= make()); };
const happy = memo(() => {
  const f = board(null);
  const r = f.run(REQUEST, '--json', '--report', 'out.json');
  return { f, r, report: r.status === 0 ? JSON.parse(r.stdout) : null };
});
const happyPlain = memo(() => { const f = board(null); return { f, r: f.run(REQUEST) }; });
// Stopped at gate 1 (exit 11), approved by a human with the printed hash, resumed.
const resumed = memo(() => {
  const f = board(null, { cfg: config({ approvals: { spec: 'human', plan: 'auto' } }) });
  const first = f.run(REQUEST);
  const hash = /office spec approve greeting --hash ([0-9a-f]{64}) --by/.exec(first.out)?.[1];
  const approve = f.raw('spec', 'approve', 'greeting', '--hash', String(hash), '--by', 'ana');
  f.clearCalls();
  const second = f.run('--resume', '--json');
  return { f, first, approve, second };
});
// Three tasks: task-02 depends on task-01, task-03 on nothing; the SWE blocks task-01.
const blockedRun = memo(() => {
  const f = board(null, { scenario: { tasks: [{}, { depends_on: [1] }, {}], swe: { [T1]: ['block'] } } });
  return { f, r: f.run(REQUEST, '--json') };
});

const lastEvent = (f) => f.events().at(-1);
const assertUsage = (actual, expected, label = 'usage') => {
  assert.deepEqual(Object.keys(actual).sort(), [...USAGE_KEYS].sort(), label);
  for (const key of USAGE_KEYS) {
    if (key === 'cost_usd') assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${label}.${key}: ${actual[key]} vs ${expected[key]}`);
    else assert.equal(actual[key], expected[key], `${label}.${key}`);
  }
};
const times = (u, n) => Object.fromEntries(USAGE_KEYS.map((k) => [k, u[k] * n]));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/* ------------------------------------------------------------------ *
 * S1 - `office run` drives a request to a finished board
 * ------------------------------------------------------------------ */

test('happy feature run completes the board', () => {
  const { f, r } = happy();
  assert.equal(r.status, 0, r.out);
  assert.equal(f.status(T1), 'completed');
  assert.equal(f.status(T2), 'completed');
  assert.deepEqual(f.roles(), HAPPY_ROLES);
});

test('run_start event and no stored request', () => {
  const { f } = happy();
  const first = f.events()[0];
  assert.equal(first.event, 'run_start');
  assert.match(first.run, /^r-\d{8}T\d{9}Z$/);
  assert.equal(first.request_hash, sha256(REQUEST));
  assert.equal(first.runtime, 'claude');
  assert.equal(first.outcome, 'ok');
  assert.equal(first.v, 1);
  assert.equal(f.runEvents(first.run)[0].event, 'run_start');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const files = walk(f.file('.the-office'));
  assert.ok(files.length > 5);
  for (const name of files) assert.ok(!fs.readFileSync(name, 'utf8').includes(REQUEST), `${name} stores the request`);
});

test('runtime argv and cwd', () => {
  const { f } = happy();
  const calls = f.calls();
  assert.equal(calls.length, 8);
  calls.forEach((call, i) => {
    assert.equal(call.argv.length, 8, call.argv.join(' '));
    const [p, prompt, agent, role, fmt, json, mode, accept] = call.argv;
    assert.deepEqual([p, agent, role, fmt, json, mode, accept], ['-p', '--agent', HAPPY_ROLES[i], '--output-format', 'json', '--permission-mode', 'acceptEdits']);
    assert.ok(typeof prompt === 'string' && prompt.trim().length > 0);
    assert.equal(fs.realpathSync(call.cwd), f.root);
  });
});

test('permission mode and allowed tools pass through', (t) => {
  const f = board(t, { cfg: config({ approvals: AUTO, run: 'permission_mode: plan\nallowed_tools: ["Read", "Bash(git diff *)"]' }) });
  const r = f.run(REQUEST);
  assert.equal(r.status, 0, r.out);
  const calls = f.calls();
  assert.equal(calls.length, 8);
  for (const call of calls) {
    assert.equal(call.argv[call.argv.indexOf('--permission-mode') + 1], 'plan');
    assert.equal(call.argv.indexOf('--permission-mode'), 6);
    assert.deepEqual(call.argv.slice(8), ['--allowedTools', 'Read', 'Bash(git diff *)']);
  }
});

test('OFFICE_RUNTIME_CMD overrides claude', (t) => {
  const f = board(t, { scenario: { judge: ['route: harness\nreason: a harness problem'] } });
  // A private PATH: a fake `claude` first, then only what the CLI and the stub need.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'office-path-'));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const marker = path.join(bin, 'marker');
  fs.mkdirSync(path.join(bin, 'fake')); fs.mkdirSync(path.join(bin, 'tools'));
  fs.writeFileSync(path.join(bin, 'fake/claude'), `#!/bin/sh\necho ran > "${marker}"\nprintf '%s\\n' '{"type":"result","is_error":false,"result":"route: harness","modelUsage":{}}'\n`, { mode: 0o755 });
  fs.symlinkSync(process.execPath, path.join(bin, 'tools/node'));
  const which = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  fs.symlinkSync(which, path.join(bin, 'tools/git'));
  const system = ['/usr/bin', '/bin'].filter((d) => !fs.existsSync(path.join(d, 'claude')));
  const PATH = [path.join(bin, 'fake'), path.join(bin, 'tools'), ...system].join(path.delimiter);

  const unset = f.run('x', { PATH, OFFICE_RUNTIME_CMD: undefined });
  assert.equal(unset.status, 11, unset.out);
  assert.ok(fs.existsSync(marker), 'the claude on PATH ran');
  assert.equal(f.calls().length, 0);

  fs.rmSync(marker);
  const set = f.run('x', { PATH });
  assert.equal(set.status, 11, set.out);
  assert.ok(!fs.existsSync(marker), 'claude ran although OFFICE_RUNTIME_CMD was set');
  assert.equal(f.calls().length, 1);
});

test('route and slug come from the judge or --feature', (t) => {
  // Default policy is human, so both runs stop right after the Product Owner.
  const judged = board(t, { cfg: config() });
  const a = judged.run(REQUEST);
  assert.equal(a.status, 11, a.out);
  assert.ok(judged.prompts('office-product-owner')[0].includes('greeting'));
  assert.ok(judged.exists('.the-office/features/greeting/overview.md'));
  const po = judged.steps().find((e) => e.role === 'office-product-owner');
  assert.equal(po.outcome, 'ok');
  assert.equal(po.feature, 'greeting');
  assert.equal(lastEvent(judged).feature, 'greeting');

  const flagged = board(t, { cfg: config() });
  const b = flagged.run('say hello', '--feature', 'salute');
  assert.equal(b.status, 11, b.out);
  const [prompt] = flagged.prompts('office-product-owner');
  assert.ok(prompt.includes('salute'));
  assert.ok(!prompt.includes('greeting'));
  assert.equal(lastEvent(flagged).event, 'run_end');
  assert.equal(lastEvent(flagged).feature, 'salute');
  assert.ok(flagged.exists('.the-office/features/salute/overview.md'));
  assert.ok(!flagged.exists('.the-office/features/greeting'));
});

test('spec step prompt carries request and slug', (t) => {
  const f = board(t, { cfg: config(), scenario: { judge: ['route: feature\nreason: r\nfeature_slug: salutation'] } });
  assert.equal(f.run(REQUEST).status, 11);
  const prompts = f.prompts('office-product-owner');
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].includes(REQUEST));
  assert.ok(prompts[0].includes('salutation'));
});

test('unmet step is retried once', (t) => {
  const f = board(t, { scenario: { po: ['none', 'valid'] } });
  const r = f.run(REQUEST);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(f.steps().filter((e) => e.role === 'office-product-owner').map((e) => e.outcome), ['unmet', 'ok']);
  assert.equal(f.status(T2), 'completed');
});

test('step unmet twice fails the run', (t) => {
  const f = board(t, { scenario: { po: ['none'] } });
  const r = f.run(REQUEST);
  assert.equal(r.status, 1, r.out);
  assert.equal(f.roles().filter((role) => role === 'office-product-owner').length, 2);
  assert.deepEqual(f.roles(), ['office-judge', 'office-product-owner', 'office-product-owner']);
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'failed');
});

test('unusable judge output is unmet', async (t) => {
  const good = 'route: feature\nreason: r\nfeature_slug: greeting';
  const cases = {
    'no route line': 'reason: nothing to say\nfeature_slug: greeting',
    'route: other': 'route: other\nreason: r\nfeature_slug: greeting',
    'route: feature without a slug': 'route: feature\nreason: r',
  };
  for (const [name, bad] of Object.entries(cases)) {
    await t.test(name, (st) => {
      const f = board(st, { cfg: config(), scenario: { judge: [bad, good] } });
      const r = f.run(REQUEST);
      assert.equal(r.status, 11, r.out);
      assert.deepEqual(f.roles().slice(0, 2), ['office-judge', 'office-judge']);
      assert.deepEqual(f.steps().filter((e) => e.role === 'office-judge').map((e) => e.outcome), ['unmet', 'ok']);
    });
  }
});

test('plan loop repeats until approved', (t) => {
  const f = board(t, { cfg: config({ approvals: AUTO, caps: { plan_iterations: 3 } }), scenario: { da: ['rejected', 'approved'] } });
  const r = f.run(REQUEST);
  assert.equal(r.status, 0, r.out);
  const roles = f.roles();
  const firstSwe = roles.findIndex((role) => role.startsWith('office-swe'));
  assert.deepEqual(roles.slice(0, 2), ['office-judge', 'office-product-owner']);
  assert.deepEqual(roles.slice(2, firstSwe), ['office-planner', 'office-devils-advocate', 'office-planner', 'office-devils-advocate']);
});

test('plan that does not converge is blocked', (t) => {
  const f = board(t, { cfg: config({ approvals: AUTO, caps: { plan_iterations: 2 } }), scenario: { da: ['rejected'] } });
  const r = f.run(REQUEST);
  assert.equal(r.status, 10, r.out);
  const roles = f.roles();
  assert.equal(roles.filter((role) => role === 'office-planner').length, 2);
  assert.equal(roles.filter((role) => role === 'office-devils-advocate').length, 2);
  assert.ok(!roles.some((role) => role.startsWith('office-swe')));
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'blocked');
});

test('approved verdict does not override a failing validate', (t) => {
  const f = board(t, { scenario: { tasks: [{ checks: [] }], da: ['approved'] } });
  const r = f.run(REQUEST);
  assert.notEqual(r.status, 0, r.out);
  f.office(1, 'validate');
  assert.ok(f.roles().includes('office-devils-advocate'));
  assert.ok(!f.exists(PLAN_APPROVAL));
  assert.ok(!f.events().some((e) => e.event === 'approve' && e.gate === 'plan'));
  assert.ok(!f.roles().some((role) => role.startsWith('office-swe')));
});

test("trivial route skips the devil's advocate and gate 2", (t) => {
  const f = board(t, {
    cfg: config({ approvals: { spec: 'auto', plan: 'human' } }),
    scenario: { judge: ['route: trivial\nreason: one line\nfeature_slug: greeting'], tasks: [{ tier: 'fast' }] },
  });
  const r = f.run(REQUEST);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(f.roles(), ['office-judge', 'office-product-owner', 'office-planner', 'office-swe-fast', 'office-reviewer']);
  assert.ok(!f.roles().includes('office-devils-advocate'));
  assert.ok(!f.exists(PLAN_APPROVAL));
  assert.ok(!f.events().some((e) => e.event === 'approve' && e.gate === 'plan'));
});

test('swe role by tier in task order', (t) => {
  // task-01 waits for task-02, so the order is 02 (fast), 01 (deep), 03 (standard).
  const f = board(t, { scenario: { tasks: [{ tier: 'deep', depends_on: [2] }, { tier: 'fast' }, { tier: 'standard' }] } });
  const r = f.run(REQUEST);
  assert.equal(r.status, 0, r.out);
  const swe = f.calls().filter((call) => call.role.startsWith('office-swe')).map((call) => [call.role, call.task]);
  assert.deepEqual(swe, [
    ['office-swe-fast', 'greeting/task-02'],
    ['office-swe-deep', 'greeting/task-01'],
    ['office-swe', 'greeting/task-03'],
  ]);
});

test('reviewer retry re-invokes the swe', (t) => {
  const f = board(t, { scenario: { reviewer: { [T1]: ['retry', 'done'] } } });
  const r = f.run(REQUEST);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(f.calls().filter((call) => call.task === T1).map((call) => call.role), ['office-swe-fast', 'office-reviewer', 'office-swe-fast', 'office-reviewer']);
  assert.equal(f.status(T1), 'completed');
});

test('review iterations exhausted blocks the task', (t) => {
  const f = board(t, {
    cfg: config({ approvals: AUTO, caps: { review_iterations: 2 } }),
    scenario: { tasks: [{ tier: 'fast', max_attempts: 5 }], reviewer: { [T1]: ['retry'] } },
  });
  const r = f.run(REQUEST);
  assert.equal(r.status, 10, r.out);
  const roles = f.calls().filter((call) => call.task === T1).map((call) => call.role);
  assert.equal(roles.filter((role) => role === 'office-swe-fast').length, 2);
  assert.equal(roles.filter((role) => role === 'office-reviewer').length, 2);
  assert.equal(f.status(T1), 'blocked');
  assert.match(f.read(`.the-office/features/${T1}.md`), /^max_attempts: 5$/m);
  const blocks = f.events().filter((e) => e.event === 'block' && e.task === T1);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].reason, 'review_iterations exhausted');
  assert.equal(blocks[0].from, 'in-progress');
});

test('a blocked task does not stop independent tasks', () => {
  const { f, r } = blockedRun();
  assert.equal(r.status, 10, r.out);
  assert.equal(f.status(T1), 'blocked');
  assert.equal(f.status('greeting/task-03'), 'completed');
  assert.equal(f.status(T2), 'pending');
  assert.ok(!f.events().some((e) => e.event === 'claim' && e.task === T2));
  assert.ok(!f.calls().some((call) => call.task === T2));
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'blocked');
});

test('janitor runs only when a class recurs', (t) => {
  const f = board(t);
  for (const n of [1, 2, 3]) f.office(0, 'findings', 'add', '--class', 'unclosed-session', '--task', `t${n}`);
  f.office(0, 'findings', 'recur');
  const r = f.run(REQUEST);
  assert.equal(r.status, 0, r.out);
  const roles = f.roles();
  assert.equal(roles.filter((role) => role === 'office-janitor').length, 1);
  assert.equal(roles.indexOf('office-janitor'), roles.length - 1);
  assert.ok(roles.indexOf('office-janitor') > roles.lastIndexOf('office-reviewer'));
  const events = f.runEvents();
  assert.equal(events.at(-1).event, 'run_end');
  assert.equal(events.at(-2).event, 'step');
  assert.equal(events.at(-2).role, 'office-janitor');

  const none = happy();
  assert.equal(none.r.status, 0);
  none.f.office(1, 'findings', 'recur');
  assert.ok(!none.f.roles().includes('office-janitor'));
});

test('one step event per invocation', () => {
  const { f } = happy();
  const steps = f.steps();
  assert.equal(steps.length, 8);
  assert.deepEqual(steps.map((e) => e.role), f.roles());
  const run = f.runIds()[0];
  for (const e of steps) {
    assert.equal(e.run, run);
    assert.equal(typeof e.role, 'string');
    assert.equal(e.outcome, 'ok');
    assert.ok(Number.isInteger(e.duration_ms) && e.duration_ms >= 0, `duration_ms: ${e.duration_ms}`);
    assert.ok(e.usage && typeof e.usage === 'object' && !Array.isArray(e.usage));
  }
  assert.ok(!Object.hasOwn(steps[0], 'feature'));
  assert.ok(!Object.hasOwn(steps[0], 'task'));
  for (const e of steps.slice(1, 4)) {
    assert.equal(e.feature, 'greeting');
    assert.ok(!Object.hasOwn(e, 'task'), e.role);
  }
  assert.deepEqual(steps.slice(4).map((e) => e.task), [T1, T1, T2, T2]);
});

test('crashed step fails the run without retry', async (t) => {
  const cases = { exit3: /\bexit(ed)?( code| status)? 3\b/, notjson: /JSON/, is_error: /is_error/, no_usage: /modelUsage/ };
  for (const [mode, cause] of Object.entries(cases)) {
    await t.test(mode, (st) => {
      const f = board(st, { scenario: { fail: { 'office-planner': [mode] } } });
      const r = f.run(REQUEST);
      assert.equal(r.status, 1, r.out);
      assert.equal(f.roles().filter((role) => role === 'office-planner').length, 1);
      assert.equal(f.roles().at(-1), 'office-planner');
      const planner = f.steps().filter((e) => e.role === 'office-planner');
      assert.equal(planner.length, 1);
      assert.equal(planner[0].outcome, 'crashed');
      assert.match(r.stderr, cause);
      assert.equal(lastEvent(f).event, 'run_end');
      assert.equal(lastEvent(f).outcome, 'failed');
    });
  }
});

test('timed-out step is killed and fails the run', (t) => {
  const f = board(t, { scenario: { fail: { 'office-planner': ['sleep'] } } });
  const r = f.run(REQUEST, { OFFICE_STEP_TIMEOUT_MS: '1500' });
  assert.equal(r.status, 1, r.out);
  const planner = f.calls().filter((call) => call.role === 'office-planner');
  assert.equal(planner.length, 1);
  assert.ok(!alive(planner[0].pid), 'the stub is still running');
  assert.equal(f.steps().at(-1).role, 'office-planner');
  assert.equal(f.steps().at(-1).outcome, 'timeout');
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'failed');
  // The flag itself stays in whole minutes, default 30.
  const usage = f.run();
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /--step-timeout <minutes>.*default 30\b/);
  assert.equal(f.run('x', '--step-timeout', '0.5').status, 2);
});

test('max-steps stops the run', (t) => {
  const f = board(t);
  const r = f.run(REQUEST, '--max-steps', '3');
  assert.equal(r.status, 1, r.out);
  assert.equal(f.calls().length, 3);
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'failed');
  assert.match(f.run().stderr, /--max-steps <n>.*default 100\b/);
});

test('missing runtime executable', (t) => {
  const f = board(t);
  const before = f.log();
  const r = f.run('x', { OFFICE_RUNTIME_CMD: '/nonexistent/runtime' });
  assert.equal(r.status, 1, r.out);
  assert.ok(r.stderr.includes('/nonexistent/runtime'));
  assert.equal(f.log(), before);
  assert.ok(!f.exists('.the-office/run.lock'));
});

test('invalid board refuses to start', (t) => {
  const s = sandbox(t, 'dup-id');
  const before = s.log();
  const r = s.run('x');
  assert.equal(r.status, 1, r.out);
  assert.equal(s.calls().length, 0);
  assert.equal(s.log(), before);
});

test('existing run lock refuses a second run', (t) => {
  const f = board(t);
  f.put('.the-office/run.lock', '424242');
  const before = f.log();
  const r = f.run('x');
  assert.equal(r.status, 1, r.out);
  assert.ok(r.stderr.includes('run.lock'));
  assert.equal(f.calls().length, 0);
  assert.equal(f.log(), before);
  assert.equal(f.read('.the-office/run.lock'), '424242');
});

test('run lock lifecycle', (t) => {
  const { f, r } = happy();
  assert.equal(r.status, 0);
  assert.equal(f.calls().length, 8);
  for (const call of f.calls()) {
    assert.equal(call.run_lock, true, `${call.role}: run.lock`);
    assert.equal(call.execution_lock, false, `${call.role}: execution.lock`);
  }
  assert.ok(!f.exists('.the-office/run.lock'));

  const endings = [
    [1, { scenario: { fail: { 'office-planner': ['exit3'] } } }],
    [10, { scenario: { po: ['questions'] } }],
    [11, { cfg: config() }],
  ];
  for (const [code, options] of endings) {
    const other = board(t, options);
    const result = other.run(REQUEST);
    assert.equal(result.status, code, result.out);
    assert.ok(other.calls().length > 0);
    assert.ok(!other.exists('.the-office/run.lock'), `run.lock left behind after exit ${code}`);
  }
});

test('usage errors exit 2', (t) => {
  const f = board(t);
  f.office(0, 'feature', 'new', 'sample');
  const before = f.log();
  const cases = [
    [], ['x', '--resume'], ['x', '--bogus'], ['x', '--step-timeout', '0'], ['x', '--step-timeout', 'abc'],
    ['x', '--max-steps', '-1'], ['x', '--feature', 'Bad_Slug'], ['x', '--feature', 'sample'],
  ];
  assert.equal(cases.length, 8);
  for (const args of cases) {
    const r = f.run(...args);
    const name = `run ${args.join(' ')}`;
    assert.equal(r.status, 2, `${name}: ${r.out}`);
    assert.match(r.stderr, /usage: office run/, name);
    assert.equal(f.log(), before, name);
    assert.equal(f.calls().length, 0, name);
  }
});

/* ------------------------------------------------------------------ *
 * S2 - gates are a policy the supervisor applies and records
 * ------------------------------------------------------------------ */

test('default policy is human', (t) => {
  const cfg = config();
  assert.ok(!cfg.includes('approvals'));
  assert.match(cfg, /after_po_clarification: true/);
  const f = board(t, { cfg });
  const r = f.run(REQUEST);
  assert.equal(r.status, 11, r.out);
  assert.deepEqual(f.roles(), ['office-judge', 'office-product-owner']);
});

test('approvals win over gates', async (t) => {
  const rows = [[undefined, true, 'human'], [undefined, false, 'auto'], ['human', false, 'human'], ['auto', true, 'auto']];
  for (const [approval, gateOn, want] of rows) {
    await t.test(`gate 1: approvals.spec ${approval ?? 'absent'}, gates.after_po_clarification ${gateOn} -> ${want}`, (st) => {
      const f = board(st, { cfg: config({ approvals: approval ? { spec: approval } : undefined, gates: { after_po_clarification: gateOn } }) });
      // Two steps reach gate 1; under auto the third is refused, after the approval is written.
      const r = f.run(REQUEST, '--max-steps', '2');
      assert.deepEqual(f.roles(), ['office-judge', 'office-product-owner']);
      if (want === 'human') {
        assert.equal(r.status, 11, r.out);
        assert.ok(!f.exists(SPEC_APPROVAL));
      } else {
        assert.notEqual(r.status, 11, r.out);
        assert.equal(JSON.parse(f.read(SPEC_APPROVAL)).mode, 'policy');
      }
    });
    await t.test(`gate 2: approvals.plan ${approval ?? 'absent'}, gates.after_plan_converges ${gateOn} -> ${want}`, (st) => {
      const f = board(st, { cfg: config({ approvals: { spec: 'auto', ...(approval ? { plan: approval } : {}) }, gates: { after_plan_converges: gateOn } }) });
      const r = f.run(REQUEST, '--max-steps', '4');
      assert.deepEqual(f.roles(), ['office-judge', 'office-product-owner', 'office-planner', 'office-devils-advocate']);
      if (want === 'human') {
        assert.equal(r.status, 11, r.out);
        assert.ok(!f.exists(PLAN_APPROVAL));
      } else {
        assert.notEqual(r.status, 11, r.out);
        assert.equal(JSON.parse(f.read(PLAN_APPROVAL)).mode, 'policy');
      }
    });
  }
});

test('gate 1 human stops with exit 11', (t) => {
  const f = board(t, { cfg: config({ approvals: { spec: 'human', plan: 'auto' } }) });
  const r = f.run(REQUEST);
  assert.equal(r.status, 11, r.out);
  const hash = f.specHash();
  assert.match(hash, HEX64);
  assert.ok(r.out.includes(`office spec approve greeting --hash ${hash} --by`), r.out);
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'awaiting_approval');
  assert.ok(!f.exists(SPEC_APPROVAL));
});

test('gate 2 human stops with exit 11', (t) => {
  const f = board(t, { cfg: config({ approvals: { spec: 'auto', plan: 'human' } }) });
  const r = f.run(REQUEST);
  assert.equal(r.status, 11, r.out);
  const { hash } = f.planStatus();
  assert.match(hash, HEX64);
  assert.ok(r.out.includes(`office plan approve greeting --hash ${hash} --by`), r.out);
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'awaiting_approval');
  assert.ok(!f.exists(PLAN_APPROVAL));
  assert.ok(!f.roles().some((role) => role.startsWith('office-swe')));
});

test('gate 1 auto approval', () => {
  const { f } = happy();
  const hash = f.specHash();
  const approval = JSON.parse(f.read(SPEC_APPROVAL));
  assert.equal(approval.hash, hash);
  assert.equal(approval.by, 'policy:auto');
  assert.equal(approval.mode, 'policy');
  assert.match(approval.at, ISO);
  const approves = f.events().filter((e) => e.event === 'approve' && e.gate === 'spec');
  assert.equal(approves.length, 1);
  const [e] = approves;
  assert.equal(e.by, 'policy:auto');
  assert.equal(e.mode, 'policy');
  assert.equal(e.hash, hash);
  assert.equal(e.feature, 'greeting');
  assert.equal(e.outcome, 'ok');
});

test('gate 2 auto approval', () => {
  const { f } = happy();
  const { hash } = f.planStatus();
  assert.match(hash, HEX64);
  const approval = JSON.parse(f.read(PLAN_APPROVAL));
  assert.equal(approval.hash, hash);
  assert.equal(approval.by, 'policy:auto');
  assert.equal(approval.mode, 'policy');
  assert.match(approval.at, ISO);
  const approves = f.events().filter((e) => e.event === 'approve' && e.gate === 'plan');
  assert.equal(approves.length, 1);
  assert.equal(approves[0].mode, 'policy');
  assert.equal(approves[0].hash, hash);
});

test('matching approval is not rewritten', (t) => {
  const f = board(t, { cfg: config({ approvals: { spec: 'human', plan: 'auto' } }) });
  assert.equal(f.run(REQUEST).status, 11);
  f.office(0, 'spec', 'approve', 'greeting', '--hash', f.specHash(), '--by', 'ana');
  const bytes = f.read(SPEC_APPROVAL);
  const count = () => f.events().filter((e) => e.event === 'approve' && e.gate === 'spec').length;
  assert.equal(count(), 1);
  const r = f.run('--resume');
  assert.equal(r.status, 0, r.out);
  assert.equal(f.read(SPEC_APPROVAL), bytes);
  assert.equal(count(), 1);
});

test('stale approval is replaced under auto', (t) => {
  const f = board(t);
  handBuilt(f, 'greeting', { approve: false, plan: false });
  f.put(SPEC_APPROVAL, `${JSON.stringify({ hash: 'a'.repeat(64), by: 'ana', at: '2026-01-01T00:00:00.000Z', mode: 'human' }, null, 2)}\n`);
  const hash = f.specHash();
  assert.notEqual(hash, 'a'.repeat(64));
  f.run('--resume', '--feature', 'greeting', '--max-steps', '1');
  const approval = JSON.parse(f.read(SPEC_APPROVAL));
  assert.equal(approval.hash, hash);
  assert.equal(approval.mode, 'policy');
});

test('open questions block the run', (t) => {
  const f = board(t, { scenario: { po: ['questions'] } });
  const r = f.run(REQUEST);
  assert.equal(r.status, 10, r.out);
  assert.ok(r.out.includes('Which locale?'), r.out);
  assert.ok(!f.exists(SPEC_APPROVAL));
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'blocked');
  const again = f.run('--resume');
  assert.equal(again.status, 10, again.out);
  assert.ok(again.out.includes('Which locale?'), again.out);
  assert.ok(!f.exists(SPEC_APPROVAL));
});

test('harness route stops at exit 11', (t) => {
  const f = board(t, { scenario: { judge: ['route: harness\nreason: the tests are flaky'] } });
  const r = f.run('our tests are flaky');
  assert.equal(r.status, 11, r.out);
  assert.equal(f.calls().length, 1);
  assert.ok(r.out.includes('/office'), r.out);
  assert.equal(lastEvent(f).event, 'run_end');
  assert.equal(lastEvent(f).outcome, 'awaiting_approval');
  assert.equal(lastEvent(f).route, 'harness');
});

test('spec approve records mode human', (t) => {
  const f = board(t);
  handBuilt(f, 'greeting', { approve: false, plan: false });
  const hash = f.specHash();
  const before = f.events().length;
  const r = f.raw('spec', 'approve', 'greeting', '--hash', hash, '--by', 'ana');
  assert.equal(r.status, 0, r.stderr);
  const printed = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(printed).sort(), ['hash', 'id', 'open_questions', 'status', 'type']);
  assert.equal(r.stdout.trim().split('\n').length, 1);
  const approval = JSON.parse(f.read(SPEC_APPROVAL));
  assert.equal(approval.mode, 'human');
  assert.equal(f.events().length, before + 1);
  const e = lastEvent(f);
  assert.equal(e.event, 'approve');
  assert.equal(e.gate, 'spec');
  assert.equal(e.mode, 'human');
  assert.equal(e.by, 'ana');
  assert.equal(e.hash, approval.hash);
  assert.equal(e.hash, hash);
  assert.equal(e.feature, 'greeting');
});

test('plan approve writes the approval', (t) => {
  const f = board(t);
  handBuilt(f);
  f.office(0, 'spec', 'validate', 'greeting', '--plan');
  const { hash } = f.planStatus();
  const before = f.events().length;
  f.office(0, 'plan', 'approve', 'greeting', '--hash', hash, '--by', 'ana');
  const approval = JSON.parse(f.read(PLAN_APPROVAL));
  assert.equal(approval.hash, hash);
  assert.equal(approval.by, 'ana');
  assert.match(approval.at, ISO);
  assert.equal(approval.mode, 'human');
  assert.equal(f.events().length, before + 1);
  const e = lastEvent(f);
  assert.equal(e.event, 'approve');
  assert.equal(e.gate, 'plan');
  assert.equal(e.mode, 'human');
  assert.equal(e.by, 'ana');
  assert.equal(e.hash, hash);
});

test('plan approve refusals', async (t) => {
  const cases = {
    'a hash that is not the current one': (f, hash) => ['plan', 'approve', 'greeting', '--hash', 'deadbeef', '--by', 'ana'],
    'an empty --by': (f, hash) => ['plan', 'approve', 'greeting', '--hash', hash, '--by', ''],
    'no --by': (f, hash) => ['plan', 'approve', 'greeting', '--hash', hash],
    'a plan that fails spec validate --plan': (f) => {
      f.office(0, 'task', 'new', 'greeting', '--title', 'No references');
      f.office(1, 'spec', 'validate', 'greeting', '--plan');
      return ['plan', 'approve', 'greeting', '--hash', f.planStatus().hash, '--by', 'ana'];
    },
    'an unknown action': () => ['plan', 'bogus', 'greeting'],
  };
  assert.equal(Object.keys(cases).length, 5);
  for (const [name, arrange] of Object.entries(cases)) {
    await t.test(name, (st) => {
      const f = board(st);
      handBuilt(f);
      const args = arrange(f, f.planStatus().hash);
      const before = f.log();
      f.office(1, ...args);
      assert.ok(!f.exists(PLAN_APPROVAL));
      assert.equal(f.log(), before);
    });
  }
});

test('command line refuses policy as approver', (t) => {
  const f = board(t);
  handBuilt(f, 'greeting', { approve: false });
  const before = f.log();
  f.office(1, 'spec', 'approve', 'greeting', '--hash', f.specHash(), '--by', 'policy:auto');
  f.office(1, 'plan', 'approve', 'greeting', '--hash', f.planStatus().hash, '--by', 'policy:x');
  assert.ok(!f.exists(SPEC_APPROVAL));
  assert.ok(!f.exists(PLAN_APPROVAL));
  assert.equal(f.log(), before);
});

test('plan status', (t) => {
  const f = board(t);
  handBuilt(f);
  const status = () => {
    const r = f.raw('plan', 'status', 'greeting');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim().split('\n').length, 1);
    return JSON.parse(r.stdout);
  };
  const draft = status();
  assert.equal(draft.id, 'greeting');
  assert.match(draft.hash, HEX64);
  assert.equal(draft.tasks, 2);
  assert.equal(fs.readdirSync(f.file('.the-office/features/greeting')).filter((n) => /^task-.*\.md$/.test(n)).length, 2);
  assert.equal(draft.status, 'draft');
  f.office(0, 'plan', 'approve', 'greeting', '--hash', draft.hash, '--by', 'ana');
  assert.equal(status().status, 'approved');
  f.edit(`.the-office/features/${T1}.md`, 'TODO — replace with', 'Prints a greeting; replace with');
  const stale = status();
  assert.equal(stale.status, 'stale');
  assert.notEqual(stale.hash, draft.hash);
  f.office(1, 'plan', 'status', 'ghost');
});

test('plan hash covers the contract only', (t) => {
  const f = board(t);
  handBuilt(f);
  const dir = '.the-office/features/greeting';
  const one = `${dir}/task-01.md`;
  const two = `${dir}/task-02.md`;
  const original = { [one]: f.read(one), [two]: f.read(two) };
  const base = f.planStatus().hash;
  const restore = () => {
    for (const name of fs.readdirSync(f.file(dir))) if (/^task-/.test(name)) fs.rmSync(f.file(`${dir}/${name}`));
    for (const [name, text] of Object.entries(original)) f.put(name, text);
    assert.equal(f.planStatus().hash, base);
  };
  const sha = 'b'.repeat(40);
  const same = {
    status: () => f.edit(one, 'status: pending', 'status: blocked'),
    attempts: () => f.edit(one, 'attempts: 0', 'attempts: 2'),
    base_commit: () => f.edit(one, 'base_commit: null', `base_commit: ${sha}`),
    branch: () => f.edit(one, 'branch: null', 'branch: main'),
    commit: () => f.edit(one, '\ncommit: null', `\ncommit: ${sha}`),
    body: () => f.edit(one, '## Notes', '## Notes\n- a note left by a lifecycle command'),
  };
  const differs = {
    'id and filename': () => { fs.renameSync(f.file(two), f.file(`${dir}/task-09.md`)); f.edit(`${dir}/task-09.md`, 'id: greeting/task-02', 'id: greeting/task-09'); },
    title: () => f.edit(one, 'title: Task 1', 'title: Another title'),
    tier: () => f.edit(one, 'tier: fast', 'tier: deep'),
    depends_on: () => f.edit(two, 'depends_on: ["greeting/task-01"]', 'depends_on: []'),
    scope: () => f.edit(one, 'scope: [src/**]', 'scope: [lib/**]'),
    checks: () => f.edit(one, 'checks: ["echo ok"]', 'checks: ["echo ok", "true"]'),
    dod: () => f.edit(one, 'TODO — replace with', 'Prints a greeting; replace with'),
    max_attempts: () => f.edit(one, 'max_attempts: 3', 'max_attempts: 4'),
    requirements: () => f.edit(one, 'requirements: [REQ-001]', 'requirements: [REQ-002]'),
    acceptance_criteria: () => f.edit(one, 'acceptance_criteria: [AC-001]', 'acceptance_criteria: [AC-002]'),
    verification_mode: () => f.edit(one, 'verification_mode: acceptance', 'verification_mode: regression'),
    'a task added': () => f.office(0, 'task', 'new', 'greeting', '--title', 'One more'),
    'a task removed': () => fs.rmSync(f.file(two)),
  };
  assert.equal(Object.keys(same).length, 6);
  assert.equal(Object.keys(differs).length, 13);
  for (const [name, change] of Object.entries(same)) {
    change();
    assert.equal(f.planStatus().hash, base, `${name} changed the plan hash`);
    restore();
  }
  for (const [name, change] of Object.entries(differs)) {
    change();
    assert.notEqual(f.planStatus().hash, base, `${name} did not change the plan hash`);
    restore();
  }
});

test('validate rejects invalid approvals and run config', (t) => {
  const withConfig = (extra) => {
    const s = sandbox(t);
    s.put('.the-office/config.yml', `version: 0.0.0\nschema: 1\n${extra}`);
    fs.mkdirSync(s.file('.the-office/features'), { recursive: true });
    return s;
  };
  const invalid = [
    ['approvals:\n  harness: auto\n', 'approvals.harness', 'auto'],
    ['approvals:\n  spec: maybe\n', 'approvals.spec', 'maybe'],
    ['approvals:\n  plan: yes\n', 'approvals.plan', 'yes'],
    ['run:\n  runtime: codex\n', 'run.runtime', 'codex'],
    ['run:\n  allowed_tools: Read\n', 'run.allowed_tools', 'Read'],
  ];
  assert.equal(invalid.length, 5);
  for (const [extra, key, value] of invalid) {
    const out = withConfig(extra).office(1, 'validate');
    const line = out.split('\n').find((l) => l.includes(key));
    assert.ok(line, `${key}: ${out}`);
    assert.ok(line.includes(value), line);
  }
  withConfig('approvals:\n  spec: auto\n  plan: auto\n  harness: human\nrun:\n  runtime: claude\n').office(0, 'validate');
});

test('product owner prompt carries the headless rule', () => {
  const text = fs.readFileSync(path.join(repo, 'payload/agents/office-product-owner.md'), 'utf8');
  assert.ok(text.includes('headless'));
  // The rule: the paragraph(s) under the heading that names headless runs.
  const section = text.split(/^## /m).find((part) => /headless/i.test(part.split('\n')[0]));
  assert.ok(section, 'a section about headless runs');
  assert.ok(section.includes('headless'));
  assert.ok(section.includes('Assumptions'));
  assert.ok(section.includes('open_questions'));
  assert.match(section, /never[^.]*`?office spec approve/i);
});

/* ------------------------------------------------------------------ *
 * S3 - `--resume` continues from the board
 * ------------------------------------------------------------------ */

test('resume after gate 1 approval completes the board', () => {
  const { f, first, approve, second } = resumed();
  assert.equal(first.status, 11, first.out);
  assert.equal(approve.status, 0, approve.stderr);
  assert.equal(second.status, 0, second.out);
  assert.equal(f.status(T1), 'completed');
  assert.equal(f.status(T2), 'completed');
  const roles = f.roles();
  assert.ok(roles.length > 0);
  assert.ok(!roles.includes('office-judge'));
  assert.ok(!roles.includes('office-product-owner'));
});

test('resume after gate 2 approval completes the board', (t) => {
  const f = board(t, { cfg: config({ approvals: { spec: 'auto', plan: 'human' } }) });
  const first = f.run(REQUEST);
  assert.equal(first.status, 11, first.out);
  const hash = /office plan approve greeting --hash ([0-9a-f]{64}) --by/.exec(first.out)[1];
  f.office(0, 'plan', 'approve', 'greeting', '--hash', hash, '--by', 'ana');
  f.clearCalls();
  const second = f.run('--resume');
  assert.equal(second.status, 0, second.out);
  assert.equal(f.status(T2), 'completed');
  assert.ok(f.roles().length > 0);
  assert.ok(!f.roles().includes('office-planner'));
  assert.ok(!f.roles().includes('office-devils-advocate'));
});

test('resume run_start', () => {
  const { f, second } = resumed();
  assert.equal(second.status, 0, second.out);
  const [firstId, secondId] = f.runIds();
  assert.equal(f.runIds().length, 2);
  assert.notEqual(secondId, firstId);
  assert.match(secondId, /^r-\d{8}T\d{9}Z$/);
  const start = f.runEvents(secondId)[0];
  assert.equal(start.event, 'run_start');
  assert.equal(start.request_hash, null);
  assert.ok(Object.hasOwn(start, 'request_hash'));
  assert.equal(start.feature, 'greeting');
});

test('resume picks its feature', (t) => {
  const f = board(t);
  handBuilt(f, 'alpha', { approve: false });
  handBuilt(f, 'beta', { approve: false });
  fs.appendFileSync(f.file(LOG), `${JSON.stringify({ v: 1, at: '2026-01-01T00:00:00.000Z', event: 'run_end', run: 'r-20260101T000000000Z', feature: 'alpha', route: 'feature', outcome: 'awaiting_approval' })}\n`);
  fs.appendFileSync(f.file(LOG), `${JSON.stringify({ v: 1, at: '2026-01-01T00:00:01.000Z', event: 'run_end', run: 'r-20260101T000001000Z', route: 'harness', outcome: 'awaiting_approval' })}\n`);
  const tasksOf = () => f.steps().map((e) => e.task).filter(Boolean);

  const a = f.run('--resume');
  assert.equal(a.status, 0, a.out);
  assert.ok(tasksOf().length >= 4);
  for (const id of tasksOf()) assert.ok(id.startsWith('alpha/'), id);

  const b = f.run('--resume', '--feature', 'beta');
  assert.equal(b.status, 0, b.out);
  assert.ok(tasksOf().length >= 4);
  for (const id of tasksOf()) assert.ok(id.startsWith('beta/'), id);
});

test('resume recovers the route', (t) => {
  const cfg = config({ approvals: { spec: 'human', plan: 'human' } });
  const arrange = () => {
    const f = board(t, { cfg, scenario: { tasks: [{ tier: 'fast' }] } });
    handBuilt(f);
    assert.ok(!f.exists(PLAN_APPROVAL));
    return f;
  };
  const trivial = arrange();
  fs.appendFileSync(trivial.file(LOG), `${JSON.stringify({ v: 1, at: '2026-01-01T00:00:00.000Z', event: 'run_end', run: 'r-20260101T000000000Z', feature: 'greeting', route: 'trivial', outcome: 'failed' })}\n`);
  const a = trivial.run('--resume');
  assert.equal(a.status, 0, a.out);
  assert.equal(trivial.status(T1), 'completed');
  assert.ok(!trivial.exists(PLAN_APPROVAL));

  const unknown = arrange();
  assert.ok(!unknown.events().some((e) => e.event === 'run_end'));
  const b = unknown.run('--resume', '--feature', 'greeting');
  assert.equal(b.status, 11, b.out);
  assert.equal(unknown.calls().length, 0);
  assert.ok(b.out.includes('office plan approve greeting --hash'));
});

test('resume with nothing to resume', (t) => {
  const f = board(t);
  const before = f.log();
  assert.ok(!f.events().some((e) => e.event === 'run_end'));
  for (const args of [['--resume'], ['--resume', '--feature', 'ghost']]) {
    const r = f.run(...args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.out}`);
    assert.equal(f.log(), before);
    assert.equal(f.calls().length, 0);
  }
});

test('resume on an invalid spec fails', (t) => {
  const f = board(t);
  // A legacy overview: the board validates, the spec does not.
  f.put('.the-office/features/greeting/overview.md', '# Greeting\n\nAn overview written before typed specs.\n');
  f.office(0, 'validate');
  f.office(1, 'spec', 'validate', 'greeting');
  const r = f.run('--resume', '--feature', 'greeting');
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(f.runEvents().map((e) => [e.event, e.outcome]), [['run_start', 'ok'], ['run_end', 'failed']]);
  assert.equal(f.calls().length, 0);
});

test('resume plans when there are no tasks', (t) => {
  const f = board(t);
  handBuilt(f, 'greeting', { plan: false });
  f.run('--resume', '--feature', 'greeting', '--max-steps', '1');
  assert.deepEqual(f.roles(), ['office-planner']);
});

test('resume continues work in flight', (t) => {
  const arrange = () => {
    const f = board(t, { scenario: { tasks: [{ tier: 'fast' }, { tier: 'standard', depends_on: [1] }] } });
    handBuilt(f);
    f.act('office-swe-fast', { task: T1 });
    f.act('office-reviewer', { task: T1 });
    assert.equal(f.status(T1), 'completed');
    return f;
  };
  const inProgress = arrange();
  inProgress.office(0, 'claim', T2);
  inProgress.clearCalls();
  inProgress.run('--resume', '--feature', 'greeting', '--max-steps', '1');
  assert.deepEqual(inProgress.calls().map((call) => [call.role, call.task]), [['office-swe', T2]]);
  assert.equal(inProgress.steps()[0].task, T2);

  const inReview = arrange();
  inReview.act('office-swe', { task: T2 });
  assert.equal(inReview.status(T2), 'review');
  inReview.clearCalls();
  inReview.run('--resume', '--feature', 'greeting', '--max-steps', '1');
  assert.deepEqual(inReview.calls().map((call) => [call.role, call.task]), [['office-reviewer', T2]]);
});

/* ------------------------------------------------------------------ *
 * S4 - the ending and the cost are readable by a script
 * ------------------------------------------------------------------ */

test('five endings five exit codes', (t) => {
  const oneRunEnd = (f, outcome) => {
    const [id] = f.runIds();
    assert.equal(f.runIds().length, 1);
    const ends = f.runEvents(id).filter((e) => e.event === 'run_end');
    assert.equal(ends.length, 1);
    assert.equal(ends[0].outcome, outcome);
    return ends[0];
  };
  const judged = (e) => { assert.equal(e.feature, 'greeting'); assert.equal(e.route, 'feature'); };

  const completed = happy();
  assert.equal(completed.r.status, 0);
  judged(oneRunEnd(completed.f, 'completed'));

  const crashed = board(t, { scenario: { fail: { 'office-judge': ['exit3'] } } });
  assert.equal(crashed.run(REQUEST).status, 1);
  const failed = oneRunEnd(crashed, 'failed');
  assert.ok(!Object.hasOwn(failed, 'feature'));
  assert.ok(!Object.hasOwn(failed, 'route'));

  const blocked = board(t, { scenario: { tasks: [{ tier: 'fast' }], swe: { [T1]: ['block'] } } });
  assert.equal(blocked.run(REQUEST).status, 10);
  assert.equal(blocked.status(T1), 'blocked');
  judged(oneRunEnd(blocked, 'blocked'));

  const gated = board(t, { cfg: config() });
  assert.equal(gated.run(REQUEST).status, 11);
  judged(oneRunEnd(gated, 'awaiting_approval'));

  const usage = board(t);
  assert.equal(usage.run().status, 2);
  assert.equal(usage.runIds().length, 0);
});

test('json report envelope', () => {
  const { f, r } = happy();
  assert.equal(r.status, 0, r.out);
  const report = JSON.parse(r.stdout);
  assert.ok(report && typeof report === 'object' && !Array.isArray(report));
  assert.deepEqual(Object.keys(report).sort(), ['duration_ms', 'outcome', 'run', 'tasks', 'usage']);
  assert.equal(report.run, f.events().find((e) => e.event === 'run_start').run);
  assert.equal(report.outcome, 'completed');
  assert.ok(Number.isInteger(report.duration_ms) && report.duration_ms >= 0);
  assert.ok(r.stderr.split('\n').filter((line) => line.trim()).length >= 8);
});

test('report file for every outcome', (t) => {
  const { f, r } = happy();
  assert.deepEqual(JSON.parse(f.read('out.json')), JSON.parse(r.stdout));
  const others = [
    ['failed', { scenario: { fail: { 'office-planner': ['exit3'] } } }],
    ['blocked', { scenario: { tasks: [{ tier: 'fast' }], swe: { [T1]: ['block'] } } }],
    ['awaiting_approval', { cfg: config() }],
  ];
  for (const [outcome, options] of others) {
    const other = board(t, options);
    other.run(REQUEST, '--report', 'out.json');
    assert.ok(other.exists('out.json'), `no report for ${outcome}`);
    const report = JSON.parse(other.read('out.json'));
    assert.equal(report.outcome, outcome);
    assert.deepEqual(Object.keys(report).sort(), ['duration_ms', 'outcome', 'run', 'tasks', 'usage']);
  }
  const usage = board(t);
  assert.equal(usage.run('x', '--bogus', '--report', 'out.json').status, 2);
  assert.equal(usage.run('--report', 'out.json').status, 2);
  assert.ok(!usage.exists('out.json'));
});

test('step usage from modelUsage', (t) => {
  const modelUsage = {
    'stub-a': { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 5, cacheCreationInputTokens: 2, costUSD: 0.01 },
    'stub-b': { inputTokens: 1000, outputTokens: 200, cacheReadInputTokens: 50, cacheCreationInputTokens: 20, costUSD: 0.5 },
  };
  const f = board(t, { cfg: config(), scenario: { usage: { 'office-judge': modelUsage } } });
  assert.equal(f.run(REQUEST).status, 11);
  const { usage } = f.steps().find((e) => e.role === 'office-judge');
  const expected = {
    input: 1100, output: 210, cache_read: 55, cache_write: 22, cost_usd: 0.51,
    by_model: { 'stub-a': STUB_A, 'stub-b': { input: 1000, output: 200, cache_read: 50, cache_write: 20, cost_usd: 0.5 } },
  };
  assert.deepEqual(Object.keys(usage).sort(), Object.keys(expected).sort());
  const { by_model: actualModels, ...actualTotals } = usage;
  const { by_model: expectedModels, ...expectedTotals } = expected;
  assertUsage(actualTotals, expectedTotals);
  assert.deepEqual(Object.keys(actualModels).sort(), ['stub-a', 'stub-b']);
  for (const model of ['stub-a', 'stub-b']) assertUsage(actualModels[model], expectedModels[model], model);
});

test('report usage by role, model and total', () => {
  const { report } = happy();
  assert.ok(report);
  assert.deepEqual(Object.keys(report.usage).sort(), ['by_model', 'by_role', 'total']);
  assert.deepEqual(Object.keys(report.usage.by_role).sort(), [...SEVEN_ROLES].sort());
  for (const role of SEVEN_ROLES) assertUsage(report.usage.by_role[role], role === 'office-reviewer' ? times(STUB_A, 2) : STUB_A, role);
  assert.deepEqual(Object.keys(report.usage.by_model), ['stub-a']);
  const all = { input: 800, output: 80, cache_read: 40, cache_write: 16, cost_usd: 0.08 };
  assertUsage(report.usage.by_model['stub-a'], all, 'by_model');
  assertUsage(report.usage.total, all, 'total');
});

test('a step with no usage adds nothing', (t) => {
  const f = board(t, { scenario: { fail: { 'office-planner': ['no_usage'] } } });
  const r = f.run(REQUEST, '--json');
  assert.equal(r.status, 1, r.out);
  const planner = f.steps().find((e) => e.role === 'office-planner');
  assert.equal(planner.outcome, 'crashed');
  assert.equal(planner.usage, null);
  const report = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(report.usage.by_role).sort(), ['office-judge', 'office-planner', 'office-product-owner']);
  assert.deepEqual(report.usage.by_role['office-planner'], { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0 });
  assertUsage(report.usage.total, times(STUB_A, 2), 'total');
});

test('report task counts', (t) => {
  assert.deepEqual(happy().report.tasks, { completed: 2, blocked: 0 });
  const blocked = blockedRun();
  assert.equal(blocked.r.status, 10, blocked.r.out);
  assert.deepEqual(JSON.parse(blocked.r.stdout).tasks, { completed: 1, blocked: 1 });
  const f = board(t, { scenario: { fail: { 'office-judge': ['exit3'] } } });
  const r = f.run(REQUEST, '--json');
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(JSON.parse(r.stdout).tasks, { completed: 0, blocked: 0 });
});

test('report is derivable from the log', () => {
  // Recomputed here from run_start, step and run_end of one run id, nothing else.
  const derive = (events, id) => {
    const mine = events.filter((e) => e.run === id && ['run_start', 'step', 'run_end'].includes(e.event));
    const zero = () => ({ input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0 });
    const add = (into, u) => { for (const key of USAGE_KEYS) into[key] += u[key]; };
    const by_role = {}, by_model = {}, total = zero();
    for (const e of mine.filter((x) => x.event === 'step')) {
      by_role[e.role] ??= zero();
      if (e.usage === null) continue;
      add(by_role[e.role], e.usage);
      add(total, e.usage);
      for (const [model, u] of Object.entries(e.usage.by_model)) { by_model[model] ??= zero(); add(by_model[model], u); }
    }
    return { outcome: mine.find((e) => e.event === 'run_end').outcome, by_role, by_model, total };
  };
  const check = (f, report) => {
    const derived = derive(f.events(), report.run);
    assert.equal(report.outcome, derived.outcome);
    assert.deepEqual(report.usage.by_role, derived.by_role);
    assert.deepEqual(report.usage.by_model, derived.by_model);
    assert.deepEqual(report.usage.total, derived.total);
  };
  const first = happy();
  check(first.f, first.report);

  const { f, second } = resumed();
  assert.equal(second.status, 0, second.out);
  const report = JSON.parse(second.stdout);
  assert.equal(report.run, f.runIds()[1]);
  check(f, report);
  // The first run's judge and product owner steps share the log and are not counted.
  assert.ok(f.steps(f.runIds()[0]).some((e) => e.role === 'office-judge'));
  assert.ok(!Object.hasOwn(report.usage.by_role, 'office-judge'));
  assert.ok(!Object.hasOwn(report.usage.by_role, 'office-product-owner'));
  assertUsage(report.usage.total, times(STUB_A, 6), 'resumed total');
});

test('human-readable summary', () => {
  const { r } = happyPlain();
  assert.equal(r.status, 0, r.out);
  assert.ok(r.stdout.includes('completed'));
  const lines = r.stdout.split('\n');
  for (const role of SEVEN_ROLES) {
    assert.equal(lines.filter((line) => line.trim().split(/\s+/)[0] === role).length, 1, `one line for ${role}`);
  }
  assert.throws(() => JSON.parse(r.stdout));
});

test('next exit codes', (t) => {
  const id = 'sample/task-01';
  const two = 'sample/task-02';
  // The `good` board in a Git repo: task-02 depends on task-01.
  const good = ({ independent = false } = {}) => {
    const s = sandbox(t, 'good');
    for (const args of [['init', '-q'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'Test']]) assert.equal(s.exec('git', args).status, 0);
    s.put('src/a.txt', 'baseline');
    if (independent) s.edit(`.the-office/features/${two}.md`, 'depends_on: ["sample/task-01"]', 'depends_on: []');
    assert.equal(s.exec('git', ['add', '.']).status, 0);
    assert.equal(s.exec('git', ['commit', '-qm', 'baseline']).status, 0);
    return s;
  };
  const next = (s, want) => {
    const r = s.raw('next');
    assert.equal(r.status, want, `${r.stdout}${r.stderr}`);
    return r.stdout;
  };

  const ready = good();
  assert.equal(next(ready, 0).trim(), id);

  const flight = good();
  flight.office(0, 'claim', id);
  next(flight, 12);
  flight.office(0, 'check', id); flight.office(0, 'scope', id); flight.office(0, 'review', id);
  assert.match(flight.read(`.the-office/features/${id}.md`), /^status: review$/m);
  next(flight, 12);

  const blocked = good();
  blocked.office(0, 'block', id, '--reason', 'stuck');
  next(blocked, 10);

  const complete = good();
  for (const task of [id, two]) complete.edit(`.the-office/features/${task}.md`, 'status: pending', 'status: completed');
  next(complete, 3);

  const empty = sandbox(t);
  fs.mkdirSync(empty.file('.the-office/features'), { recursive: true });
  next(empty, 3);

  const both = good({ independent: true });
  both.office(0, 'block', two, '--reason', 'stuck');
  both.office(0, 'claim', id);
  next(both, 12);

  const blockedAndReady = good({ independent: true });
  blockedAndReady.office(0, 'block', two, '--reason', 'stuck');
  assert.equal(next(blockedAndReady, 0).trim(), id);
});

test('run events do not disturb stats or validate', (t) => {
  const s = sandbox(t, 'stats');
  const all = s.raw('stats', '--json');
  const alpha = s.raw('stats', 'alpha', '--json');
  assert.equal(all.status, 0, all.stderr);
  assert.equal(alpha.status, 0, alpha.stderr);
  const at = '2026-01-02T00:00:00.000Z';
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0, by_model: { 'model-x': { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0 } } };
  const literals = [
    { v: 1, at, event: 'run_start', run: 'r-20261125T120000123Z', outcome: 'ok', request_hash: sha256('x'), runtime: 'claude' },
    { v: 1, at, event: 'step', run: 'r-20261125T120000123Z', feature: 'alpha', role: 'office-swe', task: 'alpha/task-01', outcome: 'ok', duration_ms: 1234, usage },
    { v: 1, at, event: 'approve', feature: 'alpha', outcome: 'ok', gate: 'spec', by: 'policy:auto', mode: 'policy', hash: sha256('spec') },
    { v: 1, at, event: 'run_end', run: 'r-20261125T120000123Z', feature: 'alpha', route: 'feature', outcome: 'completed' },
  ];
  fs.appendFileSync(s.file(LOG), literals.map((e) => `${JSON.stringify(e)}\n`).join(''));
  assert.equal(s.raw('stats', '--json').stdout, all.stdout);
  assert.equal(s.raw('stats', 'alpha', '--json').stdout, alpha.stdout);

  const { f, r } = happy();
  assert.equal(r.status, 0);
  for (const event of ['run_start', 'step', 'approve', 'run_end']) assert.ok(f.events().some((e) => e.event === event), event);
  f.office(0, 'validate');
});

test('help lists run, plan and the new footer', (t) => {
  const s = sandbox(t);
  const help = s.office(0, 'help');
  assert.ok(help.includes('run "<request>"'));
  assert.ok(help.includes('--resume'));
  assert.ok(help.includes('plan approve|status'));
  const lines = help.split('\n');
  const at = lines.findIndex((line) => /^\s*next\b/.test(line));
  assert.ok(at >= 0);
  // The `next` entry: its own line plus the continuation lines indented under it.
  let entry = lines[at];
  for (let i = at + 1; i < lines.length && /^\s{20,}\S/.test(lines[i]); i++) entry += `\n${lines[i]}`;
  for (const code of ['3', '10', '12']) assert.match(entry, new RegExp(`\\b${code}\\b`), `next names exit ${code}`);
  assert.ok(help.includes('Nothing here asks a model to decide anything.'));
  assert.ok(!help.includes('Nothing here uses a model'));
});

test('init writes run and approvals', (t) => {
  const s = sandbox(t);
  s.office(0, 'init');
  const text = s.read('.the-office/config.yml');
  // Top-level `key:` blocks of two-space `name: value` pairs are all this file uses.
  const block = (key) => {
    const lines = text.split('\n');
    const start = lines.indexOf(`${key}:`);
    assert.ok(start >= 0, `${key}: block`);
    const out = {};
    for (let i = start + 1; i < lines.length && /^ {2}\S/.test(lines[i]); i++) {
      const [, name, value] = /^ {2}([a-z_]+): (.*)$/.exec(lines[i]);
      out[name] = value === '[]' ? [] : value;
    }
    return out;
  };
  assert.deepEqual(block('run'), { runtime: 'claude', permission_mode: 'acceptEdits', allowed_tools: [] });
  assert.deepEqual(block('approvals'), { spec: 'human', plan: 'human', harness: 'human' });
  const version = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();
  const template = fs.readFileSync(path.join(repo, 'templates/config.yml.tmpl'), 'utf8');
  assert.equal(text, template.replaceAll('{{VERSION}}', version));
  s.office(0, 'validate');
});

/* ------------------------------------------------------------------ *
 * S5 - the headless path is documented and has a real-runtime job
 * ------------------------------------------------------------------ */

test('headless docs', () => {
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8').split('\n');
  const start = readme.findIndex((line) => /^#{1,6} .*Headless/.test(line));
  assert.ok(start >= 0, 'a heading containing Headless');
  const level = /^#+/.exec(readme[start])[0].length;
  let end = readme.length;
  let fenced = false;
  for (let i = start + 1; i < readme.length; i++) {
    if (readme[i].startsWith('```')) fenced = !fenced;
    const heading = !fenced && /^(#+) /.exec(readme[i]);
    if (heading && heading[1].length <= level) { end = i; break; }
  }
  const section = readme.slice(start, end);
  const text = section.join('\n');
  assert.ok(text.includes('office run'));
  const codes = [['0', /complet/i], ['1', /fail/i], ['2', /usage/i], ['10', /blocked/i], ['11', /approval/i]];
  for (const [code, meaning] of codes) {
    assert.ok(section.some((line) => new RegExp(`(^|[^0-9.])${code}([^0-9.]|$)`).test(line) && meaning.test(line)), `exit code ${code} with its meaning`);
  }
  assert.ok(text.includes('approvals:'));
  assert.ok(text.includes('run:'));
  const relaxed = /bypassPermissions|dontAsk|permission_mode:\s*auto\b/;
  const hits = readme.map((line, i) => (relaxed.test(line) ? i : -1)).filter((i) => i >= 0);
  assert.ok(hits.length > 0, 'an example that relaxes permissions');
  for (const i of hits) {
    assert.ok(readme.slice(Math.max(0, i - 5), i + 6).some((line) => /container/i.test(line)), `README.md:${i + 1} relaxes permissions with no container nearby`);
  }
  const skill = fs.readFileSync(path.join(repo, 'payload/skills/office/SKILL.md'), 'utf8');
  assert.ok(skill.includes('office run'));
  assert.ok(skill.includes('approvals'));
  assert.match(skill, /\b10\b/);
  assert.match(skill, /\b11\b/);
});

test('headless workflow is manual only', () => {
  const dir = path.join(repo, '.github/workflows');
  const files = fs.readdirSync(dir).filter((name) => /office(\.mjs)? run\b/.test(fs.readFileSync(path.join(dir, name), 'utf8')));
  assert.equal(files.length, 1, `workflows that run office run: ${files.join(', ')}`);
  const text = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  const lines = text.split('\n');
  // Triggers: the keys nested under the top-level `on:`.
  const on = lines.findIndex((line) => /^on:\s*$/.test(line));
  assert.ok(on >= 0, 'a block-style on: key');
  const triggers = [];
  for (let i = on + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
    const key = /^ {2}([a-z_]+):/.exec(lines[i]);
    if (key) triggers.push(key[1]);
  }
  assert.deepEqual(triggers, ['workflow_dispatch']);
  assert.match(text, /install\.sh/);
  assert.match(text, /office(\.mjs)? run [^\n]*--report/);
  assert.match(text, /-eq 0/);
  assert.match(text, /by_role/);
  assert.match(text, /event === ['"]step['"]/);

  const suite = fs.readFileSync(path.join(repo, 'tests/run.sh'), 'utf8');
  assert.ok(suite.split('\n').some((line) => line.includes('node --test') && line.includes('tests/run.test.mjs')));
  assert.match(fs.readFileSync(path.join(repo, 'docs/rfcs/0002-headless.md'), 'utf8'), /^\| Status \| Implemented \|$/m);
  assert.match(fs.readFileSync(path.join(repo, 'docs/rfcs/README.md'), 'utf8'), /0002-headless\.md\).*Implemented/);
});
