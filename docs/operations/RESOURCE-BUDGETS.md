# Resource ceilings and scaling decisions

M21-06 defines an unpriced planning envelope,not a purchase or production capacity result. The executable source is `infra/environments/resource-budget.json`; `pnpm infra:check` validates allocations,reserves and closed scaling/purchase flags. No vendor quote,account,VM,Redis service or billing commitment is created. An operator must obtain actual prices within the ceiling or revise the plan explicitly.

The hypothetical monthly ceiling is **USD25**,allocated as ceilings of USD18 compute,USD5 encrypted backup storage and USD2 domain allocation. These are spending limits,not statements that any provider currently sells these services at those prices. Taxes,egress,storage requests,domain renewal and exchange costs must fit the ceiling after real quotations. Stop before purchasing if the complete quote exceeds it. No current bill or actual monthly cost is measured.

The initial single-host hypothesis is2vCPU/4GiB RAM/80GiB disk/250GiB monthly egress. No benchmark on this shape exists. Memory allocations are512MiB OS,1024PostgreSQL,768API,512web,128edge,512maintenance and640reserve,total4096MiB. Disk allocations are8GiB OS,12images,20database,2logs,5local archives,4temporary and29reserve,total80GiB. These are accounting envelopes;Compose does not enforce cgroup limits. Backups share a maintenance window,not an unlimited extra process pool. Tune real PostgreSQL memory/connections with measurement;max_connections100 is an observed test default,not a certified production capacity.

Actual local evidence provides a starting point:

| Profile | Observed result | Practical limit |
|---|---|---|
| M06 owner baseline |24sockets/3rooms;join p95=393.989ms;sampled API RSS161374208bytes |3.04second loopback run,not sustained capacity |
| M18 booking contention |16actors/76requests;all-request p95=328.233ms;RSS200826880bytes |1.31seconds,60expected conflicts,DB/client CPU excluded |
| M19 audience burst |48sockets/160requests;p95=948.671ms;RSS212422656bytes;35244JSON response bytes |7.91seconds,40expected429;headers/TLS/heartbeats excluded |
| M21 backup exercise |284220encrypted bytes;303.731ms dump/580.440ms restore;2224ms recovery checks |Small synthetic snapshot,not realistic recovery size or RPO/RTO |
| Current app image |2610849769bytes,ID d149e0d3… |Build/dev dependencies retained;tag sizes must not be summed as physical shared-layer usage |

See `ROOM-BENCHMARK.md`,`RESTAURANT-VERIFICATION.md`,`LOUNGE-VERIFICATION.md` and their original JSON artifacts. Historical load host:Ryzen7 4800HS/16logical CPUs/about24.57GB RAM. The current audit still observes16available CPUs/about24.57GB RAM. This differs materially from the hypothetical host;do not extrapolate linear CCU or monthly bandwidth/cost from these short traces. No new load run is claimed by this budget task. M22 must measure ramp/stress/soak and set an actual accepted capacity afterward.

Investigation thresholds are proposals requiring measured windows:

| Signal | Initial threshold | Action |
|---|---|---|
| Whole-host CPU |Above70percent of provisioned CPU for15minutes |Profile API,DB and jobs separately;bound work/index before changing architecture |
| Host/cgroup memory |Above80percent for15minutes;or post-GC heap growth above64MiB/hour |Inspect retained work/queues/leaks;repeat a comparable soak |
| PGDATA disk |Below20percent free or1GiB available |Stop optional writes/retention growth,verify backup/recovery and investigate;never prune unrelated data automatically |
| PostgreSQL client connections |At least80percent of server limit for15minutes |Find bounded checkout/query waits and pool leaks before raising limits |
| HTTP latency/errors |p95 above1000ms or unexpected failures above1percent for15minutes |Separate policy denials/expected conflicts/429 from unexpected failures;correlate owner/SQL/queue timings |
| Network |Projected actual metered egress above80percent of250GiB monthly ceiling |Review cached assets/refresh rates and actual provider billing scope;JSON-only traces are insufficient |

Use process-local operator metrics from M21-03 and database CLI observations from M21-05;operated collectors,host/cgroup/egress metering and alerts are not installed. A single sampled p95 or one burst above a threshold does not trigger deployment,spending or scaling. No 100/1000/10kCCU promise follows.

Split a service only after a reproducible sustained profile identifies an independently owned bottleneck,optimizations fail to meet the chosen SLO,and a reviewed ADR supplies bounded interfaces,observability,privacy,retry/rollback tests and a priced resource plan within the ceiling. A measured background job consuming25percent of API CPU while delaying room work for30minutes is a reason to investigate a separate worker,not an automatic extraction. SQL transactions/outbox/receipts remain authority for durable effects.

Redis remains OFF. A reviewed design must prove a measured bottleneck,explicit owner fencing,no loss of SQL authority,privacy review and concurrency/failover tests before enabling it. Pub/Sub is not ownership. More than one Room owner is prohibited until per-room ownership/fencing and stale-owner rejection are implemented and verified. The current advisory-lock guard intentionally prevents a second ready owner. Redis for an unrelated bounded cache/queue still requires scoped keys,retention,outage behavior and cost review;never put private DateRoom presence in a global cache.

The validator enforces accounting and review gates,not a cloud budget alarm or runtime resource quota. Production purchasing,capacity certification,host monitoring,media rights,staff coverage and restricted-world approval remain independent gates.
