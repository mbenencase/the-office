import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'payload/bin/office.mjs');
function setup(t, type = 'feature', installed = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-spec-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  for (const args of [['init', '-q'], ['config', 'user.name', 'Test'], ['config', 'user.email', 'test@example.invalid']]) assert.equal(run('git', args).status, 0);
  let executable = cli;
  if (installed) {
    const result = run('bash', [path.join(repo, 'install.sh'), root]);
    assert.equal(result.status, 0, result.stderr);
    executable = path.join(root, '.claude/office/bin/office.mjs');
  }
  const office = (want, ...args) => {
    const r = run(process.execPath, [executable, ...args]);
    assert.equal(r.status, want, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    return r.stdout.trim();
  };
  office(0, 'init');
  run('git', ['add', '.']); assert.equal(run('git', ['commit', '-qm', 'baseline']).status, 0);
  office(0, 'feature', 'new', 'sample', '--type', type);
  const spec = path.join(root, '.the-office/features/sample/overview.md');
  const task = path.join(root, '.the-office/features/sample/task-01.md');
  const edit = (file, from, to) => { const text = fs.readFileSync(file, 'utf8'); assert.ok(text.includes(from)); fs.writeFileSync(file, text.replace(from, to)); };
  const fill = () => fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replaceAll('TODO', 'Concrete'));
  const approve = () => {
    const { hash } = JSON.parse(office(0, 'spec', 'status', 'sample'));
    office(0, 'spec', 'approve', 'sample', '--hash', hash, '--by', 'test-human');
  };
  const plan = () => {
    office(0, 'task', 'new', 'sample', '--title', 'Implement requirement');
    edit(task, 'requirements: []', 'requirements: [REQ-001]');
    edit(task, 'acceptance_criteria: []', 'acceptance_criteria: [AC-001]');
    edit(task, 'scope: []', 'scope: [src/**]');
    edit(task, 'checks: []', 'checks: ["echo ok"]');
  };
  return { root, spec, task, office, fill, approve, plan, edit };
}
for (const type of ['bug', 'feature', 'refactor']) test(`${type}: template, approval, traceability, and verified lifecycle`, (t) => {
  const f = setup(t, type, type === 'refactor');
  f.office(1, 'spec', 'validate', 'sample'); f.fill();
  f.office(0, 'spec', 'validate', 'sample'); f.plan();
  f.office(0, 'validate'); f.office(0, 'spec', 'validate', 'sample', '--plan');
  f.office(1, 'claim', 'sample/task-01'); f.approve();
  f.office(0, 'claim', 'sample/task-01');
  f.office(0, 'check', 'sample/task-01'); f.office(0, 'scope', 'sample/task-01');
  f.office(0, 'review', 'sample/task-01'); f.office(0, 'done', 'sample/task-01');
  if (type === 'refactor') assert.match(fs.readFileSync(f.task, 'utf8'), /verification_mode: preservation/);
});
test('changed approved spec blocks execution; renewed approval does not reuse old evidence', (t) => {
  const f = setup(t); f.fill(); f.plan(); f.approve();
  f.office(0, 'claim', 'sample/task-01'); f.office(0, 'check', 'sample/task-01'); f.office(0, 'scope', 'sample/task-01'); f.office(0, 'review', 'sample/task-01');
  f.edit(f.spec, 'Concrete problem', 'Updated problem');
  assert.equal(JSON.parse(f.office(0, 'spec', 'status', 'sample')).status, 'stale');
  f.office(1, 'done', 'sample/task-01'); f.approve(); f.office(1, 'done', 'sample/task-01');
  f.office(0, 'check', 'sample/task-01'); f.office(0, 'scope', 'sample/task-01'); f.office(0, 'done', 'sample/task-01');
});
test('open questions and stale confirmation hashes prevent approval', (t) => {
  const f = setup(t); f.fill();
  const hash = JSON.parse(f.office(0, 'spec', 'status', 'sample')).hash;
  f.edit(f.spec, 'open_questions: []', 'open_questions: ["Which tenant?"]');
  f.office(1, 'spec', 'approve', 'sample', '--hash', hash, '--by', 'human');
  f.edit(f.spec, 'open_questions: ["Which tenant?"]', 'open_questions: []');
  f.edit(f.spec, 'Concrete problem', 'Updated problem');
  f.office(1, 'spec', 'approve', 'sample', '--hash', hash, '--by', 'human');
});
test('duplicate IDs, orphan criteria, unknown task references, and uncovered criteria fail validation', (t) => {
  const f = setup(t); f.fill(); f.plan();
  const original = fs.readFileSync(f.spec, 'utf8');
  f.edit(f.spec, '  REQ-001:', '  REQ-001: duplicate\n  REQ-001:'); f.office(1, 'spec', 'validate', 'sample');
  fs.writeFileSync(f.spec, original); f.edit(f.spec, 'requirement: REQ-001', 'requirement: REQ-999'); f.office(1, 'spec', 'validate', 'sample');
  fs.writeFileSync(f.spec, original); f.edit(f.task, '[AC-001]', '[AC-999]'); f.office(1, 'validate');
  f.edit(f.task, '[AC-999]', '[AC-001]');
  f.edit(f.spec, 'open_questions:', '  AC-002:\n    requirement: REQ-001\n    description: Another outcome\nopen_questions:');
  f.office(0, 'spec', 'validate', 'sample'); f.office(1, 'spec', 'validate', 'sample', '--plan');
});
test('required specs cannot silently downgrade to legacy overviews', (t) => {
  const f = setup(t); f.fill(); f.plan(); f.approve();
  fs.writeFileSync(f.spec, '# Legacy overview\n');
  f.office(1, 'claim', 'sample/task-01'); f.office(1, 'validate');
});
test('slug validation prevents scaffold paths escaping the feature directory', (t) => {
  const f = setup(t);
  f.office(1, 'feature', 'new', '../escape'); f.office(1, 'task', 'new', '../escape');
});
