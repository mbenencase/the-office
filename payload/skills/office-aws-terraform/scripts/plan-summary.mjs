#!/usr/bin/env node
// A value-free inventory, not a security scanner, cost estimator or apply gate.
import fs from 'node:fs';

try {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw new Error('usage: node plan-summary.mjs <plan.json|->');
  let plan;
  try { plan = JSON.parse(fs.readFileSync(file === '-' ? 0 : file, 'utf8')); }
  catch { throw new Error('cannot read valid plan JSON'); }
  if (!plan || !/^1\.\d+$/.test(plan.format_version ?? '') || !plan.planned_values || typeof plan.planned_values !== 'object') {
    throw new Error('expected a Terraform plan with planned_values and JSON format major version 1');
  }
  const unknown = (v) => v === true || (v !== null && typeof v === 'object' && Object.values(v).some(unknown));
  const rows = (changes = []) => {
    if (!Array.isArray(changes)) throw new Error('invalid resource change list');
    return changes.map((r) => {
      const actions = r?.change?.actions;
      if (typeof r?.address !== 'string' || !Array.isArray(actions) || !actions.length || actions.some((a) => typeof a !== 'string')) throw new Error('invalid resource change');
      return {
        address: r.address,
        mode: r.mode ?? null,
        type: r.type ?? null,
        actions,
        replacement: actions.includes('create') && actions.includes('delete'),
        destructive: actions.includes('delete') || actions.includes('forget'),
        moved: typeof r.previous_address === 'string',
        importing: r.change.importing != null,
        has_unknown_values: unknown(r.change.after_unknown),
      };
    });
  };
  const resources = rows(plan.resource_changes);
  const counts = {};
  for (const r of resources) {
    const key = r.replacement ? 'replace' : r.actions.join('+');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  console.log(JSON.stringify({
    format_version: plan.format_version,
    complete: typeof plan.complete === 'boolean' ? plan.complete : null,
    errored: typeof plan.errored === 'boolean' ? plan.errored : null,
    applyable: typeof plan.applyable === 'boolean' ? plan.applyable : null,
    deferred_changes: Array.isArray(plan.deferred_changes) ? plan.deferred_changes.length : null,
    output_change_count: Object.keys(plan.output_changes ?? {}).length,
    counts, resources, drift: rows(plan.resource_drift),
    note: 'Inventory only; unknown actions are retained. Values omitted. Review source, full private plan, security and costs separately.',
  }, null, 2));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
