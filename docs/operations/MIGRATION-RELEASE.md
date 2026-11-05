# Migration preflight,canary and compatible recovery

This runbook applies to an offline rehearsal,not an authorized production rollout. Read [wave gates](RELEASE-TRAINS.md),[bounded readiness](DEPLOYMENT-RECOVERY.md) and [encrypted restore](POSTGRES-RECOVERY.md). Keep public flags OFF. A successful restore or same-schema API rollback never approves dropping a real database or downgrading its schema.

Before any owned staging change,record the source commit,immutable API/web image IDs,dependency graph,complete sorted SQL names/checksums and current journal. `/health/ready` requires exact manifest/metadata plus the single RoomAuthority. Compare old and new manifests before starting a stack;do not use an old36/37 image on38. Never edit a committed migration to match a changed checksum. All migrations are forward-only;there is no supported down command. Stop for a reviewed recovery plan on any mismatch.

The local candidate builder reuses the inspected cached `m21-deployment` image's external dependencies and checks their manifest versions plus the exact lockfile packages/snapshots section. It copies curated compiled API/packages/current web/public/manifests only,verifies selected runtime sources against the explicit Git revision,and removes previous compiled directories before overlay. No dependency install or image pull runs;Docker RUN network is disabled. It adds missing workspace aliases and verifies every copied output hash,38 SQL files and imports inside a read-only/network-none container. This is a local reproducibility mechanism,not a minimized,signed or vulnerability-certified public image. Retained cached build/source dependencies still require review before distribution.

```sh
pnpm build
node scripts/build-offline-candidate.mjs --tag virtual-life-platform:m23-current
node --import tsx scripts/backup-smoke.mjs
```

The previous API candidate in this rehearsal is actual selected revision `3a2de59`,not a relabelled36-migration image. Extract its API/packages/config/manifests into an independent ignored directory,compile with the existing version-matched local dependencies,and copy its migration/policy assets using its own `copy-migrations.mjs`. The evidence ledger records the exact commands/source fingerprints. Its current38-aware workflow reader predates the local Maid greetings addition;only identity/TLS/Socket compatibility is exercised in the production-mode rollback. The current web artifact stays fixed in both images;no old-world gameplay or coordinated frontend downgrade is implied.

```sh
node scripts/build-offline-candidate.mjs --tag virtual-life-platform:m23-previous \
  --runtime-root artifacts/m23-previous-source --revision 3a2de59
CITY_SMOKE_IMAGE=virtual-life-platform:m23-current \
CITY_SMOKE_ROLLBACK_IMAGE=virtual-life-platform:m23-previous \
node scripts/staging-smoke.mjs
```

Execute in this order:

1. Close admission through reviewed controls. Confirm no second Room owner,DB reachable,private disk/connection headroom and independent secret/key custody. Record backup timestamp and snapshot bounds;do not print environment,expanded Compose,headers,DB URLs or evidence.
2. Create an authenticated encrypted backup using the real CLI. Restore into an empty generated test target and check the exact journal,session authentication,no phantom visits and correct business interruption. Wrong key/tamper must fail before SQL;occupied targets must be refused. The helper removes only its own test resources. Persistent restore is deliberately unsupported by this helper.
3. On a separate disposable stack,apply reviewed forward migrations once and verify readiness. Record statements that rewrite data,replace constraints or introduce stricter readers. Canary one API owner with public worlds closed;check guest reload,session rotation,authenticated Socket,private metrics and proxy isolation before considering expansion.
4. Rehearse graceful API stop. Clients must see transport interruption;they cannot recover a previous process's membership/seat by replay. Inject the known-invalid candidate configuration and confirm it never becomes ready. Restore the explicitly compatible previous API,confirm the same durable identity and fresh Socket authentication,then roll forward and reload the browser.
5. For a real failure,keep admission closed. If manifests are identical and all consumer/state contracts were reviewed,stop/start the approved previous app without changing the DB. If schema or serialized workflow is incompatible,stay on compatible code with the world closed and prepare a forward fix. Do not force an older binary ready,delete journal rows or run ad-hoc down SQL. A restore to a separate empty target is a disaster-recovery decision that loses changes after its snapshot;reconcile safety,erasure and withdrawn-consent decisions before reopening.
6. Confirm cleanup only of generated rehearsal project,volumes,network and ephemeral env/TLS/key/archive files. Keep sanitized facts and immutable IDs. The retained City DB and original source databases are outside the exercise.

Compatibility review includes all38 historical migrations. In particular,0003/0006/0007 and0017/0018/0021/0027/0028 expand constraints or audit action sets;an older writer may not support newer actions. 0016 persists versioned workflow snapshots;0027–0029 add role/kitchen/private-party semantics. 0032 backfills accepted audience totals;removing its counter can weaken lifetime quotas. 0033–0036 persist private adult consent/eligibility/date/continuation state and cannot be exposed to an unaware app. 0037's association revision/tombstone preserves withdrawal against delayed retries. 0038 is a COMMENT-only readiness boundary for strict recipe-aware workflow readers;its lack of row rewrite does not make a pre38 downgrade safe. Constraints,triggers,receipts,negative-consent fences and private history must survive any rollback. This identifies compatibility risks;it does not establish that every historical migration can be reversed safely.

No recurring/offsite backup,real operator response or production RPO/RTO is established. The1hour/30minute objectives remain proposals. Current measured outcomes and initial failures belong in `docs/agent/evidence/m23-recovery-checks.json`;a runbook alone is not a passed rehearsal.
