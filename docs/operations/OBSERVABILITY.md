# Private operational telemetry

M21-03 adds process-local OpenTelemetry spans, structured Pino logs and bounded metrics. [ADR0073](../adr/0073-private-bounded-operational-telemetry.md) records the design. This is local instrumentation; no external collector, hosted dashboard, distributed trace propagation or public monitoring service is installed.

Collection defaults OFF. An independent optional `OPERATOR_TELEMETRY_TOKEN` must be exactly 64 lowercase hexadecimal characters. Keep it in a private runtime secret, separate from sessions, reporting keys and staff grants. Empty means disabled. No actual persistent operator credential is provisioned by this task.

The private API listener exposes `GET /internal/telemetry` (JSON) and `GET /internal/metrics` (Prometheus text 0.0.4). Both require the operator bearer token; player cookies and role claims confer no access. Default, absent and wrong credentials return 404. Valid operator reads share a 30/minute budget with at most one outstanding read. Responses are `no-store`. Caddy's public API paths exclude these endpoints; valid credentials through the public edge still receive 404. Use a private reviewed collector network and TLS for any cross-host access. Do not expose the API listener publicly.

HTTP spans correlate with the server-generated `x-request-id`. The per-app real SDK provider creates root spans and ignores caller trace context and baggage. Six generic Room commands may attach a per-process HMAC room pseudonym from a successful authoritative result. No raw account, room, membership, session, world, source, order or peer identifier is exported. There is no automatic HTTP, SQL or browser instrumentation. Native private DateRooms never enter generic Room metrics; all `/v1/dating` HTTP instrumentation is excluded.

Only finite route groups, methods and Room command names label metrics. At most 128 spans are active; excess spans are counted as dropped. The local trace buffer holds at most 100 completed spans for five monotonic minutes. Logs emit a sanitized span projection, never bodies, queries, caller headers, private path IDs or raw error messages/stacks. Pino request logs use trusted route patterns. Unknown paths collapse to one label. The in-memory trace retention does not delete already written logs: operator log rotation, retention and access review remain necessary before real operation.

HTTP and Room p95 values are fixed histogram upper bounds since process start. An overflow has no finite upper bound; it is not an exact percentile. Prometheus queries estimate a windowed HTTP p95 from cumulative buckets. Error counts include rejected requests (HTTP status >=400), so policy denials are not automatically server incidents. Metrics reset on restart and are not durable business records.

Online memberships exclude reconnect grace holds; retained memberships and grace counts are separate fields. Multiple tabs are connections, not extra members. Hospitality owns its read-only retained order-phase aggregate, excludes the dating world and bounds SQL statement/lock waits. Eight retries of one placed order still count as one order. Terminal retained orders remain in their phase until ordinary retention cleanup. Gauge failures return 503 rather than invented zero. Gauges are separate observations, not one atomic city snapshot. Telemetry does not grant, moderate, match, move, complete or reward anything.

`infra/monitoring/prometheus.yml` is a private scrape template with a credentials file. `dashboard-queries.json` contains query definitions and units, not an installed Grafana dashboard. Collector provisioning, Prometheus/promtool validation and real alert delivery are NOT_RUN. Do not publish tokens in shell arguments, expanded Compose configuration, screenshots or logs. An unprivileged player never receives these operator fields in the product UI.

Reproduce the disposable local stack verification with a current image:

```sh
docker build -f infra/docker/Dockerfile -t virtual-life-platform:m21-telemetry .
CITY_SMOKE_IMAGE=virtual-life-platform:m21-telemetry node scripts/staging-smoke.mjs
```

The harness creates and later removes its own stack, local certificate and ephemeral credentials. Its private operator check executes inside the API container and prints only counts/booleans. Never reuse an older image as proof of current source. Exact results and failed attempts belong in `docs/agent/evidence/m21-telemetry-checks.json`; no runtime success follows merely from this document.
