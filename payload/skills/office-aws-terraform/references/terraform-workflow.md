# Terraform execution and evidence

Inspect the root's required_version, provider/module constraints and lockfile.
Check current official documentation for the pinned versions before introducing
version-dependent attributes. Preserve lockfiles; use init without -upgrade for
normal work. A lockfile selects providers, not module versions.

For static validation, an isolated working copy with `terraform init -backend=false`
can obtain modules/providers, followed by `terraform validate`. This does not
prove remote permissions, live values, quotas, or backend correctness. Inspect
configuration and external data sources before executing tools against untrusted
code. Don't silently migrate or reconfigure an existing backend.

For a live plan, use the established account, role, region, root, backend and
workspace. Check those targets for every relevant provider alias. Inspect
TF_CLI_ARGS and variable sources without dumping secrets. Respect existing CI/HCP
Terraform remote-run behavior; do not invent a local -out workflow where the
backend/runtime does not support it. Scope scans to the requested resources.

For a root with local plan-file support, a Bash task check can use this pattern
with the confirmed root, inputs and private absolute plan path substituted:

```bash
plan_exit=0
terraform -chdir="$TF_ROOT" plan -input=false -detailed-exitcode -out="$TF_PLAN" || plan_exit=$?
case "$plan_exit" in
  0|2) ;;
  *) exit "$plan_exit" ;;
esac
```

Do not use a bare detailed-exitcode plan as an office check: exit 2 is success
with changes. Do not use `|| true` or disable refresh to turn a failure green.
Use targeting only for a justified exceptional operation; disclose partial plans.

Prepare an access-restricted artifact directory (for example umask 077 on POSIX).
Use `terraform show -json "$TF_PLAN" > "$TF_PLAN_JSON"`, then run
`node <installed-skill>/scripts/plan-summary.mjs "$TF_PLAN_JSON"`.
Neither binary plans nor JSON are safe to commit: sensitive values can be present
even when normal Terraform output redacts them. Respect repo ignore/retention
rules, and share only a reviewed, sanitized summary. State is equally sensitive.

Record root, commit, Terraform/provider versions, input-file identifiers (not
secret values), account/region/workspace, plan creation time and checksum or remote
run ID. Inspect replacements, deletion order, imports/moves, drift, output changes,
unknown values and deferred/incomplete changes. Successful planning is not proof
of successful deployment or of security/cost acceptance. A saved plan is coupled
to state and inputs; do not reuse it across environments.

Before tests, inspect `.tftest.hcl`, fixtures and invoked modules. Use supported
mock/plan tests for offline assertions where appropriate. Apply-mode tests need
authorized targets and cleanup/cost scope. Read-only checks should stay repeatable.

For S3 state, inspect access, encryption, versioning and locking supported by the
pinned Terraform version. Current documentation describes S3 lockfiles and marks
DynamoDB locking deprecated; do not migrate an existing setup without a dedicated
plan. Never force-unlock or run state mv/rm/push as an incidental repair.

Official references (checked 2026-09-07; verify version-specific details at use):
- https://developer.hashicorp.com/terraform/cli/commands/plan
- https://developer.hashicorp.com/terraform/cli/commands/validate
- https://developer.hashicorp.com/terraform/cli/commands/show
- https://developer.hashicorp.com/terraform/internals/json-format
- https://developer.hashicorp.com/terraform/language/tests
- https://developer.hashicorp.com/terraform/language/backend/s3
