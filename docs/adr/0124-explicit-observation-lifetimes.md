# ADR0124 — Explicit process-local observation semantics

Status: accepted for local N08-01 implementation, 2026-11-06.

Keep existing cumulative metrics and safe tracing. Label duration estimates as fixed-bucket process-lifetime upper bounds; keep overflow as null. Node event-loop histograms have monitor-lifetime semantics. This avoids presenting a lifetime aggregate as current traffic latency while retaining counters suitable for rate-window collection later.

Add a version2 aggregate endpoint and shared strict schema, retaining version1 and Prometheus adapters. The projection drops correlation IDs and pseudonyms, constrains all labels, checks histogram consistency, and carries source/version/timestamps. Missing sources fail without invented zero/healthy values. Declare database-health/worker/cluster coverage unobserved until real sources are connected. No client-controlled ranges, SQL, URLs or labels are admitted.

A focused executable observability lane tests real exports, source outage and privacy/cardinality behavior. Deployment/scrape/alert delivery and sustainable capacity remain separate tasks and require actual environment evidence. Disable expensive tracing first if measured overhead exceeds its budget; existing adapters remain available for rollback.
