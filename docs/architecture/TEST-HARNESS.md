# Isolated quality harness

M22-01 extends the existing stack rather than installing another test framework. [ADR0077](../adr/0077-isolated-test-environment-and-owned-process-cleanup.md) records the audit; the final ledger belongs in `docs/agent/evidence/m22-harness-checks.json`. No hosted run follows from local workflow validation.

| Layer | Existing entrypoint | Isolation |
|---|---|---|
| Governance/contracts/unit |`pnpm test` |Real Node/Vitest assertions,explicit fixtures,no shared production DB |
| SQL/HTTP/Socket.IO |`pnpm test:integration` |Disposable local PostgreSQL or explicitly supplied test service;unique per-test schemas,current authentication and actual TCP where required |
| Browser |`node scripts/run-browser-tests.mjs` |Each spec/device gets its own DB/API/web lifetime and report scope;retries0 |
| CI |`quality.yml` |Core gate,validated19spec/5browser groups,maxparallel2,stable fail-closed quality aggregate,scoped7day artifacts |
| Harness fault checks |`node scripts/test-harness-smoke.mjs` |Two concurrent owned databases,nested external reuse,failed command,signal/descendant cleanup,unsafe URL rejection |

`with-test-db.mjs` accepts only postgres/postgresql URLs with a loopback host and a `virtual_city_test` name or permitted suffix. Base URLs cannot contain query parameters or fragments. Database clients can interpret connection-string options independently of URL authority;do not pass unvalidated query overrides. Errors report a fixed stage without credentials/raw configuration. An explicitly supplied `TEST_DATABASE_URL` is externally owned and is never stopped by this harness;the caller must supply a genuine disposable test service. Names alone do not prove an arbitrary server contains no real data.

Without an external target,the harness requires a local Unix Docker context,creates a generated `virtual-city-test-<8hex>` project with tmpfs PostgreSQL and a random loopback port/password,and removes only that project. It never takes `DATABASE_URL` from the parent as a database selection. Seed data stays in generated DBs/unique schemas;normal test cleanup remains owner scoped. No public/legacy/retained city database is a target.

Children receive an explicit OS/tool/CI environment plus finite test controls. Session/report/private-profile fixture keys are independently generated on each invocation;parent secrets,PG settings,Node preloads,world/provider/operator configuration and arbitrary variables are excluded. Default runtime is test/UTC/local endpoints,real prototype flags closed,operator export disabled. Browser fixture flags/report paths and the existing2..24socket baseline parameter are validated before forwarding. Playwright supplies its explicit synthetic policies/keys to each app. This is environment isolation,not a sandbox against malicious test code or commands deliberately reading owner files. Parent bootstrap/tool paths/OS configuration remain trusted.

The harness tracks its active child process group. Child failure preserves a positive exit code;SIGTERM/SIGINT request bounded group termination before DB cleanup. Only owned groups/projects are signalled,never an arbitrary port/PID or another project's volumes. The actual smoke verifies exit7,exit143,non-running descendants and removed container/network/volume labels. A reaped process or zombie is not executing;the test does not promise immediate kernel PID reaping. SIGINT and cancellation during Docker startup/uncooperative independently detached daemons are not separate fault proofs. Trusted test tools remain responsible for their own detached subprocess lifecycle.

The smoke's two database seeds use different ports and generated session keys. Nested external invocations retain the owning database/seed and use another fresh key. Wrong-host/non-test/query/scheme targets fail without printing markers. Fault metadata is sanitized in `artifacts/ci/core/test-harness.json`;no URL/password/key/raw SQL row is archived. CI invokes the smoke before core checks,so a failed isolation probe fails the job. Hosted CI/PR/branch protection remain NOT_RUN under the offline owner instruction.

Actual full-suite/browser outcomes are recorded in the task ledger only after completion. Existing runtime evidence remains separate from this harness change. Do not infer all worlds,actual Deadline/Maid integration,capacity,security review or accessibility from the presence of a test file.
