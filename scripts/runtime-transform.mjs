#!/usr/bin/env node
/**
 * Adapt the-office payload files for a target agent runtime.
 *
 *   node scripts/runtime-transform.mjs <runtime> <kind> <src> [dst]
 *
 * runtime: claude | cursor
 * kind:    agent | skill | command
 * src:     source file path
 * dst:     optional output path (stdout when omitted)
 *
 * Claude copies verbatim. Cursor strips Claude-only frontmatter, maps model
 * aliases to inherit, sets readonly on audit-only roles, rewrites CLI paths,
 * and turns commands into slash-invoked skills.
 */

import fs from 'node:fs';

const runtime = process.argv[2];
const kind = process.argv[3];
const src = process.argv[4];
const dst = process.argv[5];

if (!runtime || !kind || !src) {
  console.error('usage: runtime-transform.mjs <claude|cursor> <agent|skill|command> <src> [dst]');
  process.exit(2);
}

const READONLY_AGENTS = new Set([
  'office-judge',
  'office-devils-advocate',
  'office-product-owner',
  'office-reviewer',
]);

const raw = fs.readFileSync(src, 'utf8');

function emit(out) {
  if (dst) fs.writeFileSync(dst, out);
  else process.stdout.write(out);
}

function splitFrontmatter(text) {
  if (!text.startsWith('---\n')) return { fm: null, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return { fm: null, body: text };
  const block = text.slice(4, end);
  const body = text.slice(end + 5);
  const data = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) data[m[1]] = m[2];
  }
  return { fm: data, body, block };
}

function joinFrontmatter(data, body) {
  const lines = Object.entries(data).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

function rewritePaths(text, rt) {
  return text.replaceAll('.claude/office', `.${rt}/office`);
}

if (runtime === 'claude') {
  emit(raw);
  process.exit(0);
}

if (runtime !== 'cursor') {
  console.error(`unknown runtime: ${runtime}`);
  process.exit(2);
}

const { fm, body } = splitFrontmatter(raw);
if (!fm) {
  emit(rewritePaths(raw, 'cursor'));
  process.exit(0);
}

if (kind === 'agent') {
  const next = { ...fm };
  delete next.tools;
  // Tier aliases are Claude Code-specific; Cursor subagents use inherit and
  // pick up the parent model. Task tier still selects the SWE variant.
  if (next.model) next.model = 'inherit';
  const name = next.name ?? '';
  if (READONLY_AGENTS.has(name)) next.readonly = 'true';
  emit(joinFrontmatter(next, rewritePaths(body, 'cursor')));
  process.exit(0);
}

if (kind === 'skill') {
  emit(joinFrontmatter(fm, rewritePaths(body, 'cursor')));
  process.exit(0);
}

if (kind === 'command') {
  const base = src.replace(/\\/g, '/').split('/').pop().replace(/\.md$/, '');
  const next = {
    name: base,
    description: fm.description ?? '',
    'disable-model-invocation': 'true',
  };
  if (fm['argument-hint']) next['argument-hint'] = fm['argument-hint'];
  emit(joinFrontmatter(next, rewritePaths(body, 'cursor')));
  process.exit(0);
}

console.error(`unknown kind: ${kind}`);
process.exit(2);
