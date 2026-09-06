import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'payload/bin/office.mjs');
const id = 'sample/task-01';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(repo, 'tests/fixtures/good/.the-office'), path.join(root, '.the-office'), { recursive: true });
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const git = (...args) => {
    const r = run('git', args);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const office = (want, ...args) => {
    const r = run(process.execPath, [cli, ...args]);
    assert.equal(r.status, want, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    return r.stdout + r.stderr;
  };
  const file = (name) => path.join(root, name);
  const taskFile = (task = id) => file(`.the-office/features/${task}.md`);
  const edit = (old, value, task = id) => {
    const f = taskFile(task);
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(text.includes(old), `missing ${old}`);
    fs.writeFileSync(f, text.replace(old, value));
  };
  const put = (name, text) => { fs.mkdirSync(path.dirname(file(name)), { recursive: true }); fs.writeFileSync(file(name), text); };
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  put('src/a.txt', 'baseline');
  git('add', '.'); git('commit', '-qm', 'baseline');
  const base = git('rev-parse', 'HEAD');
  const commit = () => { git('add', '.'); git('commit', '-qm', 'task implementation'); };
  const verify = () => { office(0, 'check', id); office(0, 'scope', id); };
  return { root, file, office, git, edit, put, taskFile, base, commit, verify };
}

test('completion requires reviewed, current check and scope evidence for committed code', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  assert.match(fs.readFileSync(f.taskFile(), 'utf8'), new RegExp(`base_commit: ${f.base}`));
  f.office(1, 'done', id);
  f.office(1, 'review', id);
  f.edit('echo ok', 'exit 1');
  f.office(1, 'check', id);
  f.office(1, 'review', id);
  f.edit('exit 1', 'echo ok');
  f.put('src/a.txt', 'implementation');
  f.verify();
  f.office(1, 'review', id); // evidence for uncommitted code is insufficient
  f.commit();
  f.office(1, 'review', id); // commit changes the attested SHA
  f.office(0, 'check', id);
  f.office(1, 'review', id); // scope still belongs to the old SHA
  f.office(0, 'scope', id);
  f.office(0, 'review', id);
  f.office(0, 'done', id);
  assert.match(fs.readFileSync(f.taskFile(), 'utf8'), new RegExp(`commit: ${f.git('rev-parse', 'HEAD')}`));
  f.office(1, 'block', id, '--reason', 'cannot reopen completed work');
  assert.match(f.office(0, 'next'), /sample\/task-02/);
});

test('claim enforces dependencies, one task in flight, and a hard retry budget', (t) => {
  const f = fixture(t);
  f.office(1, 'claim', 'sample/task-02');
  f.edit('depends_on: ["sample/task-01"]', 'depends_on: []', 'sample/task-02');
  f.office(0, 'claim', id);
  f.office(1, 'next');
  f.office(1, 'claim', 'sample/task-02');
  for (let attempt = 1; attempt <= 3; attempt++) {
    f.verify(); f.office(0, 'review', id);
    f.office(attempt === 3 ? 1 : 0, 'retry', id, '--reason', `finding ${attempt}`);
  }
  const blocked = fs.readFileSync(f.taskFile(), 'utf8');
  assert.match(blocked, /status: blocked/);
  assert.match(blocked, /attempts: 3/);
  f.office(1, 'claim', id);
  assert.equal(fs.readFileSync(f.taskFile(), 'utf8'), blocked);
  f.edit('max_attempts: 3', 'max_attempts: 4');
  f.office(0, 'claim', id);
  f.office(1, 'review', id);
  assert.match(fs.readFileSync(f.taskFile(), 'utf8'), new RegExp(`base_commit: ${f.base}`));
});

test('scope detects committed out-of-scope changes, deletes, renames, and installed harness changes', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  f.git('mv', 'src/a.txt', 'outside.txt');
  f.commit();
  assert.match(f.office(1, 'scope', id), /outside.txt/);
  f.git('mv', 'outside.txt', 'src/a.txt'); f.commit();
  f.put('.claude/agents/office-swe.md', 'changed rules'); f.commit();
  assert.match(f.office(1, 'scope', id), /\.claude\/agents/);
  f.git('rm', '.claude/agents/office-swe.md'); f.commit();
  f.git('rm', 'src/a.txt'); f.commit();
  assert.match(f.office(0, 'scope', id), /1 changed file/);
});

test('changes to contract, worktree, untracked code, harness, or HEAD invalidate evidence', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id); f.verify(); f.office(0, 'review', id);
  f.edit('scope:\n  - src/**', 'scope:\n  - **');
  f.office(1, 'done', id); f.verify();
  f.edit('Observable behaviour', 'Different behaviour');
  f.office(1, 'done', id); f.verify();
  f.edit('echo ok', 'echo changed');
  f.office(1, 'done', id); f.verify();
  f.put('new.txt', 'untracked'); f.office(1, 'done', id);
  fs.unlinkSync(f.file('new.txt'));
  f.put('src/a.txt', 'dirty'); f.office(1, 'done', id);
  f.git('checkout', '--', 'src/a.txt');
  f.put('.cursor/agents/custom.md', 'new control'); f.office(1, 'done', id);
  fs.rmSync(f.file('.cursor'), { recursive: true });
  f.git('commit', '--allow-empty', '-qm', 'different HEAD');
  f.office(1, 'done', id); f.verify(); f.office(0, 'done', id);
});

test('failed rerun removes previous passing evidence even with the same code', (t) => {
  const f = fixture(t);
  f.put('.gitignore', 'fail.flag\n'); f.commit();
  f.edit('echo ok', 'test ! -f fail.flag');
  f.office(0, 'claim', id); f.verify();
  f.put('fail.flag', 'environment failure');
  f.office(1, 'check', id); fs.unlinkSync(f.file('fail.flag'));
  f.office(1, 'review', id);
  f.office(0, 'check', id); f.office(0, 'review', id);
});

test('checks that modify their own contract or source cannot attest themselves', (t) => {
  const f = fixture(t);
  f.edit('echo ok', 'echo changed > src/a.txt');
  f.office(0, 'claim', id);
  assert.match(f.office(1, 'check', id), /changed code or contract/);
  f.commit(); f.office(1, 'review', id);
});

test('contract edits made by a passing check are detected even though board files are excluded', (t) => {
  const f = fixture(t);
  f.put('mutate.mjs', `import fs from 'node:fs';
const file = '.the-office/features/sample/task-01.md';
fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Observable behaviour', 'Changed acceptance'));`);
  f.commit(); f.edit('echo ok', 'node mutate.mjs');
  f.office(0, 'claim', id);
  assert.match(f.office(1, 'check', id), /changed code or contract/);
  f.office(1, 'review', id);
});

test('empty scope and staged-only out-of-scope changes fail closed', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  f.edit('scope:\n  - src/**', 'scope: []');
  f.office(1, 'scope', id);
  f.edit('scope: []', 'scope:\n  - src/**');
  f.put('outside.txt', 'index only'); f.git('add', 'outside.txt');
  fs.unlinkSync(f.file('outside.txt'));
  assert.match(f.office(1, 'scope', id), /outside.txt/);
});

test('claim fails on dirty source and verification fails outside Git or with a missing base', (t) => {
  const f = fixture(t);
  f.put('src/a.txt', 'dirty'); f.office(1, 'claim', id);
  assert.match(fs.readFileSync(f.taskFile(), 'utf8'), /status: pending/);
  f.git('checkout', '--', 'src/a.txt'); f.office(0, 'claim', id);
  f.edit(`base_commit: ${f.base}`, 'base_commit: null');
  f.office(1, 'check', id); f.office(1, 'scope', id);
  fs.rmSync(f.file('.git'), { recursive: true });
  f.office(1, 'done', id);
});

test('NUL-separated path handling preserves spaces and newlines in scope failures', (t) => {
  const f = fixture(t);
  f.office(0, 'claim', id);
  f.put(' outside\nfile.txt ', 'outside');
  assert.ok(f.office(1, 'scope', id).includes(' outside\nfile.txt '));
});

test('a running check holds the execution lock against competing lifecycle commands', async (t) => {
  const f = fixture(t);
  f.put('wait.mjs', 'setTimeout(() => {}, 1500);'); f.commit();
  f.edit('echo ok', 'node wait.mjs');
  f.office(0, 'claim', id);
  const child = spawn(process.execPath, [cli, 'check', id], { cwd: f.root, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); });
  assert.match(f.office(1, 'block', id, '--reason', 'competing command'), /another command owns/);
  assert.equal(await exited, 0);
  assert.ok(!fs.existsSync(f.file('.the-office/execution.lock')));
});
