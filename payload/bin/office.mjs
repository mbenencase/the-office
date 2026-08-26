#!/usr/bin/env node
/**
 * office — the deterministic core of the-office.
 *
 * Every command in this file is pure computation: no model is involved, no
 * network call is made, and identical inputs always produce identical output.
 * Anything requiring judgement belongs to an agent, not here.
 *
 * Zero dependencies by design — Claude Code guarantees Node, and nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.0';

const STATUSES = ['pending', 'in-progress', 'review', 'blocked', 'completed'];
const TIERS = ['fast', 'standard', 'deep'];
const REQUIRED = ['id', 'task_no', 'status', 'tier', 'checks', 'dod'];

/* ------------------------------------------------------------------ *
 * YAML subset — enough for frontmatter and config, nothing more.
 * ------------------------------------------------------------------ */

const indentOf = (l) => l.match(/^ */)[0].length;

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function scalar(s) {
  s = s.trim();
  if (s === '') return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function splitInline(s) {
  const out = [];
  let buf = '', q = null;
  for (const c of s) {
    if (q) { buf += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; buf += c; continue; }
    if (c === ',') { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function parseList(lines, i, indent) {
  const out = [];
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) { i++; continue; }
    if (indentOf(raw) < indent) break;
    const m = /^\s*-\s*(.*)$/.exec(raw);
    if (!m) break;
    out.push(scalar(stripComment(m[1])));
    i++;
  }
  return [out, i];
}

function parseMap(lines, i, indent) {
  const out = {};
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) { i++; continue; }
    const ind = indentOf(raw);
    if (ind < indent) break;
    if (ind > indent) { i++; continue; }

    const m = /^\s*([A-Za-z_][\w.-]*):\s*(.*)$/.exec(raw);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = stripComment(m[2]).trim();

    if (rest === '|' || rest === '|-' || rest === '>' || rest === '>-') {
      const buf = [];
      const bi = indent + 2;
      i++;
      while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) >= bi)) {
        buf.push(lines[i].slice(bi));
        i++;
      }
      while (buf.length && buf[buf.length - 1].trim() === '') buf.pop();
      out[key] = buf.join('\n');
      continue;
    }

    if (rest === '') {
      let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || /^\s*#/.test(lines[j]))) j++;
      if (j < lines.length && indentOf(lines[j]) > indent) {
        if (/^\s*-/.test(lines[j])) {
          const [list, ni] = parseList(lines, j, indentOf(lines[j]));
          out[key] = list; i = ni; continue;
        }
        const [map, ni] = parseMap(lines, j, indentOf(lines[j]));
        out[key] = map; i = ni; continue;
      }
      out[key] = [];
      i++; continue;
    }

    if (rest.startsWith('[')) {
      const inner = rest.slice(1, rest.lastIndexOf(']'));
      out[key] = inner.trim() === '' ? [] : splitInline(inner).map(scalar);
      i++; continue;
    }

    out[key] = scalar(rest);
    i++;
  }
  return [out, i];
}

const parseYaml = (lines) => parseMap(lines, 0, 0)[0];

function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return { fmLines: lines.slice(1, i), bodyLines: lines.slice(i + 1), endIndex: i };
    }
  }
  return null;
}

/**
 * Surgical single-key rewrite. Deliberately not a full re-serialize — a
 * round-trip through a hand-rolled emitter would reformat the human-authored
 * parts of the file, and the board is meant to stay readable in a diff.
 */
function setScalar(text, key, value) {
  const lines = text.split('\n');
  const fm = splitFrontmatter(text);
  if (!fm) throw new Error('no frontmatter to update');
  const re = new RegExp(`^${key}:`);
  const rendered = `${key}: ${emit(value)}`;
  for (let i = 1; i < fm.endIndex; i++) {
    if (re.test(lines[i])) { lines[i] = rendered; return lines.join('\n'); }
  }
  lines.splice(fm.endIndex, 0, rendered);
  return lines.join('\n');
}

function emit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  if (s === '') return '""';
  if (/[:#[\]{}"'\n]|^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

/* ------------------------------------------------------------------ *
 * Repo + board access
 * ------------------------------------------------------------------ */

function findRoot(from = process.cwd()) {
  let d = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(d, '.the-office'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

function requireRoot() {
  const root = findRoot();
  if (!root) die('no .the-office/ found in this directory or any parent.\nRun `office init` first, or `/office-onboard` to bootstrap the harness.');
  return root;
}

const DEFAULT_CONFIG = {
  tiers: { fast: 'haiku', standard: 'sonnet', deep: 'opus' },
  caps: { plan_iterations: 3, review_iterations: 3 },
  gates: { after_po_clarification: true, after_plan_converges: true, before_harness_change: true },
  janitor: { recurrence_threshold: 3 },
  stacks: [],
};

function loadConfig(root) {
  const p = path.join(root, '.the-office', 'config.yml');
  if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };
  const parsed = parseYaml(fs.readFileSync(p, 'utf8').split('\n'));
  return {
    ...DEFAULT_CONFIG, ...parsed,
    tiers: { ...DEFAULT_CONFIG.tiers, ...(parsed.tiers || {}) },
    caps: { ...DEFAULT_CONFIG.caps, ...(parsed.caps || {}) },
    gates: { ...DEFAULT_CONFIG.gates, ...(parsed.gates || {}) },
    janitor: { ...DEFAULT_CONFIG.janitor, ...(parsed.janitor || {}) },
  };
}

function loadTasks(root, feature) {
  const base = path.join(root, '.the-office', 'features');
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const f of fs.readdirSync(base).sort()) {
    if (feature && f !== feature) continue;
    const dir = path.join(base, f);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!/^task-.*\.md$/.test(file)) continue;
      const p = path.join(dir, file);
      const text = fs.readFileSync(p, 'utf8');
      const fm = splitFrontmatter(text);
      const expectedId = `${f}/${file.replace(/\.md$/, '')}`;
      if (!fm) { out.push({ file: p, feature: f, expectedId, data: {}, text, broken: 'missing frontmatter' }); continue; }
      out.push({ file: p, feature: f, expectedId, data: parseYaml(fm.fmLines), text });
    }
  }
  return out;
}

const findTask = (tasks, id) =>
  tasks.find((t) => t.data.id === id) ||
  tasks.find((t) => t.expectedId === id) ||
  tasks.find((t) => t.expectedId.endsWith(`/${id}`));

function writeTask(t, text) {
  fs.writeFileSync(t.file, text);
  t.text = text;
}

function appendNote(t, line) {
  let text = t.text;
  if (!/^##\s+Notes\s*$/m.test(text)) text = text.replace(/\s*$/, '\n\n## Notes\n');
  text = text.replace(/\s*$/, `\n- ${line}\n`);
  writeTask(t, text);
}

/* ------------------------------------------------------------------ *
 * Output helpers
 * ------------------------------------------------------------------ */

const TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  dim: (s) => (TTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (TTY ? `\x1b[1m${s}\x1b[0m` : s),
  red: (s) => (TTY ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s) => (TTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (TTY ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (TTY ? `\x1b[36m${s}\x1b[0m` : s),
};

function die(msg, code = 1) {
  console.error(`${c.red('office:')} ${msg}`);
  process.exit(code);
}

function table(headers, rows) {
  const all = [headers, ...rows];
  const w = headers.map((_, i) => Math.max(...all.map((r) => String(r[i] ?? '').length)));
  const line = (r, f = (s) => s) => f(r.map((cell, i) => String(cell ?? '').padEnd(w[i])).join('  ').trimEnd());
  console.log(line(headers, c.dim));
  console.log(c.dim(w.map((n) => '-'.repeat(n)).join('  ')));
  for (const r of rows) console.log(line(r));
}

const STATUS_MARK = {
  pending: c.dim('·'), 'in-progress': c.cyan('>'), review: c.yellow('?'),
  blocked: c.red('!'), completed: c.green('x'),
};

/* ------------------------------------------------------------------ *
 * Glob matching (for scope allowlists)
 * ------------------------------------------------------------------ */

function globToRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(ch)) re += `\\${ch}`;
    else re += ch;
  }
  return new RegExp(`^${re}$`);
}

const matchesAny = (file, globs) => globs.some((g) => globToRe(g).test(file));

/* ------------------------------------------------------------------ *
 * Git helpers
 * ------------------------------------------------------------------ */

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function changedFiles(root) {
  const tracked = git(root, ['diff', '--name-only', 'HEAD']) ?? git(root, ['diff', '--name-only']) ?? '';
  const staged = git(root, ['diff', '--name-only', '--cached']) ?? '';
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard']) ?? '';
  return [...new Set([tracked, staged, untracked].join('\n').split('\n').map((s) => s.trim()).filter(Boolean))];
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

const cmds = {};

cmds.init = (argv) => {
  const root = findRoot() ?? process.cwd();
  const dir = path.join(root, '.the-office');
  if (fs.existsSync(dir) && !argv.includes('--force')) {
    die(`.the-office/ already exists at ${root}. Pass --force to overwrite config.`);
  }
  fs.mkdirSync(path.join(dir, 'features'), { recursive: true });
  const cfg = path.join(dir, 'config.yml');
  if (!fs.existsSync(cfg) || argv.includes('--force')) {
    fs.writeFileSync(cfg, `version: ${VERSION}

# Model tiers. Task files reference the tier, never a model id, so a model
# release does not invalidate every task on the board.
tiers:
  fast: haiku
  standard: sonnet
  deep: opus

# Loop bounds. Exceeding one escalates to a human rather than spinning.
caps:
  plan_iterations: 3
  review_iterations: 3

# Where a human must approve. before_harness_change is the one worth defending:
# a new hook changes every contributor's workflow.
gates:
  after_po_clarification: true
  after_plan_converges: true
  before_harness_change: true

janitor:
  recurrence_threshold: 3

# Populated by \`office audit\`.
stacks: []
`);
  }
  const findings = path.join(dir, 'findings.jsonl');
  if (!fs.existsSync(findings)) fs.writeFileSync(findings, '');
  console.log(`${c.green('initialised')} ${path.relative(process.cwd(), dir) || '.the-office'}/`);
  console.log(c.dim('next: run /office-onboard to audit the repo and propose a harness.'));
};

cmds.board = (argv) => {
  const root = requireRoot();
  const feature = argv.find((a) => !a.startsWith('-'));
  const tasks = loadTasks(root, feature);
  if (!tasks.length) { console.log(c.dim('no tasks on the board.')); return; }

  const byFeature = new Map();
  for (const t of tasks) {
    if (!byFeature.has(t.feature)) byFeature.set(t.feature, []);
    byFeature.get(t.feature).push(t);
  }
  for (const [f, list] of byFeature) {
    console.log(`\n${c.bold(f)}`);
    table(
      ['', 'TASK', 'STATUS', 'TIER', 'DEPENDS ON', 'TITLE'],
      list.map((t) => [
        STATUS_MARK[t.data.status] ?? c.red('?'),
        t.data.id ?? t.expectedId,
        t.data.status ?? c.red('MISSING'),
        t.data.tier ?? '-',
        (t.data.depends_on ?? []).join(', ') || '-',
        t.data.title ?? '',
      ]),
    );
  }
  const done = tasks.filter((t) => t.data.status === 'completed').length;
  const blocked = tasks.filter((t) => t.data.status === 'blocked').length;
  console.log(`\n${c.dim(`${done}/${tasks.length} completed`)}${blocked ? c.red(`  ${blocked} blocked`) : ''}`);
};

cmds.next = () => {
  const root = requireRoot();
  const tasks = loadTasks(root);
  const byId = new Map(tasks.map((t) => [t.data.id ?? t.expectedId, t]));
  const ready = tasks
    .filter((t) => t.data.status === 'pending')
    .filter((t) => (t.data.depends_on ?? []).every((d) => byId.get(d)?.data.status === 'completed'))
    .sort((a, b) => (a.data.task_no ?? 0) - (b.data.task_no ?? 0));

  if (!ready.length) {
    const blocked = tasks.filter((t) => t.data.status === 'blocked');
    if (blocked.length) {
      console.error(c.red('no ready task — these are blocked and need a human:'));
      for (const t of blocked) console.error(`  ${t.data.id}`);
    } else if (tasks.some((t) => ['in-progress', 'review'].includes(t.data.status))) {
      console.error(c.yellow('no ready task — work is in flight. Sequential execution: finish it first.'));
    } else {
      console.error(c.dim('no ready task — board is complete or empty.'));
    }
    process.exit(1);
  }
  console.log(ready[0].data.id ?? ready[0].expectedId);
};

function transition(id, { from, to, mutate }) {
  const root = requireRoot();
  const tasks = loadTasks(root);
  const t = findTask(tasks, id);
  if (!t) die(`no task matching "${id}".`);
  if (from && !from.includes(t.data.status)) {
    die(`task ${t.data.id} is "${t.data.status}"; expected one of: ${from.join(', ')}.`);
  }
  let text = setScalar(t.text, 'status', to);
  writeTask(t, text);
  if (mutate) mutate(t, root);
  console.log(`${c.green(to)} ${t.data.id ?? t.expectedId}`);
  return { t, root };
}

cmds.claim = (argv) => {
  const id = argv[0] ?? die('usage: office claim <task-id>');
  transition(id, {
    from: ['pending', 'blocked'],
    to: 'in-progress',
    mutate: (t) => {
      const n = (t.data.attempts ?? 0) + 1;
      writeTask(t, setScalar(t.text, 'attempts', n));
      const max = t.data.max_attempts ?? 3;
      if (n > max) {
        console.error(c.yellow(`attempt ${n} exceeds max_attempts (${max}) — escalate rather than retry.`));
      } else {
        console.log(c.dim(`attempt ${n}/${max}`));
      }
    },
  });
};

cmds.review = (argv) => {
  const id = argv[0] ?? die('usage: office review <task-id>');
  transition(id, { from: ['in-progress'], to: 'review' });
};

cmds.done = (argv) => {
  const id = argv[0] ?? die('usage: office done <task-id>');
  transition(id, {
    from: ['review', 'in-progress'],
    to: 'completed',
    mutate: (t, root) => {
      const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const commit = git(root, ['rev-parse', 'HEAD']);
      let text = t.text;
      if (branch) text = setScalar(text, 'branch', branch);
      if (commit) text = setScalar(text, 'commit', commit);
      writeTask(t, text);
      if (branch) console.log(c.dim(`branch ${branch}  commit ${(commit ?? '').slice(0, 12)}`));
    },
  });
};

cmds.block = (argv) => {
  const id = argv[0] ?? die('usage: office block <task-id> --reason "..."');
  const ri = argv.indexOf('--reason');
  const reason = ri >= 0 ? argv[ri + 1] : null;
  if (!reason) die('office block requires --reason "..." — a blocked task with no reason is unactionable.');
  const { t } = transition(id, { to: 'blocked' });
  appendNote(t, `**blocked:** ${reason}`);
  console.error(c.yellow('escalated to a human. Do not continue this task.'));
};

cmds.check = (argv) => {
  const root = requireRoot();
  const id = argv[0] ?? die('usage: office check <task-id>');
  const t = findTask(loadTasks(root), id);
  if (!t) die(`no task matching "${id}".`);
  const checks = t.data.checks ?? [];
  if (!checks.length) die(`task ${t.data.id} has no checks. An unverifiable task is not a task.`);

  console.log(c.dim(`running ${checks.length} check(s) for ${t.data.id}\n`));
  for (const [i, cmd] of checks.entries()) {
    console.log(c.bold(`[${i + 1}/${checks.length}] ${cmd}`));
    const r = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`\n${c.red('FAIL')} ${cmd} (exit ${r.status})`);
      console.error(c.dim('definition of done not met. Fix and re-run — do not mark the task complete.'));
      process.exit(1);
    }
    console.log(c.green('  pass\n'));
  }
  console.log(c.green(`all checks pass for ${t.data.id}`));
};

cmds.scope = (argv) => {
  const root = requireRoot();
  const id = argv[0] ?? die('usage: office scope <task-id>');
  const t = findTask(loadTasks(root), id);
  if (!t) die(`no task matching "${id}".`);
  const globs = t.data.scope ?? [];
  if (!globs.length) { console.log(c.yellow(`task ${t.data.id} declares no scope — nothing to enforce.`)); return; }

  // The harness itself is never part of a task's scope: .the-office/ is board
  // state the CLI writes, and .claude/ is the installed payload. Counting either
  // makes every task in a repo with the-office installed fail its scope check.
  const HARNESS = ['.the-office/', '.claude/'];
  const files = changedFiles(root).filter((f) => !HARNESS.some((h) => f.startsWith(h)));
  const outside = files.filter((f) => !matchesAny(f, globs));
  if (!outside.length) {
    console.log(c.green(`in scope — ${files.length} changed file(s) all match ${t.data.id}`));
    return;
  }
  console.error(c.red(`${outside.length} file(s) outside the declared scope of ${t.data.id}:`));
  for (const f of outside) console.error(`  ${f}`);
  console.error(c.dim(`\nallowed: ${globs.join(', ')}`));
  console.error(c.dim('Either revert these, or widen scope: in the task file and say why in Notes.'));
  process.exit(1);
};

cmds.validate = () => {
  const root = requireRoot();
  const tasks = loadTasks(root);
  const errors = [];
  const warnings = [];
  const seen = new Map();

  for (const t of tasks) {
    const rel = path.relative(root, t.file);
    const at = (m) => errors.push(`${rel}: ${m}`);

    if (t.broken) { at(t.broken); continue; }
    for (const k of REQUIRED) {
      if (t.data[k] === undefined || t.data[k] === null || t.data[k] === '') at(`missing required key "${k}"`);
    }
    if (t.data.id && t.data.id !== t.expectedId) at(`id "${t.data.id}" does not match its path (expected "${t.expectedId}")`);
    if (t.data.status && !STATUSES.includes(t.data.status)) at(`status "${t.data.status}" not one of: ${STATUSES.join(', ')}`);
    if (t.data.tier && !TIERS.includes(t.data.tier)) at(`tier "${t.data.tier}" not one of: ${TIERS.join(', ')}`);
    if (t.data.model) warnings.push(`${rel}: has a "model" key — use "tier" instead; model ids rot.`);

    const checks = t.data.checks;
    if (Array.isArray(checks) && checks.length === 0) at('checks is empty — the definition of done is not executable');
    else if (checks !== undefined && !Array.isArray(checks)) at('checks must be a list of shell commands');

    const id = t.data.id ?? t.expectedId;
    if (seen.has(id)) at(`duplicate id "${id}" (also in ${path.relative(root, seen.get(id).file)})`);
    else seen.set(id, t);

    if (t.data.max_attempts !== undefined && !(t.data.max_attempts >= 1)) at('max_attempts must be >= 1');
    if (!Array.isArray(t.data.depends_on ?? [])) at('depends_on must be a list');
    if (t.data.status === 'completed' && !t.data.commit) {
      warnings.push(`${rel}: completed but no commit recorded — use \`office done\` rather than editing by hand.`);
    }
  }

  for (const t of tasks) {
    for (const d of t.data.depends_on ?? []) {
      if (!seen.has(d)) errors.push(`${path.relative(root, t.file)}: depends_on "${d}" does not exist`);
    }
  }

  // Cycle detection over the dependency graph.
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      const at = stack.indexOf(id);
      errors.push(`dependency cycle: ${[...stack.slice(at), id].join(' -> ')}`);
      return;
    }
    state.set(id, 'open');
    stack.push(id);
    for (const d of seen.get(id)?.data.depends_on ?? []) if (seen.has(d)) visit(d);
    stack.pop();
    state.set(id, 'done');
  };
  for (const id of seen.keys()) visit(id);

  for (const w of warnings) console.error(`${c.yellow('warn')}  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`${c.red('error')} ${e}`);
    console.error(`\n${c.red(`${errors.length} error(s)`)} across ${tasks.length} task(s).`);
    process.exit(1);
  }
  console.log(c.green(`ok — ${tasks.length} task(s) valid${warnings.length ? `, ${warnings.length} warning(s)` : ''}`));
};

/* ------------------------------------------------------------------ *
 * audit — the computational half of harness assessment
 * ------------------------------------------------------------------ */

const STACK_MARKERS = {
  python: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'],
  typescript: ['package.json'],
  go: ['go.mod'],
  rust: ['Cargo.toml'],
};

const SENSOR_PROBES = {
  python: [
    { id: 'formatter', label: 'ruff format / black', files: ['ruff.toml', '.ruff.toml'], inFile: ['pyproject.toml', /\[tool\.(ruff|black)\]/] },
    { id: 'linter', label: 'ruff / flake8', inFile: ['pyproject.toml', /\[tool\.(ruff|flake8)\]/], files: ['.flake8', 'ruff.toml'] },
    { id: 'types', label: 'mypy / pyright', files: ['mypy.ini', 'pyrightconfig.json'], inFile: ['pyproject.toml', /\[tool\.(mypy|pyright)\]/] },
    { id: 'tests', label: 'pytest', files: ['pytest.ini', 'tox.ini'], inFile: ['pyproject.toml', /\[tool\.pytest/], dirs: ['tests', 'test'] },
    { id: 'coverage', label: 'coverage threshold', files: ['.coveragerc'], inFile: ['pyproject.toml', /\[tool\.coverage/] },
  ],
  typescript: [
    { id: 'formatter', label: 'prettier / biome', files: ['.prettierrc', '.prettierrc.json', 'prettier.config.js', 'biome.json'] },
    { id: 'linter', label: 'eslint / biome', files: ['eslint.config.js', 'eslint.config.mjs', '.eslintrc', '.eslintrc.json', '.eslintrc.cjs', 'biome.json'] },
    { id: 'types', label: 'typescript', files: ['tsconfig.json'] },
    { id: 'tests', label: 'vitest / jest', files: ['vitest.config.ts', 'vitest.config.js', 'jest.config.js', 'jest.config.ts'], inFile: ['package.json', /"(vitest|jest)"/] },
    { id: 'coverage', label: 'coverage threshold', inFile: ['vitest.config.ts', /thresholds?/] },
  ],
  go: [
    { id: 'linter', label: 'golangci-lint', files: ['.golangci.yml', '.golangci.yaml', '.golangci.toml'] },
    { id: 'types', label: 'go build (inherent)', always: true },
    { id: 'tests', label: 'go test', glob: /_test\.go$/ },
    { id: 'formatter', label: 'gofmt (inherent)', always: true },
  ],
  rust: [
    { id: 'linter', label: 'clippy', files: ['clippy.toml', '.clippy.toml'], inFile: ['Cargo.toml', /\[lints/] },
    { id: 'types', label: 'rustc (inherent)', always: true },
    { id: 'formatter', label: 'rustfmt', files: ['rustfmt.toml', '.rustfmt.toml'], always: true },
    { id: 'tests', label: 'cargo test', dirs: ['tests'], glob: /#\[test\]/ },
  ],
};

const UNIVERSAL_PROBES = [
  // Stack-specific test probes miss a repo whose suite is a shell script or a
  // Makefile target. Found by onboarding the-office with its own audit.
  { id: 'tests', label: 'test entrypoint', files: ['tests/run.sh', 'test.sh', 'Makefile', 'justfile', 'Taskfile.yml'], inFile: ['package.json', /"scripts"[\s\S]*"test"/] },
  { id: 'pre-commit-hook', label: 'pre-commit / lefthook / husky', files: ['.pre-commit-config.yaml', 'lefthook.yml', '.husky', '.githooks'] },
  { id: 'ci', label: 'CI pipeline', dirs: ['.github/workflows', '.gitlab-ci.yml', '.circleci'] },
  { id: 'guides', label: 'CLAUDE.md / AGENTS.md', files: ['CLAUDE.md', 'AGENTS.md'] },
  { id: 'editor-config', label: 'editorconfig', files: ['.editorconfig'] },
];

function probe(root, p) {
  const has = (rel) => fs.existsSync(path.join(root, rel));
  if (p.files?.some(has)) return true;
  if (p.dirs?.some(has)) return true;
  if (p.inFile) {
    const [file, re] = p.inFile;
    if (has(file)) { try { if (re.test(fs.readFileSync(path.join(root, file), 'utf8'))) return true; } catch { /* unreadable */ } }
  }
  if (p.glob) {
    const hit = walk(root, 4).some((f) => p.glob.test(f));
    if (hit) return true;
  }
  return !!p.always;
}

function walk(root, maxDepth) {
  const skip = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.venv', 'venv', '__pycache__', 'vendor', '.the-office']);
  const out = [];
  const rec = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) rec(full, depth + 1);
      else out.push(path.relative(root, full));
    }
  };
  rec(root, 0);
  return out;
}

function scoreHarnessability(root, stacks, sensors) {
  const has = (rel) => fs.existsSync(path.join(root, rel));
  const present = new Set(sensors.filter((s) => s.present).map((s) => s.id));

  // Typing strength — how much a compiler can prove before a test runs.
  let typing = 0;
  if (stacks.includes('rust') || stacks.includes('go')) typing = 25;
  else if (stacks.includes('typescript')) {
    typing = has('tsconfig.json') ? 15 : 5;
    try {
      if (/"strict"\s*:\s*true/.test(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'))) typing = 25;
    } catch { /* no tsconfig */ }
  } else if (stacks.includes('python')) typing = present.has('types') ? 18 : 6;

  // Boundary clarity — proxied by top-level source organisation.
  const files = walk(root, 3);
  const topDirs = new Set(files.map((f) => f.split('/')[0]).filter((d) => !d.includes('.')));
  const boundaries = Math.min(20, 6 + Math.min(topDirs.size, 7) * 2);

  const tests = present.has('tests') ? 25 : 0;   // any probe with id 'tests', stack or universal
  const build = (has('package-lock.json') || has('pnpm-lock.yaml') || has('yarn.lock') ||
                 has('poetry.lock') || has('uv.lock') || has('Cargo.lock') || has('go.sum')) ? 15 : 4;
  const controls = Math.round((present.size / Math.max(sensors.length, 1)) * 15);

  const total = typing + boundaries + tests + build + controls;
  return {
    total,
    band: total >= 75 ? 'high' : total >= 45 ? 'medium' : 'low',
    components: { typing, boundaries, tests, build, controls },
    max: { typing: 25, boundaries: 20, tests: 25, build: 15, controls: 15 },
  };
}

cmds.audit = (argv) => {
  const root = findRoot() ?? process.cwd();
  const stacks = Object.entries(STACK_MARKERS)
    .filter(([, markers]) => markers.some((m) => fs.existsSync(path.join(root, m))))
    .map(([s]) => s);

  // package.json without tsconfig is JS, not TS — still the typescript pack.
  const sensors = [];
  for (const s of stacks) {
    for (const p of SENSOR_PROBES[s] ?? []) {
      sensors.push({ stack: s, id: p.id, label: p.label, present: probe(root, p) });
    }
  }
  for (const p of UNIVERSAL_PROBES) {
    sensors.push({ stack: 'universal', id: p.id, label: p.label, present: probe(root, p) });
  }

  const score = scoreHarnessability(root, stacks, sensors);
  const isGreenfield = (git(root, ['rev-list', '--count', 'HEAD']) ?? '0') === '0' || walk(root, 3).length < 20;

  const report = {
    version: VERSION,
    root,
    class: isGreenfield ? 'greenfield' : 'legacy',
    stacks,
    harnessability: score,
    sensors,
    missing: sensors.filter((s) => !s.present).map((s) => `${s.stack}:${s.id}`),
  };

  if (argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); return; }

  console.log(`\n${c.bold('harness audit')}  ${c.dim(root)}`);
  console.log(`${c.dim('class')}    ${report.class}`);
  console.log(`${c.dim('stacks')}   ${stacks.join(', ') || c.yellow('none detected')}`);
  console.log(`${c.dim('score')}    ${score.total}/100 (${score.band})`);
  console.log(c.dim(`         typing ${score.components.typing}/25  boundaries ${score.components.boundaries}/20  tests ${score.components.tests}/25  build ${score.components.build}/15  controls ${score.components.controls}/15`));
  console.log('');
  table(['', 'STACK', 'CONTROL', 'DETECTED AS'],
    sensors.map((s) => [s.present ? c.green('x') : c.red('·'), s.stack, s.id, s.label]));
  console.log(`\n${c.dim('This is the computational half only. Boundary and convention findings need the Office Manager.')}`);
};

/* ------------------------------------------------------------------ *
 * packs — the installable control catalogue
 * ------------------------------------------------------------------ */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Installed layout is .claude/office/{bin,packs}; the dev repo is payload/bin + packs/. */
function packsDir() {
  for (const rel of ['../packs', '../../packs']) {
    const d = path.resolve(HERE, rel);
    if (fs.existsSync(d)) return d;
  }
  return null;
}

function loadPack(stack) {
  const dir = packsDir();
  if (!dir) die('no packs directory found next to office.mjs.');
  const p = path.join(dir, stack, 'pack.json');
  if (!fs.existsSync(p)) die(`no pack for stack "${stack}". Available: ${fs.readdirSync(dir).join(', ')}`);
  return { ...JSON.parse(fs.readFileSync(p, 'utf8')), dir: path.join(dir, stack) };
}

cmds.pack = (argv) => {
  const dir = packsDir();
  const sub = argv[0];

  if (!sub || sub === 'list') {
    const stacks = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'pack.json')));
    table(['STACK', 'CONTROLS', 'DETECTED BY'], stacks.map((s) => {
      const p = loadPack(s);
      return [s, p.controls.length, (p.detect ?? []).join(', ')];
    }));
    return;
  }

  if (sub === 'show') {
    const stack = argv[1] ?? die('usage: office pack show <stack> [--json]');
    const pack = loadPack(stack);
    if (argv.includes('--json')) { console.log(JSON.stringify(pack, null, 2)); return; }

    // Strangler ordering: cheap high-signal controls first. This ordering is
    // the difference between a legacy harness that survives and one that gets
    // switched off by the first person who hits a wall of errors.
    const ordered = [...pack.controls].sort((a, b) => (a.legacy_order ?? 99) - (b.legacy_order ?? 99));
    console.log(`\n${c.bold(stack)} pack ${c.dim(pack.dir)}`);
    console.log(c.dim('install in this order on a legacy repo:\n'));
    table(['#', 'CONTROL', 'CELL', 'COST', 'CHECK'],
      ordered.map((k, i) => [i, k.id, k.cell.replace('computational-', 'comp-').replace('inferential-', 'inf-'), k.cost, k.check ?? '-']));
    console.log('');
    for (const k of ordered) {
      if (!k.note) continue;
      console.log(`${c.cyan(k.id)} ${c.dim(`— ${(k.files ?? []).join(', ') || 'no files'}`)}`);
      console.log(`  ${k.note}\n`);
    }
    return;
  }

  if (sub === 'files') {
    const stack = argv[1] ?? die('usage: office pack files <stack> [control]');
    const control = argv[2];
    const pack = loadPack(stack);
    for (const k of pack.controls) {
      if (control && k.id !== control) continue;
      for (const f of k.files ?? []) console.log(path.join(pack.dir, f));
    }
    return;
  }

  die(`unknown subcommand "${sub}". Try: list, show, files.`);
};

/* ------------------------------------------------------------------ *
 * findings — the ledger the steering loop reads
 * ------------------------------------------------------------------ */

function ledgerPath(root) { return path.join(root, '.the-office', 'findings.jsonl'); }

function readLedger(root) {
  const p = ledgerPath(root);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

cmds.findings = (argv) => {
  const root = requireRoot();
  const sub = argv[0];

  if (sub === 'add') {
    const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
    const klass = flag('class');
    if (!klass) die('usage: office findings add --class <slug> --task <id> [--lens <maintainability|architecture|behaviour>] [--note "..."]\n\nThe class is what makes recurrence detectable — reuse an existing slug when the defect is the same kind.');
    const entry = {
      class: klass,
      task: flag('task'),
      lens: flag('lens') ?? 'maintainability',
      severity: flag('severity') ?? 'normal',
      note: flag('note') ?? '',
      seq: readLedger(root).length + 1,
    };
    fs.appendFileSync(ledgerPath(root), `${JSON.stringify(entry)}\n`);
    console.log(`${c.green('logged')} ${klass} ${c.dim(`(#${entry.seq})`)}`);
    const count = readLedger(root).filter((f) => f.class === klass).length;
    const threshold = loadConfig(root).janitor.recurrence_threshold;
    if (count >= threshold) {
      console.log(c.yellow(`\n"${klass}" has now recurred ${count}x (threshold ${threshold}).`));
      console.log(c.yellow('Hand this to the Janitor: a computational control should be catching it, not a reviewer.'));
    }
    return;
  }

  if (sub === 'recur') {
    const threshold = loadConfig(root).janitor.recurrence_threshold;
    const counts = new Map();
    for (const f of readLedger(root)) counts.set(f.class, (counts.get(f.class) ?? 0) + 1);
    const over = [...counts.entries()].filter(([, n]) => n >= threshold).sort((a, b) => b[1] - a[1]);
    if (!over.length) { console.log(c.dim(`no finding class has reached the recurrence threshold (${threshold}).`)); process.exit(1); }
    table(['COUNT', 'CLASS', 'LENSES'], over.map(([k, n]) => [
      n, k, [...new Set(readLedger(root).filter((f) => f.class === k).map((f) => f.lens))].join(', '),
    ]));
    console.log(c.dim('\nEach of these should become a computational control.'));
    return;
  }

  if (sub === 'list' || !sub) {
    const all = readLedger(root);
    if (!all.length) { console.log(c.dim('ledger is empty.')); return; }
    table(['#', 'CLASS', 'LENS', 'TASK', 'NOTE'],
      all.map((f) => [f.seq, f.class, f.lens, f.task ?? '-', (f.note ?? '').slice(0, 56)]));
    return;
  }
  die(`unknown subcommand "${sub}". Try: add, recur, list.`);
};

/* ------------------------------------------------------------------ *
 * scaffolding
 * ------------------------------------------------------------------ */

cmds.feature = (argv) => {
  const root = requireRoot();
  if (argv[0] !== 'new') die('usage: office feature new <slug> [--title "..."]');
  const slug = argv[1] ?? die('usage: office feature new <slug>');
  const ti = argv.indexOf('--title');
  const title = ti >= 0 ? argv[ti + 1] : slug;
  const dir = path.join(root, '.the-office', 'features', slug);
  if (fs.existsSync(dir)) die(`feature "${slug}" already exists.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'overview.md'), `# ${title}

## Request
<!-- The user's request, as clarified by the Product Owner. -->

## Understanding
<!-- What the Product Owner confirmed at Gate 1. -->

## Out of scope
<!-- Named explicitly, so the Planner does not quietly widen the work. -->

## Harness impact
<!-- Which controls this feature adds or relies on. -->
`);
  console.log(`${c.green('created')} .the-office/features/${slug}/`);
};

cmds.task = (argv) => {
  const root = requireRoot();
  if (argv[0] !== 'new') die('usage: office task new <feature> --title "..." [--tier standard]');
  const feature = argv[1] ?? die('usage: office task new <feature> --title "..."');
  const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const dir = path.join(root, '.the-office', 'features', feature);
  if (!fs.existsSync(dir)) die(`no feature "${feature}". Run: office feature new ${feature}`);

  const existing = fs.readdirSync(dir).filter((f) => /^task-\d+\.md$/.test(f));
  const no = existing.length + 1;
  const name = `task-${String(no).padStart(2, '0')}`;
  const title = flag('title', 'untitled');

  fs.writeFileSync(path.join(dir, `${name}.md`), `---
id: ${feature}/${name}
task_no: ${no}
title: ${title}
depends_on: []
status: pending
tier: ${flag('tier', 'standard')}
scope: []
checks: []
sensors_added: []
dod: |
  TODO — replace with the observable behaviour that proves this task is done.
attempts: 0
max_attempts: ${flag('max-attempts', '3')}
branch: null
commit: null
---

## Context

## Approach

## Notes
`);
  console.log(`${c.green('created')} .the-office/features/${feature}/${name}.md`);
  console.log(c.yellow('checks is empty — office validate will reject this until the DoD is executable.'));
};

cmds.version = () => console.log(VERSION);

cmds.help = () => {
  console.log(`${c.bold('office')} ${c.dim(VERSION)} — deterministic core for the-office

${c.dim('board')}
  init [--force]              scaffold .the-office/ in this repo
  board [feature]             render the kanban
  next                        print the next ready task id (exit 1 if none)
  validate                    schema, duplicate ids, orphan deps, cycles

${c.dim('lifecycle')}
  claim <id>                  pending|blocked -> in-progress, increments attempts
  review <id>                 in-progress -> review
  done <id>                   -> completed, records branch + commit from git
  block <id> --reason "..."   -> blocked, escalates to a human

${c.dim('verification')}
  check <id>                  run the task's checks; exit on first failure
  scope <id>                  assert the working diff stays inside scope globs

${c.dim('harness')}
  audit [--json]              detect stacks, existing controls, harnessability
  pack list                   available sensor packs
  pack show <stack>           controls in strangler order, with install notes
  pack files <stack> [ctrl]   absolute paths of the files a control installs
  findings add --class <slug> --task <id> [--lens L] [--note "..."]
  findings recur              classes at or over the recurrence threshold
  findings list               the whole ledger

${c.dim('scaffolding')}
  feature new <slug> [--title "..."]
  task new <feature> --title "..." [--tier fast|standard|deep]

${c.dim('Nothing here uses a model. If a decision needs judgement, it belongs to an agent.')}`);
};

/* ------------------------------------------------------------------ */

const [, , cmd = 'help', ...rest] = process.argv;
const handler = cmds[cmd] ?? (['--version', '-v'].includes(cmd) ? cmds.version : null)
  ?? (['--help', '-h'].includes(cmd) ? cmds.help : null);
if (!handler) die(`unknown command "${cmd}". Run \`office help\`.`);
try {
  handler(rest);
} catch (err) {
  die(err.message);
}
