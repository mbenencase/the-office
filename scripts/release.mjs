#!/usr/bin/env node
/**
 * Compute the next release from conventional commits, and optionally apply it.
 *
 *   node scripts/release.mjs                      # plan only, changes nothing
 *   node scripts/release.mjs --write              # write the four version files
 *   node scripts/release.mjs --write --commit --tag
 *   node scripts/release.mjs --bump minor         # override the derived level
 *
 * This is the single implementation of "what version comes next and what does
 * it contain". CI calls it and so does a human cutting one by hand -- two
 * implementations of that would drift, and the drift would only show up in a
 * published release.
 *
 * Zero dependencies, like the CLI. Unlike the CLI this is never installed into
 * a target repo; it exists only for this one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const WRITE = has('--write');
const COMMIT = has('--commit');
const TAG = has('--tag');
const FORCED = val('--bump', 'auto');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const die = (m) => { console.error(`release: ${m}`); process.exit(1); };

// Field and record separators. The git --format string uses git's own %x00
// and %x1e escapes: an embedded NUL byte in an execFileSync argument would
// truncate the argument, since argv strings are NUL-terminated.
const NUL = '\0';
const RS = '\x1e';

/* ---------------------------------------------------------------- *
 * Conventional commit parsing
 * ---------------------------------------------------------------- */

const HEADER = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:\s*(?<desc>.+)$/;

// Groups are rendered in this order.
const GROUPS = [
  { key: 'breaking', heading: 'Breaking' },
  { key: 'added', heading: 'Added' },
  { key: 'fixed', heading: 'Fixed' },
  { key: 'changed', heading: 'Changed' },
  { key: 'internal', heading: 'Internal' },
];

const GROUP_OF = {
  feat: 'added',
  fix: 'fixed',
  perf: 'changed', refactor: 'changed', revert: 'changed',
  docs: 'internal', test: 'internal', ci: 'internal',
  build: 'internal', chore: 'internal', style: 'internal',
};

function parseCommit(raw) {
  const [sha, subject, body] = raw.split(NUL);
  const m = HEADER.exec(subject ?? '');
  const breaking = /^BREAKING[ -]CHANGE:/m.test(body ?? '') || m?.groups.bang === '!';
  // Commits predating the convention still have to land somewhere sensible
  // rather than crashing the release.
  const type = m?.groups.type?.toLowerCase() ?? null;
  return {
    sha: (sha ?? '').slice(0, 7),
    type,
    scope: m?.groups.scope ?? null,
    desc: m?.groups.desc ?? subject ?? '',
    breaking,
    group: breaking ? 'breaking' : (type ? GROUP_OF[type] ?? 'changed' : 'changed'),
  };
}

function lastTag() {
  try {
    const tags = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').filter(Boolean);
    return tags[0] ?? null;
  } catch { return null; }
}

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  let out;
  try { out = git('log', range, '--no-merges', '--format=%H%x00%s%x00%b%x1e'); }
  catch { return []; }
  return out.split(RS).map((s) => s.trim()).filter(Boolean)
    .map(parseCommit)
    // A release commit describes a release; it is not part of the next one.
    .filter((c) => !(c.type === 'chore' && /^v?\d+\.\d+\.\d+/.test(c.desc)));
}

const bumpOf = (commits) =>
  commits.some((c) => c.breaking) ? 'major'
    : commits.some((c) => c.type === 'feat') ? 'minor'
      : 'patch';

function nextVersion(base, level) {
  const [ma, mi, pa] = base.replace(/^v/, '').split('.').map(Number);
  if ([ma, mi, pa].some(Number.isNaN)) die(`cannot parse base version "${base}"`);
  return level === 'major' ? `${ma + 1}.0.0`
    : level === 'minor' ? `${ma}.${mi + 1}.0`
      : `${ma}.${mi}.${pa + 1}`;
}

function renderNotes(commits) {
  const lines = [];
  for (const { key, heading } of GROUPS) {
    const items = commits.filter((c) => c.group === key);
    if (!items.length) continue;
    lines.push(`### ${heading}`, '');
    for (const c of items) {
      const scope = c.scope ? `**${c.scope}:** ` : '';
      lines.push(`- ${scope}${c.desc} (\`${c.sha}\`)`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function emitOutputs({ released, version, level }) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  const lines = [`released=${released}`];
  if (version) lines.push(`version=${version}`, `level=${level}`);
  fs.appendFileSync(out, `${lines.join('\n')}\n`);
}

/* ---------------------------------------------------------------- *
 * Plan
 * ---------------------------------------------------------------- */

const tag = lastTag();
const commits = commitsSince(tag);
const currentVersion = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
// Base off the last tag when there is one, otherwise off the VERSION file, so
// the first automated release continues the series rather than restarting it.
const base = tag ? tag.replace(/^v/, '') : currentVersion;

if (!commits.length) {
  console.log(`no releasable commits since ${tag ?? 'the beginning'} — nothing to release.`);
  emitOutputs({ released: false });
  process.exit(0);
}

const level = FORCED === 'auto' ? bumpOf(commits) : FORCED;
if (!['major', 'minor', 'patch'].includes(level)) {
  die(`--bump must be auto|major|minor|patch, got "${FORCED}"`);
}
const version = nextVersion(base, level);
const notes = renderNotes(commits);
const date = new Date().toISOString().slice(0, 10);

console.log(`since       ${tag ?? '(no tag)'}`);
console.log(`commits     ${commits.length}`);
console.log(`bump        ${level}${FORCED === 'auto' ? '' : ' (forced)'}`);
console.log(`version     ${base} -> ${version}`);
const loose = commits.filter((c) => !c.type).length;
if (loose) {
  console.log(`note        ${loose} commit(s) not in conventional format; grouped under Changed`);
}
console.log(`\n${notes}\n`);

if (!WRITE) {
  console.log('(plan only — pass --write to apply)');
  emitOutputs({ released: true, version, level });
  process.exit(0);
}

/* ---------------------------------------------------------------- *
 * Apply
 * ---------------------------------------------------------------- */

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, s) => fs.writeFileSync(path.join(ROOT, rel), s);

write('VERSION', `${version}\n`);

// Narrow patterns on purpose: a broad replace of the old version string would
// also rewrite versions inside changelog prose and pack configs.
write('package.json', read('package.json').replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`));
write('payload/bin/office.mjs', read('payload/bin/office.mjs').replace(/^const VERSION = '[^']*';$/m, `const VERSION = '${version}';`));

const MARKER = '<!-- next-release -->';
let changelog = read('CHANGELOG.md');
if (!changelog.includes(MARKER)) {
  die(`CHANGELOG.md has no ${MARKER} marker to insert beneath.`);
}
changelog = changelog.replace(MARKER, `${MARKER}\n\n## [${version}] — ${date}\n\n${notes}`);
// Link ref goes directly under the marker's block, newest first.
changelog = changelog.replace(/\n*$/, `\n[${version}]: https://github.com/mbenencase/the-office/releases/tag/v${version}\n`);
write('CHANGELOG.md', changelog);

write('RELEASE_NOTES.md', `${notes}\n`);
console.log('wrote VERSION, package.json, payload/bin/office.mjs, CHANGELOG.md, RELEASE_NOTES.md');

if (COMMIT) {
  git('add', 'VERSION', 'package.json', 'payload/bin/office.mjs', 'CHANGELOG.md');
  // [skip ci] is belt-and-braces. A push authenticated with GITHUB_TOKEN does
  // not trigger workflows, which is the primary guard against a release loop.
  git('commit', '-m', `chore(release): v${version} [skip ci]`);
  console.log(`committed chore(release): v${version}`);
}
if (TAG) {
  git('tag', '-a', `v${version}`, '-m', `v${version}`);
  console.log(`tagged v${version}`);
}

emitOutputs({ released: true, version, level });
