# Operator runtime restrictions — N07-03 slice

The Runtime controls tab exposes durable world pauses and world-access maintenance for versioned release/runtime profiles. It records desired changes and their application separately. Legacy profiles return `supported:false`; the console does not provide a new way to enable their worlds. Real repository release/runtime/safety defaults remain closed.

Refresh state before changing it. Each command requires the current desired revision and immutable release digest, a UUID request key, fresh operator MFA, Origin/CSRF and a fixed reason. The supported actions are world pause/removal, maintenance entry/recovery and stale-release rebind. There are no arbitrary flags, SQL, shell, file paths, entitlement edits, role grants, capacity increases or infrastructure operations. At most 30 new runtime commands/hour are accepted per environment; unchanged retries reuse their original receipt.

| Console state | Meaning |
|---|---|
| Desired revision | Canonical restriction version committed with its audit |
| Applied revision | Restriction version applied to the current world runtime |
| APPLIED | Current bound restriction projection is applied; this is not a server-health or traffic measurement |
| PENDING | Reconciliation or a transaction fence prevents declaring the policy applied |
| FAILED | Policy application failed; world access fails closed and tracked reconciliation can retry |
| STALE | Stored restrictions belong to a different release digest; all worlds remain closed pending audited rebind |

Git release installation/entitlement and current accepted Git runtime switches remain upper bounds. Removing a pause can only restore access already allowed by those bounds. Git maintenance and independent safety incident controls still apply. Canned communication remains under its existing release/runtime capability checks; text/live-media/adult gates are not changed.

Maintenance removes existing world visits through the registry's existing unavailable notifications. Recovery permits fresh admission; old membership, room-bound work or consent is not restored. It leaves identity, owner privacy, independent safety withdrawal and background cleanup available. It does not stop or rescale the API, worker or room owner.

Desired state and redacted immutable audit share the operator transaction. A transient positive-authority guard spans transaction settlement; failed audit/expired authorization rolls back the write. The guard is not cleared by concurrent reloads. Canonical post-COMMIT reconciliation handles lost acknowledgement, and replay never restores an older desired policy. If projection fails after a successful commit, the receipt still records the saved command and state shows FAILED/PENDING. The API's tracked three-second reconciliation can repair it without a second desired mutation. Shutdown settles this maintenance through the existing lifecycle deadline.

On deployment to a different release digest, the API starts with stale controls and closed worlds. Use **Bind current release and keep maintenance** to record the new binding; the server forces maintenance on and preserves world pauses. Ending maintenance is a separate reviewed command. This does not approve or amend the Git release entitlement. The running process captures release policy once; editing that file cannot escalate it through reload.

Endpoints are `GET /v1/operator/runtime-state`, `GET /v1/operator/runtime-audit` and `POST /v1/operator/runtime-command`, with exact empty query allowlists and bounded strict BFF responses. The state projection omits policy paths, raw approval/secret references and player data. Audit retains fixed policy metadata, before/after snapshots and a keyed chain; it rejects update/delete/truncate through ordinary application access. Direct DB-superuser mutation remains outside that guarantee.

Migration 0043 requires strict 43. Preserve earlier SQL, control state and audit. Roll back with a separately qualified 43-aware image or close private control ingress; removing an operator key must not erase durable restrictions on restart. Do not down-migrate production data. Qualification uses one API room owner, synthetic policies/principals, disposable PostgreSQL and browser emulation. No multi-owner, physical-device, real deployment or public approval is established. See `docs/architecture/N07-03-RUNTIME.json` for actual source, commands, hashes, failures and limits. Calendar pagination remains separate unfinished N07-03 work.
