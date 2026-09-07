# Cost review for proposed and existing infrastructure

Begin with region, environment, expected runtime, workload volume and currency.
If inputs are missing, use clearly labeled low/expected/high scenarios and explain
which assumptions dominate. Do not assume the user's location determines region,
that resources run all month, or that a free tier/discount applies.

Estimate workload components rather than resource count alone:
- Compute hours, size, autoscaling bounds and idle baseline.
- Storage capacity/growth, request rates, retrieval, retention and backups.
- Database compute/capacity, I/O and availability configuration.
- Network transfer paths: internet egress, cross-AZ/region, NAT processing and
  hourly charges, public IPv4, load balancer usage, endpoints where applicable.
- Logging ingestion/retention, metrics, tracing, KMS/API requests and other shared
  or usage-based services that may be absent from Terraform's resource list.

Use current AWS pricing pages, Pricing Calculator, or authorized pricing data.
Record URL/source, retrieval date, region, SKU/tier assumptions, unit price,
quantity and formula. Verify that billing units match workload units. Separate
fixed, usage-based, one-time/migration and shared allocated charges. Express a
monthly delta only if a comparable baseline exists; otherwise show gross cost.
An hourly-to-monthly conversion must state the chosen hours (for example 730).

| Component | Region | Unit price/source/date | Monthly quantity assumption | Estimate | Exclusions/confidence |
|---|---|---|---|---|---|
| Populate from the actual design | | | | | |

For existing resources, distinguish forecast from measured spend. Cost Explorer,
billing exports, utilization data or existing tools may help when access is
available and authorized. Without them, do not label a resource idle or promise
savings. Infracost may be reused if already available; installing/connecting it or
sending plan/configuration data to a new service is a separate choice. Unsupported
items are unknowns, never zero-cost line items.

Discuss changes such as scheduling, rightsizing, retention/lifecycle, endpoints
versus NAT or commitments only when workload evidence supports them. State effects
on availability, restore time, latency and operations. Do not buy commitments,
reduce backups, or disable audit logs as automatic optimizations. Budgets and
alerts notify; they are not guaranteed spending caps. Distinguish taxes, support,
credits, discounts and exchange-rate conversion from infrastructure estimates.
If current pricing cannot be retrieved, deliver formulas and missing inputs and
mark the estimate unverified rather than inventing a dollar total.

Official starting point (checked 2026-09-07):
https://aws.amazon.com/aws-cost-management/aws-pricing-calculator/
Follow current service/region pricing links for every priced component.
