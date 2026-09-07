# AWS Terraform security review

Review the actual diff and relevant baseline. Report observed evidence, not a
blanket compliance verdict. Unknown plan values are unresolved, not safe defaults.
Inspect existing organizational guardrails before proposing overlapping controls.

| Area | Questions to resolve for affected resources |
|---|---|
| Identity | Are workload and CI identities scoped appropriately? Review actions, resources, conditions, trust relationships, cross-account principals and privilege escalation paths. Prefer roles and temporary credentials. Some APIs require wildcard resources; assess the actual action and compensating conditions. |
| Network | Does each public listener/address have a requirement? Review IPv4 and IPv6 ingress, routing, security groups and egress. Databases and admin interfaces should have only the required reachability. Don't label every public application listener a defect. |
| Data | Review S3 public-access controls and policies, access paths, TLS and encryption requirements. Assess whether service-managed encryption satisfies requirements before introducing customer-managed KMS keys and their permissions/costs. |
| Secrets and state | Keep credentials out of source, plans, logs and shared state exports. Inspect secret references, backend access and outputs; sensitive display flags alone do not remove stored values. |
| Recovery | For stateful replacements/deletions, inspect snapshots, retention, restore requirements and deletion safeguards. A flag such as prevent_destroy is not a backup strategy. |
| Detection | Check the needed audit/service logging, actionable alarms and retention. Scope observability to the workload and include its cost. Avoid enabling every service globally as a default. |

For each finding report: severity with rationale, requirement/criterion if any,
Terraform address and code/plan location, observed condition, impact, proposed
change, validation method, and any accepted exception with owner/reason. Separate
confirmed issues from unknowns requiring live evidence. Review both allow and deny
paths where executable tests are appropriate. Existing scanners and IAM validation
can contribute evidence; interpret their limitations and suppressions explicitly.

A review does not authorize changing IAM policies, deleting resources, or enabling
paid security services. Complete static review when live account access is absent.
When live inspection is in scope, use the existing authorized read-only mechanism.

Official starting point (checked 2026-09-07):
https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
Follow the specific AWS service's official security documentation for its actual
configuration; verify current defaults instead of relying on remembered defaults.
