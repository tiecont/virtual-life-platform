# ADR0076 — Unpriced resource ceilings and measured scaling gates

Status: locally VERIFIED M21-06 from9bfe054.16governance/infra entrypoint/budget validator/full lint0;initial3lint globals errors retained/fixed. Actual host/image metadata and4historical evidence hashes audited,not new load or pricing. [Evidence](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/evidence/m21-budget-checks.json). No application/schema/runtime change,purchase,Redis or capacity certification.

Use a hypothetical USD25/month ceiling and one-host2vCPU/4GiB/80GiB envelope,with explicit memory/disk reserves and cost allocations. These are unpriced limits,not vendor recommendations,availability or purchases. Enforce the accounting/closed purchase/single-owner/Redis gates through existing infra checks,without provisioning anything or silently changing production cgroups.

Audit actual short local24/48socket,booking and backup artifacts and current image size;retain their hardware/time/window/exclusion limits. Set measurable investigation windows for CPU,memory,connections,disk,latency/errors and metered egress. No observed local burst certifies100/1000CCU or a smaller VM. M22 must supply sustained capacity evidence before sizing actual operation.

Service extraction/Redis requires an identified bottleneck,reviewed owner interfaces/privacy,rollback,priced plan and failure/concurrency tests. Pub/Sub cannot replace room ownership/fencing;single-owner guard remains. No automatic scaling or purchase follows a threshold. See [resource runbook](../operations/RESOURCE-BUDGETS.md).
