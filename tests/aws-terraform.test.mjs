import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = 'office-aws-terraform/scripts/plan-summary.mjs';
const script = path.join(repo, 'payload/skills', relative);
const summarize = (plan, entry = script) => spawnSync(process.execPath, [entry, '-'], { input: JSON.stringify(plan), encoding: 'utf8' });
const resource = (address, actions, rest = {}) => ({ address, mode: 'managed', type: 'aws_db_instance', change: { actions, ...rest } });
const base = { format_version: '1.2', planned_values: {} };

test('summarizes replacements in both orders, updates, data reads, drift and unknowns without values', () => {
  const result = summarize({ ...base, complete: false, errored: false, resource_changes: [
    resource('aws_db_instance.first', ['delete', 'create'], { after: { password: 'SECRET_CANARY' }, after_unknown: { endpoint: true } }),
    resource('aws_db_instance.second', ['create', 'delete']),
    resource('aws_db_instance.third', ['update']),
    { ...resource('data.aws_caller_identity.current', ['read']), mode: 'data' },
  ], resource_drift: [resource('aws_db_instance.third', ['update'])], variables: { secret: { value: 'SECRET_CANARY' } }, output_changes: { password: { after: 'SECRET_CANARY' } } });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes('SECRET_CANARY'));
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.counts, { replace: 2, update: 1, read: 1 });
  assert.equal(summary.resources[0].destructive, true);
  assert.equal(summary.resources[0].has_unknown_values, true);
  assert.equal(summary.complete, false);
  assert.equal(summary.drift.length, 1);
  assert.equal(summary.output_change_count, 1);
});
test('no-op moves, imports, forgotten resources and unknown action types remain visible', () => {
  const result = summarize({ ...base, resource_changes: [
    { ...resource('aws_db_instance.new', ['no-op'], { importing: { id: 'SECRET_CANARY' } }), previous_address: 'aws_db_instance.old' },
    resource('aws_db_instance.forgotten', ['forget']),
    resource('aws_db_instance.future', ['future-action']),
  ] });
  assert.equal(result.status, 0, result.stderr);
  const { resources } = JSON.parse(result.stdout);
  assert.equal(resources[0].moved, true); assert.equal(resources[0].importing, true);
  assert.equal(resources[1].destructive, true);
  assert.deepEqual(resources[2].actions, ['future-action']);
  assert.ok(!result.stdout.includes('SECRET_CANARY'));
});
test('empty/output-only plans preserve unknown completion instead of claiming deployability', () => {
  const result = summarize(base); assert.equal(result.status, 0);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data.counts, {}); assert.equal(data.complete, null); assert.equal(data.applyable, null);
});
test('unsupported formats, state JSON and malformed changes fail without echoing input', () => {
  for (const data of [{ format_version: '2.0', planned_values: {} }, { format_version: '1.0', values: {} }, { ...base, resource_changes: [ { change: { before: 'SECRET_CANARY' } } ] }]) {
    const result = summarize(data); assert.equal(result.status, 1); assert.ok(!result.stderr.includes('SECRET_CANARY'));
  }
  const result = spawnSync(process.execPath, [script, '-'], { input: '{SECRET_CANARY', encoding: 'utf8' });
  assert.equal(result.status, 1); assert.ok(!result.stderr.includes('SECRET_CANARY'));
});
test('both runtime installs include working scripts/references; upgrade removes stale support files and uninstall preserves board', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-aws-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.the-office/features'), { recursive: true });
  fs.writeFileSync(path.join(root, '.the-office/findings.jsonl'), '');
  const install = (...args) => {
    const r = spawnSync('bash', [path.join(repo, 'install.sh'), root, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  install('--runtime', 'both');
  for (const runtime of ['claude', 'cursor']) {
    const dir = path.join(root, `.${runtime}/skills/office-aws-terraform`);
    for (const file of ['SKILL.md', 'references/security.md', 'references/costs.md', 'references/terraform-workflow.md']) assert.ok(fs.existsSync(path.join(dir, file)));
    assert.equal(summarize(base, path.join(root, `.${runtime}/skills`, relative)).status, 0);
  }
  const stale = path.join(root, '.cursor/skills/office-aws-terraform/references/removed.md');
  fs.writeFileSync(stale, 'stale'); install('--runtime', 'cursor', '--force'); assert.ok(!fs.existsSync(stale));
  install('--uninstall'); assert.ok(fs.existsSync(path.join(root, '.the-office/findings.jsonl')));
  assert.ok(!fs.existsSync(path.join(root, '.cursor/skills/office-aws-terraform')));
});
