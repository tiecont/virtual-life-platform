# Durable reward worker

The separate compiled entrypoint is `apps/platform-api/dist/worker.js` (`pnpm --filter @virtual-city/platform-api worker`). It shares the API build/image layout; it does not bootstrap the API. Image/cluster deployment needs its own fresh digest-bound verification. [ADR0112](../adr/0112-independent-durable-reward-worker.md) records the boundary and [task results](../architecture/N05-05-DURABLE-WORKER.json) distinguish actual local checks from release qualification.

| Configuration | Meaning |
|---|---|
| DURABLE_JOB_ROLE=api | API default; original in-process dispatcher/retry behavior |
| DURABLE_JOB_ROLE=worker | API keeps room maintenance and skips periodic outbox drain; standalone worker requires this explicit role |
| PROGRESSION_POLICY_FILE | Trusted bounded JSON matching ProgressionPolicySchema; default absent/disabled in API; worker requires an enabled policy |
| DATABASE_URL | Worker DB credential; do not supply API session/operator/encryption secrets |
| SCHEMA_COMPATIBILITY_FILE | Optional reviewed image-bound expansion; exact checksum policy otherwise |
| WORKER_INTERVAL_MS | Default3000;100..60000 in local/test, at least1000 in production; no overlapping batch |
| WORKER_RETRY_LIMIT | Explicit worker policy, default30;1..30 attempts before quarantine |

These are trusted process settings, not HTTP mutation inputs. A worker policy enables reward processing only; it does not enable worlds, media, dating or public distribution. Preserve all existing release/runtime/safety entitlements. Do not use different policy files or dispatcher roles accidentally across a release set. Policy is read at startup and logged only as a SHA256; changing it requires a reviewed process replacement.

Run the implemented local gate with `pnpm worker:check`. It builds packages/API, checks the worker runtime graph and executes real DB/process plus focus/hospitality regressions. Normal integration verification now builds the API before process tests, including from a clean tree with no dist output. Test targets are guarded disposable local databases; those fixtures do not authorize production execution.

The default worker command is a long-running loop. `--once` completes one bounded batch; `--dead-letters` prints up to20 undelivered quarantined metadata rows. For an explicit retry use `--retry EVENT_UUID progression-completion-v1 OBSERVED_ATTEMPTS OBSERVED_NEXT_AT_ISO`, copying the current count/due time from inspection. All arguments are strict values; arbitrary URLs, commands or shell options are rejected. The control does not clear a delivery receipt or bypass current eligibility/observation-age checks. Foreign consumers, stale snapshots and already delivered/deleted work are rejected. A successful batch can leave deferred/quarantined work; exit0 is not queue health or delivery to every pending event.

For a cutover, retain the policy/source and inspect pending retries, then replace the API with external dispatch configured and start the separately configured worker. Current room state follows the existing drain/reconnect contract. Only persisted completion work is external; room membership, moderation barriers, focus timers, travel, hospitality recovery and world-dependent maintenance stay in API. Multiple workers use database account/outbox locks and effect/consumer uniqueness; transport/process lifetime does not imply exactly-once execution. Never mix policies merely because duplicate effects are guarded.

On retry exhaustion, inspect metadata and resolve the underlying cause before an explicit retry. Existing legacy attempt30 rows become quarantined when opting into a bounded worker policy. No automatic purge/replay or unbounded mass-retry command is provided. The CLI assumes trusted OS/DB access and has no MFA/operator audit endpoint; do not expose it through a browser. N07 must supply authenticated, scoped, audited controls before any remote operator UI can use it.

SIGTERM/SIGINT stops future batches, settles admitted jobs and closes outbox/pool within the12s lifecycle budget. SIGKILL or deadline can leave an uncertain client outcome; replay the same durable event and consult the stored receipt. Do not infer rollback from a missing ACK. A stopped API does not cause a worker to acquire room ownership. Batch errors are fixed messages with no raw SQL/payload/credentials. N08 still owns collector freshness, backlog alerts and delivery qualification; a startup-ready log is not a perpetual health signal.

Rollback by stopping workers before restoring API dispatch with the same policy/schema. Inspect quarantined rows because legacy API retry behavior can resume them. No schema down-migration or receipt deletion belongs to rollback. Raw checks remain private local artifacts until owner cleanup; no hosted/registry/staging/public/store approval is established here.
