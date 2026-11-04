# Private PostgreSQL backup and recovery

M21-05 supplies a Linux/local-Docker CLI and a reproducible disposable recovery exercise. [ADR0075](../adr/0075-private-local-postgres-backup-and-empty-restore.md) records the design; exact commands, failures and measurements are in `docs/agent/evidence/m21-backup-checks.json`. No production backup schedule, external storage, collector or alert delivery is installed.

The tool accepts a local Unix Docker endpoint only. It resolves exactly one running Compose container by the supplied project/service labels and requires the tested `postgres:17.7-alpine` image tag. It accepts no database URL, caller SQL or arbitrary command. Source backups are read-only logical PostgreSQL custom archives. The pinned application image remains the M21-04 image; these host operator scripts do not require a new application build.

Provide an independent archive key in an owner-held regular file with mode600 or stricter; symlinks are rejected. Keep keys and archives outside the build context, with the archive directory mode700. Runtime session, reporting and private-profile keys need separate secure custody: they are not included by a database dump. Never replace a key that is needed to recover older archives. Archive filenames must be new; the CLI fsyncs private files and atomically links them without overwriting an existing archive.

Use only a reviewed project/service and private absolute paths. The following is an operator command template, not a configured environment:

```sh
node scripts/postgres-backup.mjs backup \
  --project virtual-life-staging --service db \
  --key-file /PRIVATE/REVIEWED/archive.key \
  --output /PRIVATE/REVIEWED/backups/unique-backup.vlcb

node scripts/postgres-backup.mjs observe \
  --project virtual-life-staging --service db --format prometheus
```

Archives use AES-256-GCM with a random nonce and authenticated version header. Plaintext stays in memory; neither plaintext dump files nor raw SQL diagnostics are emitted. Archive creation/restoration is limited to64MiB of custom dump bytes. This is a small-database MVP bound, not a large-database backup solution. Compression can make restored data larger than the archive and temporary buffers add memory overhead. Review measured data volume and available memory before increasing this bound.

The dump has a5second table-lock wait. The container's own command timeout sends TERM at110seconds and KILL after2more; the host CLI has a120second watchdog. Probes request60second statement/5second lock timeouts. PostgreSQL dump/restore tools may reset their session settings; do not assume killing the host Docker CLI cancels every server query immediately. Watchdog exhaustion/resource-cap failure paths have not been fault-injected. Failures produce no successful archive result.

Restore authenticates the entire archive before container lookup or SQL. Only an empty database named `virtual_city_restore_test`, service `restore`, in a generated `virtual-city-backup-test-<8hex>` project is accepted. Existing tables, functions, types, custom namespaces/extensions are rejected. `pg_restore` runs with one transaction, exit-on-error and no owner/ACL restoration. There is no `--clean`, persistent target restore or schema downgrade. Restore only known, trusted archives from reviewed city schemas; authentication does not turn arbitrary SQL from an unknown source into trusted code.

Reproduce the complete local exercise:

```sh
node --import tsx scripts/backup-smoke.mjs
```

It starts two disposable PostgreSQL containers with unique credentials, migrates the source, creates an actual authenticated user/seat/order through HTTP/socket commands and invokes the real backup CLI. It verifies ciphertext privacy, wrong-key/tamper rejection before SQL, insecure/symlink key denial, unchanged existing archives, occupied enum/database/wrong-target denial and exact journal recovery. A table created after the snapshot is absent after restore. The restored API authenticates the original session, has no old room membership, and cancels the stranded unserved order without creating a completion. It runs the real metrics CLI and removes only its own databases/volumes/env/keys/archives. Evidence contains sanitized facts, not credentials or recoverable test archives.

Recovery targets are proposals, not guarantees:

| Measure | Proposed target | Evidence and limit |
|---|---|---|
| RPO | At most1hour | Requires an operated hourly successful backup and retained independent key. No schedule is installed, so no achieved ongoing RPO is claimed. |
| RTO | At most30minutes | Local fixture dump/restore/API validation is measured in the ledger. It excludes incident diagnosis,operator response,offsite retrieval,key recovery and realistic data/load. |
| Archive retention | Owner-reviewed policy | No automated deletion or offsite replication is configured. Privacy/deletion and legal retention decisions remain separate. |

`observe` reads actual database size, aggregate server/database connection counts and the PGDATA filesystem's total/available bytes. It emits no SQL text, account/session/role fields or database records. Disk space is for the filesystem containing the volume and may include other workloads. Alerts are local finite codes at less than20percent free or1GiB available, and at least80percent client connection use. These thresholds are initial budgets, not measured capacity limits. Prometheus gauge output and `infra/monitoring/postgres-queries.json` are private operator interfaces/templates; scheduling, collector ingestion and alert delivery remain NOT_RUN.

Before restoring real data, use a separately approved process, independently tested encrypted/offsite backups and key custody. Keep world admission closed while reconciling safety actions, erasure requests and consent changes since the snapshot. The exercise proves recovery of the tested snapshot and restart fences, not automatic preservation of later external decisions. Public,legacy,rights and adult-world approvals remain closed.
