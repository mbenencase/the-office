---
name: office-aws-terraform
description: Create or change AWS infrastructure using Terraform and review its security and estimated costs within the-office workflow. Use for AWS Terraform requests, including infrastructure-only security/cost reviews; exclude CDK, CloudFormation, and application-only AWS SDK changes.
---

# AWS infrastructure with Terraform

Use the repository's Terraform conventions and the existing office roles. Do not
add a new agent roster, install scanners, or access AWS just because this skill is
loaded. A review request authorizes analysis, not remediation or deployment.

## 1. Establish the scope from the request and code

Inspect Terraform roots, modules, provider constraints, `.terraform.lock.hcl`,
backend configuration, variable files, CI and documented deployment procedure.
Identify account/role, region, environment, workspace/backend key, and affected
roots. Do not infer a production target from a default shell profile. When live
access is needed and already authorized, verify the actual AWS identity and
provider aliases/assume-role targets; the CLI identity alone may not be the
identity Terraform uses. Use existing short-lived authentication, never request
access keys in chat or write them into HCL/variable files.

Determine workload shape, availability/backup needs, data sensitivity, exposure,
expected traffic/storage, and budget/currency where relevant. Resolve repository
facts yourself; ask only about missing decisions that materially change the work.
If AWS access or demand data is unavailable, continue with static analysis and
explicit scenarios; label live validation and cost unknowns accurately.

## 2. Fit the office workflow

Read `office-spec` for changes. Infrastructure creation is usually a feature;
a correction is a bug; a behavior-preserving module reorganization is a refactor.
Use the existing overview, requirement/criterion IDs, and approval gates. Put
AWS context and cost assumptions in the relevant sections, not a competing spec.
Record technical alternatives in optional design.md. Keep task scope rooted in
the affected Terraform files and link security/cost criteria to task evidence.

A security/cost review of existing infrastructure can produce a findings report
without implementation tasks. Label findings as user-reported, code-confirmed, plan-confirmed,
or live-confirmed; a repository review is not an account-wide audit. If changes
are requested, convert findings into spec-linked tasks. New repository-wide
scanners/hooks/policies are harness proposals under existing Gate 3.

Load [security.md](references/security.md) and [costs.md](references/costs.md) for
both creation and review. Prefer the existing services/modules that satisfy the
requirements. Explain meaningful cost-versus-availability tradeoffs instead of
choosing the cheapest configuration automatically.

## 3. Implement and collect evidence

Read [terraform-workflow.md](references/terraform-workflow.md) before executing
Terraform. Preserve the selected versions/backend/workspace; do not upgrade or
migrate state incidentally. Use moved/import constructs appropriate to the pinned
version when adopting or reorganizing resources, and review the resulting plan.

Use formatting, validation, existing policy checks and focused assertions.
For refactors, existing behavior checks can remain green. Inspect Terraform test
runs before invoking them: apply-mode tests can provision billable infrastructure.
A static scan is useful evidence, not proof of runtime security or a full bill.

Honor the SWE protocol: prepare setup/lockfile changes first, commit source before
final `office check`/`scope`, and keep ephemeral plans outside tracked source.
For authorized implementation work, Terraform `plan -detailed-exitcode` returns 2 for a successful plan with changes;
normalize only 0 and 2 to success in task checks. Never put apply, destroy, state
mutation, or apply-mode tests in repeatedly executed task checks.

The bundled `scripts/plan-summary.mjs` reads `terraform show -json` plan output
and counts changes, replacements, moves, drift and unknowns without printing
resource values. It does not evaluate IAM/network policies or prices and cannot
approve a plan. Resolve the script relative to this installed skill directory.
Treat resource addresses as potentially identifying information before sharing.

## 4. Deliver a reviewable result

Provide the affected roots/environment and commit; requirement coverage; plan
identity and resource action summary; security findings with severity, evidence,
impact and remediation; monthly cost scenarios with dated sources and assumptions;
validation actually run and remaining unknowns; and recovery/backup considerations
for destructive or stateful changes. Export only sanitized evidence to task Notes
or the PR. Do not paste full state, variable values, or plan JSON.

Preparing Terraform and approving its spec do not themselves authorize AWS
mutation. Use authorization already provided in this session if it clearly covers
the concrete target and operation. For a request that includes deployment but lacks that authorization, after code,
plan, security and cost review are ready, ask once to apply that specific saved
plan. For review-only or code-only requests, deliver the report/code without
requesting deployment. A changed plan or
target must be assessed against the authorization again. Do not disable state
locking or use auto-approval as a substitute for authorization.

If application is authorized, follow the existing deployment mechanism, confirm
that code, inputs and target still match the reviewed plan, and apply that saved
plan. State staleness/errors require a fresh plan and review; never silently fall
back to an unreviewed apply. Record outputs safely and verify required behavior.
