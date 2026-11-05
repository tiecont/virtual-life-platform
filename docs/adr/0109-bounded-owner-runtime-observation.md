# ADR 0109 — Bounded owner runtime observation

Date: 2026-11-06. Status: accepted; N05-02 verified by actual local checks.

Existing RoomMetrics measures complete gateway commands. It cannot distinguish owner queue wait, projection, SQL or dispatch work. Add fixed phase/outcome histograms inside the existing six public RoomService command entrypoints, preserving their queue, authority checks and business ordering. Internal/engine/safety operations do not acquire new command observations, preserving their existing privacy scope. A process-wide Node event-loop monitor has explicit warmup/no-sample state and is stopped during application close.

Use a foundation AsyncLocalStorage observation port and a composition-attached pg observer. The frozen pg Pool callback and Promise APIs still own checkout, transactions and release. Observe real acquisition/query spans without retaining SQL, parameters, rows, identities or connection strings. Restore client methods on release and pool methods when the last application subscriber detaches; sharing a Pool must not double-count. Capture the initiating observer across pool handoffs rather than attributing a waiting request to the releasing callback. Expire command context so background heartbeats/late callbacks cannot mutate completed observations. Submittable/unstable custom driver methods retain their behavior with unsupported coverage reported.

Histograms contain fixed command, outcome and phase labels and fixed buckets, not raw samples or account/room labels. Projection batches suppress nested snapshot timing to avoid double-counting the same wall interval. DB phase values sum initiated query/acquisition spans per command; parallel queries can make those sums exceed execution wall time. Do not add nested spans or infer CPU/one-way network time from residuals. Selected pathfinding has its own synchronous wall measurement; actual process CPU and client round-trip are separate observations.

Implement `profile:runtime` as a bounded local fixture with actual HTTP/Socket.IO and isolated PostgreSQL. Observe decoded Socket.IO text payload bytes and their actual snapshot shape, plus separate API TCP counters. Synthetic profiles, real loopback addresses, unchanged quotas, fixed destinations and owned cleanup prevent a benchmark from becoming a production test. Archive the actual baseline, profile and cancellation evidence. One short before/after pair is not an overhead equivalence or capacity qualification.

No mailbox, sparse-delta, replica, schema or public entitlement change belongs to instrumentation. N05-03 evaluates optimization using measured outcomes and retained privacy/consistency gates. Recovery is an independent revert of the observer/metrics slice; preserve the earlier command/authority path and previously recorded evidence.

Primary API references: [pg Pool acquisition/query/release](https://node-postgres.com/apis/pool), [pg Client query forms](https://node-postgres.com/apis/client). Actual installed pg/pg-pool source and types were inspected; no dependency upgrade is part of this decision.

Actual results: [N05-02 runtime profile](../architecture/N05-02-RUNTIME-PROFILE.json). Full check passed58 governance,308 unit and569 integration cases and all workspace builds. Initial failures and the baseline clock reproduction remain recorded.
