# Incident containment and independent recovery

**Public operation is blocked:**incident commander,safety on-duty,privacy/legal reviewer,backup custodian and release approver are unassigned in [release inventory](../../config/release-trains.json). Existing `safety-policy.json` escalation entries are also unassigned and appeal contact is null. Do not interpret the project owner's offline implementation request as an on-call rota or provision real staff. Public social launch requires a reachable primary and independent backup,coverage window,time zone,acknowledgment target and handover record held in a private operator system. No alert delivery or external message is configured by this runbook.

Use [moderation procedures](MODERATION-RUNBOOK.md) for actual authorization and appeals,[migration/recovery](MIGRATION-RELEASE.md) for exact manifests,[private telemetry](OBSERVABILITY.md) for bounded measurements and [resource budgets](RESOURCE-BUDGETS.md) for proposed thresholds. The implementation has deny-only scoped world/chat controls;it has no magical infrastructure break-glass or automatic public operation.

Start an internal incident record with a random incident reference,UTC start/last-update,affected finite surface/world,observed symptom,current containment status,reviewer role,evidence location and next check. Case/account/session identifiers and raw reports belong only in the authorized confidential case system,not this repository. Track states `investigating → contained → recovering → reviewed`;an HTTP timeout is unconfirmed containment. Preserve actual commands,exit codes and safe observations,including failed attempts. The incident record is operational metadata,not an allegation verdict or permanent sanction.

| Severity | Examples | First action |
|---|---|---|
| Critical | Suspected private-data/credential exposure,adult gate bypass,uncontrolled abuse without coverage | Keep the affected surface closed;route to the privately assigned incident/safety/privacy owners before any reopening. If none is assigned,remain closed. |
| High | Room-owner loss,DB unavailable,repeated unsafe delivery,expired media rights | Deny affected admission/chat/media;verify closure,readiness and retained business state. |
| Degraded | Sustained latency,error/disk/connection pressure with controls still intact | Preserve evidence,reduce optional scope and investigate under unchanged authorization/capacity limits. |

These are decision guidelines,not a staffed response SLA. Suspected imminent harm or legal reporting needs a qualified human following reviewed jurisdiction-specific procedures;the code sends no external report or promise automatically.

For abuse or coverage loss:

1. A currently registered,in-scope safety-admin closes Chat or World admission in `/moderation`,using Incident or Coverage loss. Ordinary moderators/player costumes cannot do this. Evidence decryption-key failure must not prevent a valid emergency denial.
2. Confirm the acknowledged durable control. Chat denial must reject even a message already waiting for classifier approval;world denial must end live/grace memberships and seats. Verify deep-link/socket admission denied,unaffected worlds still scoped normally and readiness truthful. Check private audit,not a user-facing count or a guessed empty queue.
3. Preserve only the authorized encrypted case context;apply individual reasoned actions through assigned review,not blanket report-count sanctions. Keep own reports/appeals,withdrawal and session/logout available under their existing guards. Record no raw chat transcript in logs.
4. A different current scoped safety-admin reviews recovery. Clearing an incident deny must not enable base flags,restore a seat/shift/romantic consent or bypass a separate sanction. Stale same-key closure replay returns current state;verify fresh admission separately. For Lounge,loss of operator coverage keeps stage/audience stopped. Dating remains closed under its own approvals.

For suspected data exposure:

1. Stop the affected surface's admission and restrict the private edge/access path through the authorized infrastructure owner. Do not rely solely on chat denial to contain a DB/credential exposure. If SQL/staff authorization is unavailable,an application deny may not commit;keep edge access closed and use a reviewed owning-process stop.
2. Preserve sanitized request IDs,times,route groups,version/config fingerprints and access audit in restricted storage. Do not copy headers,query strings,DB URLs,cookies,private profiles,age proof or report bodies into incident chat,Git or screenshots. Minimize access to backups and case keys;review who could read the exposed data.
3. The privately assigned security/privacy owner decides credential revocation,notifications,retention/holds and legal duties. Coordinate rotation and recovery tests:changing session signing keys invalidates sessions;overwriting evidence/profile/archive keys can make retained data unrecoverable. Never invent a safe bulk re-encryption or revoke real users under this offline task.
4. Restore only into a separately reviewed empty target after authenticating the archive. Reconcile later erasure/blocks/safety/withdrawals before reopening. A restored snapshot is not evidence that consent or reported harm after its timestamp disappeared.

For room crash or backend unavailability:

1. Confirm `/health/live` versus `/health/ready`,DB reachability/exact38manifest and single-owner diagnostics. False readiness is a stop. Distinguish transport disconnection from revoked login and from a committed durable action.
2. Use the authorized one-owner graceful stop/start. Main drain has12seconds;Compose allows15. No second ready owner or zero-downtime claim. A stalled trusted hook can delay closure;acknowledge unknown containment and keep edge/world closed. Do not run another room writer or force-delete owner locks.
3. Clients must clear unconfirmed scene entities and resync. Restart creates a new epoch;old membership/nonce/receipt cannot restore live authority. Durable served history can remain,unserved stranded orders can cancel;never manually award service completion/rewards to make the UI look recovered.
4. Verify current readiness,fresh authenticated Socket,one new visit,no automatic seat/shift and appropriate private business outcome. Use a same-manifest compatible API rollback only after contract review;otherwise keep compatible code closed and forward-fix. Never edit migration journals or drop retained/original databases.

For performance/resource pressure:

1. Read private finite HTTP errors/histogram bounds,room online versus grace counts,active/retained orders,PG disk/connections and host observations. Separate expected403/409/429 from unexpected failures. Gauges failing503 are unknown,not zero;metrics reset on restart.
2. Compare a sustained window to proposed thresholds:unexpected errors>1percent or p95>1000ms for15minutes;disk<20percent or1GiB;connections≥80percent for15minutes. No sustained collector is installed,so a single sample cannot prove the window or an SLO breach.
3. Close affected optional world scope or pause approved jobs while preserving privacy/withdrawal paths. Do not raise admission/rate limits,timeouts,staff capacity or instantiate Redis/multiple Room owners to hide the symptom. Profile bounded fanout,SQL/pool waits and queue cleanup,then repeat a comparable load profile.
4. Record recovery observations and rollback decision. The local1000-client hypothesis was NOT_MET and a burst admission timeout remains documented;short local successes cannot approve production CCU or spending.

Before reopening any incident,record independent review,known cause or explicit unresolved risk,fresh denial/recovery checks,baseline wave gates/current rights/coverage and monitoring watch window. Missing coverage,expired media rights,underage/unknown adult eligibility,inaccessible backend or corrupted migration keeps the relevant surface closed. Reopening never restores previous positive consent. Save a handover with residual risk and next observation;do not mark an incident resolved merely because a process restarted.

Fresh local control evidence is in `docs/agent/evidence/m23-incidents-checks.json`. It uses synthetic disposable reviewers and worlds;it does not supply the missing real on-duty assignment required by M23-03.
