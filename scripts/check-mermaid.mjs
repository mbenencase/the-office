#!/usr/bin/env node
/**
 * Parse every ```mermaid block in the given Markdown files.
 *
 * A broken diagram renders as a grey error box on GitHub and nowhere else --
 * it does not break a build, so without this it is only found by a human
 * looking at the rendered page.
 *
 * mermaid needs a DOM, so this depends on mermaid + jsdom. Neither is a
 * dependency of this repo (the CLI stays zero-dependency and there is no
 * node_modules here). CI installs them into a scratch directory; locally this
 * skips cleanly when they are absent, the same way shellcheck does.
 */

import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: check-mermaid.mjs <file.md> [...]');
  process.exit(2);
}

let mermaid;
try {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const define = (k, v) => {
    try { globalThis[k] = v; }
    catch { Object.defineProperty(globalThis, k, { value: v, configurable: true }); }
  };
  define('window', dom.window);
  for (const k of ['document', 'Element', 'SVGElement', 'HTMLElement', 'DOMParser', 'Node',
                   'getComputedStyle', 'requestAnimationFrame', 'MutationObserver']) {
    define(k, dom.window[k]);
  }
  globalThis.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} });
  mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false });
} catch {
  console.log('check-mermaid: skipped (mermaid/jsdom not installed; CI runs this)');
  process.exit(0);
}

const BLOCK = /^```mermaid[^\n]*\n([\s\S]*?)^```/gm;

let blocks = 0;
let failed = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(BLOCK)) {
    blocks++;
    // Line number of the fence, so a failure points somewhere useful.
    const line = text.slice(0, m.index).split('\n').length;
    try {
      await mermaid.parse(m[1]);
      console.log(`ok    ${file}:${line}`);
    } catch (err) {
      failed++;
      const detail = String(err?.message ?? err).split('\n').slice(0, 5).join('\n      ');
      console.error(`FAIL  ${file}:${line}\n      ${detail}`);
    }
  }
}

if (!blocks) {
  console.error('check-mermaid: no mermaid blocks found — did the fence label change?');
  process.exit(1);
}
console.log(`${blocks - failed}/${blocks} diagram(s) parse`);
process.exit(failed ? 1 : 0);
