#!/usr/bin/env node
/**
 * Stub agent runtime for tests/run.test.mjs. `OFFICE_RUNTIME_CMD` points here,
 * so `office run` starts this instead of `claude`.
 *
 * Per invocation it appends its argv and cwd to $OFFICE_STUB_DIR/calls.jsonl,
 * performs the board transitions its scenario scripts for the role by calling
 * the real CLI (and Git), then prints one JSON object in the runtime's shape.
 *
 * The scenario is $OFFICE_STUB_DIR/scenario.json; absent means "happy feature".
 * A list is read per invocation of that role (or role + task); its last entry
 * repeats.
 *
 *   judge:    [result text, ...]
 *   po:       ['valid' | 'none' | 'invalid' | 'questions', ...]
 *   tasks:    [{ tier, depends_on: [task_no], max_attempts, checks }, ...]
 *   da:       ['approved' | 'rejected', ...]
 *   swe:      { '<task id>': ['review' | 'block', ...] }
 *   reviewer: { '<task id>': ['done' | 'retry', ...] }
 *   fail:     { '<role>': [null | 'exit3' | 'notjson' | 'is_error' | 'no_usage' | 'sleep', ...] }
 *   usage:    { '<role>': <modelUsage map> }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../payload/bin/office.mjs');
const dir = process.env.OFFICE_STUB_DIR;
if (!dir) { console.error('stub-runtime: OFFICE_STUB_DIR is not set'); process.exit(64); }

const argv = process.argv.slice(2);
const cwd = process.cwd();
const arg = (flag) => argv[argv.indexOf(flag) + 1];
const role = arg('--agent');
const prompt = arg('-p') ?? '';
const slug = /^Feature slug: (\S+)$/m.exec(prompt)?.[1];
const task = /^Task: (\S+)$/m.exec(prompt)?.[1];

const scenarioFile = path.join(dir, 'scenario.json');
const scenario = fs.existsSync(scenarioFile) ? JSON.parse(fs.readFileSync(scenarioFile, 'utf8')) : {};
const callsFile = path.join(dir, 'calls.jsonl');
const earlier = fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const nth = earlier.filter((call) => call.role === role && call.task === (task ?? null)).length;
const pick = (list, fallback) => (Array.isArray(list) && list.length ? list[Math.min(nth, list.length - 1)] : fallback);

fs.appendFileSync(callsFile, `${JSON.stringify({
  argv, cwd, role, task: task ?? null, pid: process.pid,
  run_lock: fs.existsSync(path.join(cwd, '.the-office/run.lock')),
  execution_lock: fs.existsSync(path.join(cwd, '.the-office/execution.lock')),
})}\n`);

const must = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) { console.error(`stub-runtime: ${cmd} ${args.join(' ')} failed: ${r.stdout}${r.stderr}`); process.exit(70); }
  return r.stdout;
};
const office = (...args) => must(process.execPath, [cli, ...args]);
const featureFile = (name) => path.join(cwd, '.the-office/features', name);
const rewrite = (file, edits) => {
  let text = fs.readFileSync(file, 'utf8');
  for (const [from, to] of edits) text = text.replaceAll(from, to);
  fs.writeFileSync(file, text);
};
const statusOf = (id) => /^status: (.+)$/m.exec(fs.readFileSync(featureFile(`${id}.md`), 'utf8'))[1];

const fail = pick(scenario.fail?.[role], null);
if (fail === 'sleep') await new Promise((resolve) => setTimeout(resolve, 120000));
if (fail === 'exit3') process.exit(3);
if (fail === 'notjson') { process.stdout.write('not json'); process.exit(0); }

let result = 'done';

if (role === 'office-judge') {
  result = pick(scenario.judge, 'route: feature\nspec_type: feature\nreason: more than one file\nfeature_slug: greeting');
} else if (role === 'office-product-owner') {
  const mode = pick(scenario.po, 'valid');
  const spec = featureFile(`${slug}/overview.md`);
  if (mode !== 'none' && !fs.existsSync(spec)) office('feature', 'new', slug, '--type', 'feature');
  if (mode === 'valid' || mode === 'questions') rewrite(spec, [['TODO', 'Concrete']]);
  if (mode === 'questions') rewrite(spec, [['open_questions: []', 'open_questions: ["Which locale?"]']]);
} else if (role === 'office-planner') {
  const defs = scenario.tasks ?? [{ tier: 'fast' }, { tier: 'standard', depends_on: [1] }];
  const name = (no) => `task-${String(no).padStart(2, '0')}`;
  defs.forEach((def, i) => {
    const file = featureFile(`${slug}/${name(i + 1)}.md`);
    if (fs.existsSync(file)) return;
    office('task', 'new', slug, '--title', `Task ${i + 1}`, '--tier', def.tier ?? 'standard', '--max-attempts', String(def.max_attempts ?? 3));
    rewrite(file, [
      ['requirements: []', 'requirements: [REQ-001]'],
      ['acceptance_criteria: []', 'acceptance_criteria: [AC-001]'],
      ['scope: []', 'scope: [src/**]'],
      ['checks: []', `checks: ${JSON.stringify(def.checks ?? ['echo ok'])}`],
      ['depends_on: []', `depends_on: ${JSON.stringify((def.depends_on ?? []).map((no) => `${slug}/${name(no)}`))}`],
    ]);
  });
} else if (role === 'office-devils-advocate') {
  result = `verdict: ${pick(scenario.da, 'approved')}`;
} else if (role.startsWith('office-swe')) {
  const mode = pick(scenario.swe?.[task], 'review');
  if (statusOf(task) === 'pending') office('claim', task);
  if (mode === 'block') office('block', task, '--reason', 'stub: cannot finish');
  else {
    const file = path.join(cwd, 'src', `${task.replace('/', '-')}.txt`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${task} pass ${nth + 1}\n`);
    must('git', ['add', 'src']);
    must('git', ['commit', '-qm', `${task} pass ${nth + 1}`]);
    office('check', task);
    office('scope', task);
    office('review', task);
  }
} else if (role === 'office-reviewer') {
  if (pick(scenario.reviewer?.[task], 'done') === 'retry') office('retry', task, '--reason', 'stub finding');
  else office('done', task);
}

const out = {
  type: 'result',
  is_error: fail === 'is_error',
  result,
  modelUsage: scenario.usage?.[role] ?? { 'stub-a': { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 5, cacheCreationInputTokens: 2, costUSD: 0.01 } },
};
if (fail === 'no_usage') delete out.modelUsage;
process.stdout.write(`${JSON.stringify(out)}\n`);
