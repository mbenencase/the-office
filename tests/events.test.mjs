import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'payload/bin/office.mjs');
const id = 'sample/task-01';
const LOG = '.the-office/events.jsonl';
const UNION = '.the-office/*.jsonl merge=union';

// A temp directory with an optional board copied in. No Git.
function sandbox(t, from) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-events-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (from) fs.cpSync(path.join(repo, 'tests/fixtures', from), root, { recursive: true });
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const raw = (...args) => run(process.execPath, [cli, ...args]);
  const office = (want, ...args) => {
    const r = raw(...args);
    assert.equal(r.status, want, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    return r.stdout + r.stderr;
  };
  const file = (name) => path.join(root, name);
  const put = (name, text) => { fs.mkdirSync(path.dirname(file(name)), { recursive: true }); fs.writeFileSync(file(name), text); };
  const log = () => (fs.existsSync(file(LOG)) ? fs.readFileSync(file(LOG), 'utf8') : null);
  const lines = () => (log() ?? '').split('\n').filter(Boolean);
  const events = () => lines().map((l) => JSON.parse(l));
  const last = () => events().at(-1);
  return { root, run, raw, office, file, put, log, lines, events, last };
}

// The lifecycle fixture: the `good` board in a Git repo with one committed file.
function fixture(t, { config } = {}) {
  const s = sandbox(t, 'good');
  const git = (...args) => {
    const r = s.run('git', args);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const taskFile = (task = id) => s.file(`.the-office/features/${task}.md`);
  const edit = (old, value, task = id) => {
    const text = fs.readFileSync(taskFile(task), 'utf8');
    assert.ok(text.includes(old), `missing ${old}`);
    fs.writeFileSync(taskFile(task), text.replace(old, value));
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  s.put('src/a.txt', 'baseline');
  if (config !== undefined) s.put('.the-office/config.yml', config);
  git('add', '.'); git('commit', '-qm', 'baseline');
  const base = git('rev-parse', 'HEAD');
  const commit = () => { git('add', '.'); git('commit', '-qm', 'task implementation'); };
  const verify = () => { s.office(0, 'check', id); s.office(0, 'scope', id); };
  return { ...s, git, taskFile, edit, base, commit, verify };
}

const seq = (events) => events.map((e) => `${e.event}:${e.outcome}`).join(' ');
const isCount = (n) => Number.isInteger(n) && n >= 0;

// Every file under a directory, by relative path, with its bytes.
function tree(dir) {
  const out = {};
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) rec(full); else out[path.relative(dir, full)] = fs.readFileSync(full, 'latin1');
    }
  };
  rec(dir);
  return out;
}

// claim, failing check, passing check, scope, review, retry, check, scope, review, done.
function lifecycleSteps(f) {
  return [
    () => f.office(0, 'claim', id),
    () => { f.edit('echo ok', 'exit 1'); f.office(1, 'check', id); f.edit('exit 1', 'echo ok'); },
    () => f.office(0, 'check', id),
    () => f.office(0, 'scope', id),
    () => f.office(0, 'review', id),
    () => f.office(0, 'retry', id, '--reason', 'finding 1'),
    () => f.office(0, 'check', id),
    () => f.office(0, 'scope', id),
    () => f.office(0, 'review', id),
    () => f.office(0, 'done', id),
  ];
}

/* ------------------------------------------------------------------ *
 * S1 - lifecycle commands leave an ordered event log
 * ------------------------------------------------------------------ */

test('common fields on every event', (t) => {
  const f = fixture(t);
  f.office(0, 'feature', 'new', 'demo', '--type', 'bug');
  for (const step of lifecycleSteps(f)) step();
  f.office(0, 'block', 'sample/task-02', '--reason', 'stuck');
  const raw = f.log();
  assert.ok(raw.endsWith('\n'));
  const lines = raw.slice(0, -1).split('\n');
  assert.equal(lines.length, 12);
  const seen = new Set();
  for (const line of lines) {
    const e = JSON.parse(line);
    assert.ok(e && typeof e === 'object' && !Array.isArray(e), line);
    assert.equal(e.v, 1);
    assert.match(e.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    for (const key of ['event', 'feature', 'outcome']) assert.equal(typeof e[key], 'string', `${key} in ${line}`);
    if (e.event === 'feature') assert.ok(!Object.hasOwn(e, 'task'));
    else assert.equal(e.task, e.event === 'block' ? 'sample/task-02' : id);
    seen.add(e.event);
  }
  assert.deepEqual([...seen].sort(), ['block', 'check', 'claim', 'done', 'feature', 'retry', 'review', 'scope']);
});

test('claim event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  assert.equal(f.lines().length, 1);
  const e = f.last();
  assert.equal(e.event, 'claim');
  assert.equal(e.outcome, 'ok');
  assert.equal(e.attempt, 1);
  assert.equal(e.base_commit, f.base);
  assert.equal(e.feature, 'sample');
});

test('check ok event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  f.office(0, 'check', id);
  const e = f.last();
  assert.equal(e.event, 'check');
  assert.equal(e.outcome, 'ok');
  assert.ok(isCount(e.duration_ms), `duration_ms: ${e.duration_ms}`);
  assert.ok(!Object.hasOwn(e, 'command'));
  assert.ok(!Object.hasOwn(e, 'exit'));
});

test('check fail event', (t) => {
  const f = fixture(t);
  f.edit('checks: ["echo ok"]', 'checks: ["exit 3"]');
  f.office(0, 'claim', id);
  f.office(1, 'check', id);
  const e = f.last();
  assert.equal(e.event, 'check');
  assert.equal(e.outcome, 'fail');
  assert.equal(e.command, 'exit 3');
  assert.equal(e.exit, 3);
  assert.ok(isCount(e.duration_ms), `duration_ms: ${e.duration_ms}`);
});

test('scope ok event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  f.put('src/a.txt', 'implementation');
  f.office(0, 'scope', id);
  const e = f.last();
  assert.equal(e.event, 'scope');
  assert.equal(e.outcome, 'ok');
  assert.equal(e.files, 1);
  assert.ok(!Object.hasOwn(e, 'outside'));
});

test('scope fail event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  f.put('src/a.txt', 'implementation');
  f.put('outside.txt', 'not allowed');
  f.office(1, 'scope', id);
  const e = f.last();
  assert.equal(e.event, 'scope');
  assert.equal(e.outcome, 'fail');
  assert.equal(e.files, 2);
  assert.equal(e.outside, 1);
});

test('review event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id); f.verify();
  f.office(0, 'review', id);
  const e = f.last();
  assert.equal(e.event, 'review');
  assert.equal(e.outcome, 'ok');
  assert.equal(e.task, id);
});

test('retry ok event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id); f.verify(); f.office(0, 'review', id);
  f.office(0, 'retry', id, '--reason', 'finding 1');
  const e = f.last();
  assert.equal(e.event, 'retry');
  assert.equal(e.outcome, 'ok');
  assert.equal(e.attempt, 2);
  assert.equal(e.reason, 'finding 1');
});

test('retry exhausted event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  for (const n of [1, 2]) { f.verify(); f.office(0, 'review', id); f.office(0, 'retry', id, '--reason', `finding ${n}`); }
  f.verify(); f.office(0, 'review', id);
  assert.match(fs.readFileSync(f.taskFile(), 'utf8'), /^attempts: 3$/m);
  const before = f.lines().length;
  f.office(1, 'retry', id, '--reason', 'finding 3');
  assert.equal(f.lines().length, before + 1);
  const e = f.last();
  assert.equal(e.event, 'retry');
  assert.equal(e.outcome, 'exhausted');
  assert.equal(e.attempt, 3);
  assert.equal(e.reason, 'finding 3');
  assert.ok(!f.events().some((x) => x.event === 'block'));
});

test('done event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id); f.verify(); f.office(0, 'review', id);
  f.office(0, 'done', id);
  const text = fs.readFileSync(f.taskFile(), 'utf8');
  const field = (key) => new RegExp(`^${key}: (.+)$`, 'm').exec(text)[1];
  const e = f.last();
  assert.equal(e.event, 'done');
  assert.equal(e.outcome, 'ok');
  assert.match(field('commit'), /^[0-9a-f]{40}$/);
  assert.equal(e.commit, field('commit'));
  assert.equal(e.branch, field('branch'));
});

test('block event', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  f.office(0, 'block', id, '--reason', 'stuck');
  let e = f.last();
  assert.equal(e.event, 'block');
  assert.equal(e.outcome, 'ok');
  assert.equal(e.reason, 'stuck');
  assert.equal(e.from, 'in-progress');
  f.office(0, 'block', 'sample/task-02', '--reason', 'stuck');
  e = f.last();
  assert.equal(e.event, 'block');
  assert.equal(e.task, 'sample/task-02');
  assert.equal(e.from, 'pending');
});

test('feature event', (t) => {
  const f = fixture(t);
  f.office(0, 'feature', 'new', 'demo', '--type', 'bug');
  assert.equal(f.lines().length, 1);
  const e = f.last();
  assert.equal(e.event, 'feature');
  assert.equal(e.outcome, 'ok');
  assert.equal(e.feature, 'demo');
  assert.equal(e.type, 'bug');
  assert.ok(!Object.hasOwn(e, 'task'));
});

test('refused commands leave the log byte-identical', async (t) => {
  // Each case: arrange the board, then name the refused command and why it is refused.
  const cases = {
    'done on a pending task (wrong status)': () => [['done', id], /expected one of/],
    'claim with a dirty tree': (f) => { f.put('src/a.txt', 'dirty'); return [['claim', id], /commit task code/]; },
    'claim with a stale spec approval': (f) => {
      f.office(0, 'feature', 'new', 'specd', '--type', 'feature');
      const spec = f.file('.the-office/features/specd/overview.md');
      fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replaceAll('TODO', 'Concrete'));
      f.office(0, 'task', 'new', 'specd', '--title', 'Implement requirement');
      for (const [old, value] of [['requirements: []', 'requirements: [REQ-001]'], ['acceptance_criteria: []', 'acceptance_criteria: [AC-001]'], ['scope: []', 'scope: [src/**]'], ['checks: []', 'checks: ["echo ok"]']]) f.edit(old, value, 'specd/task-01');
      const { hash } = JSON.parse(f.office(0, 'spec', 'status', 'specd'));
      f.office(0, 'spec', 'approve', 'specd', '--hash', hash, '--by', 'test-human');
      fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace('Concrete problem', 'Updated problem'));
      return [['claim', 'specd/task-01'], /stale/];
    },
    'block while execution.lock exists': (f) => {
      f.office(0, 'claim', id);
      f.put('.the-office/execution.lock', '1');
      return [['block', id, '--reason', 'competing command'], /another command owns/];
    },
    'block with no --reason': (f) => { f.office(0, 'claim', id); return [['block', id], /requires --reason/]; },
    'check with checks: []': (f) => {
      f.office(0, 'claim', id);
      f.edit('checks: ["echo ok"]', 'checks: []');
      return [['check', id], /no valid checks/];
    },
    'scope with scope: []': (f) => {
      f.office(0, 'claim', id);
      f.edit('scope:\n  - src/**', 'scope: []');
      return [['scope', id], /non-empty scope/];
    },
    'claim with an uncompleted dependency': () => [['claim', 'sample/task-02'], /is not completed/],
    'check whose command rewrites src/a.txt': (f) => {
      f.edit('echo ok', 'echo changed > src/a.txt');
      f.office(0, 'claim', id);
      return [['check', id], /changed code or contract/];
    },
  };
  assert.equal(Object.keys(cases).length, 9);
  for (const [name, arrange] of Object.entries(cases)) {
    await t.test(name, (st) => {
      const f = fixture(st);
      const [args, why] = arrange(f);
      const before = f.log();
      assert.match(f.office(1, ...args), why);
      assert.equal(f.log(), before);
    });
  }
});

test('full lifecycle event sequence', (t) => {
  const f = fixture(t);
  let count = 0;
  for (const step of lifecycleSteps(f)) {
    step();
    count += 1;
    assert.equal(f.lines().length, count);
  }
  assert.equal(f.lines().length, 10);
  assert.equal(seq(f.events()), 'claim:ok check:fail check:ok scope:ok review:ok retry:ok check:ok scope:ok review:ok done:ok');
});

test('log appends do not stale evidence', (t) => {
  const f = fixture(t);
  f.put(LOG, '');
  f.git('add', LOG); f.git('commit', '-qm', 'track the event log');
  f.office(0, 'claim', id);
  f.put('src/a.txt', 'implementation');
  f.commit();
  f.office(0, 'check', id);
  assert.match(f.office(0, 'scope', id), /1 changed file/);
  assert.equal(f.git('ls-files', LOG), LOG);
  assert.match(f.git('status', '--porcelain', LOG), /^M/);
  f.office(0, 'review', id);
});

/* ------------------------------------------------------------------ *
 * S2 - `office stats` derives the metrics from the log
 * ------------------------------------------------------------------ */

const NO_CYCLE = { n: 0, median: null, p90: null };
function stats(t, ...args) {
  const s = sandbox(t, 'stats');
  return { s, out: JSON.parse(s.office(0, 'stats', ...args, '--json')) };
}

test('stats json envelope', (t) => {
  const s = sandbox(t, 'stats');
  const before = tree(s.root);
  const r = s.raw('stats', '--json');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out && typeof out === 'object' && !Array.isArray(out));
  assert.deepEqual(Object.keys(out).sort(), ['excluded', 'metrics']);
  assert.deepEqual(tree(s.root), before);
  assert.ok(!fs.existsSync(s.file('.the-office/execution.lock')));
});

test('stats cycle time', (t) => {
  assert.deepEqual(stats(t).out.metrics.cycle_time_ms, { n: 4, median: 150000, p90: 600000 });
});

test('stats cycle time odd n', (t) => {
  const s = sandbox(t);
  const at = (ms) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString();
  const line = (event, task, ms) => JSON.stringify({ v: 1, at: at(ms), event, task: `odd/${task}`, feature: 'odd', outcome: 'ok' });
  s.put(LOG, [
    line('claim', 'task-01', 0), line('done', 'task-01', 180000),
    line('claim', 'task-02', 0), line('done', 'task-02', 60000),
    line('claim', 'task-03', 0), line('done', 'task-03', 120000),
  ].join('\n') + '\n');
  const { cycle_time_ms: cycle } = JSON.parse(s.office(0, 'stats', '--json')).metrics;
  assert.equal(cycle.n, 3);
  assert.equal(cycle.median, 120000);
  assert.equal(cycle.p90, 180000);
});

test('stats lead time', (t) => {
  assert.deepEqual(stats(t).out.metrics.lead_time_ms, { alpha: 900000 });
});

test('stats first-pass check rate', (t) => {
  assert.deepEqual(stats(t).out.metrics.first_pass_check_rate, { passed: 3, tasks: 5, rate: 0.6 });
});

test('stats retries per task', (t) => {
  assert.deepEqual(stats(t).out.metrics.retries_per_task, { retries: 3, tasks: 6, mean: 0.5, max: 2 });
});

test('stats escalation rate', (t) => {
  assert.deepEqual(stats(t).out.metrics.escalation_rate, { escalated: 2, tasks: 6, rate: 2 / 6 });
});

test('stats excluded count', (t) => {
  assert.equal(stats(t).out.excluded, 1);
});

test('stats feature filter', (t) => {
  assert.deepEqual(stats(t, 'beta').out, {
    metrics: {
      cycle_time_ms: NO_CYCLE,
      lead_time_ms: {},
      first_pass_check_rate: { passed: 0, tasks: 1, rate: 0 },
      retries_per_task: { retries: 2, tasks: 2, mean: 1, max: 2 },
      escalation_rate: { escalated: 2, tasks: 2, rate: 1 },
    },
    excluded: 0,
  });
});

test('stats with no log', (t) => {
  const s = sandbox(t, 'good');
  assert.ok(!fs.existsSync(s.file(LOG)));
  assert.deepEqual(JSON.parse(s.office(0, 'stats', '--json')).metrics, {
    cycle_time_ms: NO_CYCLE,
    lead_time_ms: {},
    first_pass_check_rate: { passed: 0, tasks: 0, rate: null },
    retries_per_task: { retries: 0, tasks: 0, mean: null, max: 0 },
    escalation_rate: { escalated: 0, tasks: 0, rate: null },
  });
});

test('stats ignores unreadable and unknown lines', (t) => {
  const s = sandbox(t, 'stats');
  const before = s.raw('stats', '--json');
  assert.equal(before.status, 0, before.stderr);
  const isJson = (l) => { try { JSON.parse(l); return true; } catch { return false; } };
  const all = s.lines();
  const kept = all.filter((l) => isJson(l) && JSON.parse(l).event !== 'run_start');
  assert.equal(all.length - kept.length, 2);
  s.put(LOG, kept.join('\n') + '\n');
  const after = s.raw('stats', '--json');
  assert.equal(after.status, 0, after.stderr);
  assert.equal(after.stdout, before.stdout);
});

test('stats table output', (t) => {
  const s = sandbox(t, 'stats');
  const r = s.raw('stats');
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.toLowerCase().split('\n');
  for (const metric of ['cycle time', 'lead time', 'first-pass check rate', 'retries per task', 'escalation rate']) {
    assert.equal(rows.filter((row) => row.includes(metric)).length, 1, `one row for ${metric}`);
  }
  assert.match(r.stdout, /^.*1 task\(s\) excluded.*$/m);
});

test('help lists stats', (t) => {
  const s = sandbox(t);
  assert.ok(s.office(0, 'help').includes('stats [feature] [--json]'));
});

test('stats with no board', (t) => {
  const s = sandbox(t);
  for (let d = s.root; ; d = path.dirname(d)) {
    assert.ok(!fs.existsSync(path.join(d, '.the-office')), `${d} has a board`);
    if (d === path.dirname(d)) break;
  }
  s.office(1, 'stats');
});

/* ------------------------------------------------------------------ *
 * S3 - the board declares a schema the CLI respects
 * ------------------------------------------------------------------ */

test('init writes schema 1', (t) => {
  const s = sandbox(t);
  assert.equal(s.run('git', ['init', '-q']).status, 0);
  s.office(0, 'init');
  assert.ok(fs.readFileSync(s.file('.the-office/config.yml'), 'utf8').split('\n').includes('schema: 1'));
});

test('schema 99 is refused by every command', (t) => {
  const f = fixture(t, { config: 'version: 0.1.0\nschema: 99\n' });
  const commands = [
    ['init', '--force'], ['board'], ['next'], ['validate'], ['claim', id],
    ['retry', id, '--reason', 'r'], ['review', id], ['done', id], ['block', id, '--reason', 'r'],
    ['check', id], ['scope', id], ['audit'], ['pack', 'list'], ['findings', 'list'],
    ['spec', 'status', 'sample'], ['feature', 'new', 'x'], ['task', 'new', 'sample'], ['stats'], ['capabilities'],
  ];
  assert.equal(commands.length, 19);
  const before = tree(f.file('.the-office'));
  for (const args of commands) {
    const r = f.raw(...args);
    const name = args.join(' ');
    assert.equal(r.status, 1, `${name}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /99/, name);
    assert.match(r.stderr, /(^|[^0-9.])1([^0-9.]|$)/, name);
    assert.match(r.stderr, /upgrade/, name);
    assert.deepEqual(tree(f.file('.the-office')), before, name);
  }
});

test('help and version ignore the schema gate', (t) => {
  const f = fixture(t, { config: 'version: 0.1.0\nschema: 99\n' });
  f.office(0, 'help');
  f.office(0, 'version');
});

test('invalid schema values are refused', (t) => {
  for (const value of ['-1', 'abc', '1.5']) {
    const s = sandbox(t, 'good');
    s.put('.the-office/config.yml', `version: 0.1.0\nschema: ${value}\n`);
    const r = s.raw('board');
    assert.equal(r.status, 1, `schema ${value}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stderr.includes(value), `schema ${value}: ${r.stderr}`);
  }
});

test('a board with no schema key works', (t) => {
  const f = fixture(t, { config: 'version: 0.1.0\n' });
  f.office(0, 'board');
  f.office(0, 'claim', id);
});

test('validate reports both schemas', (t) => {
  const old = sandbox(t, 'good');
  old.put('.the-office/config.yml', 'version: 0.1.0\n');
  assert.ok(old.office(0, 'validate').includes('board schema 0, CLI schema 1'));
  const fresh = sandbox(t);
  fresh.office(0, 'init');
  assert.ok(fresh.office(0, 'validate').includes('board schema 1, CLI schema 1'));
});

test('inline config equals the template', (t) => {
  const s = sandbox(t);
  s.office(0, 'init');
  const version = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();
  const template = fs.readFileSync(path.join(repo, 'templates/config.yml.tmpl'), 'utf8');
  assert.ok(template.includes('{{VERSION}}'));
  assert.equal(fs.readFileSync(s.file('.the-office/config.yml'), 'utf8'), template.replaceAll('{{VERSION}}', version));
});

/* ------------------------------------------------------------------ *
 * S4 - the log is validated and merges cleanly
 * ------------------------------------------------------------------ */

const AT = '2026-01-01T00:00:00.000Z';
const ev = (event, extra = {}) => JSON.stringify({ v: 1, at: AT, event, task: id, feature: 'sample', outcome: 'ok', ...extra });
// The eight task events of the transition table, by name.
const TASK_EVENTS = {
  claim: ev('claim'), check: ev('check'), scope: ev('scope'), review: ev('review'),
  'retry:ok': ev('retry'), 'retry:exhausted': ev('retry', { outcome: 'exhausted' }),
  done: ev('done'), block: ev('block'),
};

test('validate rejects malformed log lines', (t) => {
  for (const bad of ['not json', '[1]', '{"v":1}']) {
    const s = sandbox(t, 'good');
    s.put(LOG, `${ev('claim')}\n${bad}\n`);
    assert.ok(s.office(1, 'validate').includes('events.jsonl:2'), bad);
  }
});

test('validate enforces the transition table', (t) => {
  const enter = { 'in-progress': 'claim', review: 'review', blocked: 'block', completed: 'done' };
  const legal = {
    'in-progress': ['check', 'scope', 'review', 'block'],
    review: ['check', 'scope', 'retry:ok', 'retry:exhausted', 'done', 'block'],
    blocked: ['claim', 'block'],
    completed: [],
  };
  let cells = 0, accepted = 0;
  for (const [state, first] of Object.entries(enter)) {
    for (const [name, line] of Object.entries(TASK_EVENTS)) {
      const s = sandbox(t, 'good');
      s.put(LOG, `${TASK_EVENTS[first]}\n${line}\n`);
      const ok = legal[state].includes(name);
      const out = s.office(ok ? 0 : 1, 'validate');
      if (ok) accepted += 1; else assert.ok(out.includes('events.jsonl:2'), `${name} in ${state}: ${out}`);
      cells += 1;
    }
  }
  assert.equal(cells, 32);
  assert.equal(accepted, 12);
});

test('validate accepts a real lifecycle log', (t) => {
  const f = fixture(t);
  for (const step of lifecycleSteps(f)) step();
  assert.equal(f.lines().length, 10);
  f.office(0, 'validate');
  for (const [name, line] of Object.entries(TASK_EVENTS)) {
    const s = sandbox(t, 'good');
    s.put(LOG, `${line}\n`);
    assert.ok(s.office(0, 'validate'), name);
  }
});

test('validate skips unknown events', (t) => {
  const s = sandbox(t, 'good');
  s.put(LOG, `${ev('claim')}\n${ev('review')}\n`);
  s.office(0, 'validate');
  s.put(LOG, `${ev('claim')}\n{"v":1,"at":"2026-01-01T00:00:00.000Z","event":"run_start","task":"sample/task-01","feature":"sample","outcome":"ok"}\n${ev('review')}\n`);
  s.office(0, 'validate');
});

test('init prepares the log and gitattributes', (t) => {
  const count = (s) => fs.readFileSync(s.file('.gitattributes'), 'utf8').split('\n').filter((l) => l === UNION).length;

  const absent = sandbox(t);
  absent.office(0, 'init');
  assert.equal(fs.statSync(absent.file(LOG)).size, 0);
  assert.equal(count(absent), 1);

  absent.put(LOG, `${ev('claim')}\n`);
  absent.office(0, 'init', '--force');
  assert.equal(absent.log(), `${ev('claim')}\n`);
  assert.equal(count(absent), 1);

  const present = sandbox(t);
  present.put('.gitattributes', '*.png binary\n');
  present.office(0, 'init');
  const attrs = fs.readFileSync(present.file('.gitattributes'), 'utf8').split('\n');
  assert.ok(attrs.includes('*.png binary'));
  assert.equal(count(present), 1);
  present.office(0, 'init', '--force');
  assert.equal(count(present), 1);
});

test('office.mjs imports only node modules', () => {
  const source = fs.readFileSync(cli, 'utf8');
  const specifiers = [
    ...[...source.matchAll(/^\s*import\s[^'"]*?['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
  ];
  assert.ok(specifiers.length >= 5, 'found the import block');
  for (const spec of specifiers) assert.ok(spec.startsWith('node:'), `import of ${spec}`);
});
