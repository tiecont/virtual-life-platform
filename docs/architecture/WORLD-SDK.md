# World SDK and registry v1

Implemented: packages/contracts/src/world.ts, packages/world-sdk, apps/platform-api/src/worlds. SDK Sandbox (local test world) has hooks and an inspect command, no renderer, room owner, gameplay, occupancy or persistent progress. Defaults are OFF. Sandbox is never activated or listed in production.

## Catalog

GET /v1/worlds requires the signed city cookie and a live DB session. WorldCatalogSchema contains schemaVersion:1, revision, worlds[]. Each card has slug, version, title, kind, sceneRef, capacity, declared capabilities, normalized map position/region/icon, accessHint, availability (available/disabled/offline), discoverability:listed. available means bootstrap succeeded, not that a room has capacity or a scene can load. No occupancy, account IDs, policy keys or member data are exposed. Cache-Control:no-store applies. Unknown query fields, including forged role/age, return 422. M05 adds no detail/join/command endpoint; unknown deep links return 404.

Hidden worlds are excluded even for an authorized member. Listed private/restricted worlds require an internal policy provider; absent provider denies. Adult-restricted access also requires AdmissionPolicy's separately reviewed proof provider, absent by default. An enabled flag is not access proof. Sessions are revalidated for catalog and each queued invocation; revoked/expired sessions return UNAUTHENTICATED (401 over HTTP). Catalog rate:120 requests/minute/IP with bounded limiter storage. Origin/CSRF guards remain mandatory for writes; catalog is read-only.

## Authoring

defineWorld(definition, hooks) requires bootstrap, shutdown, onJoin, onLeave, onCommand. Definition is deeply frozen; hooks remain private. adapter.invoke({}) is denied. Internal grants are single-use and adapter-bound, never client credentials. This is a trusted application boundary, not a sandbox against malicious code in the same process.

Register in WorldRegistry before activation. Definitions include schemaVersion/apiVersion 1, lowercase kebab slug, exact version, sceneRef key/exact version, title, kind (world/sandbox), capacity 1..100, unique known capabilities including presence, accessPolicy, visibility and map. Positions are finite fractions 0..1 interpreted against client scene dimensions. No remote executable URL exists. Capacity remains metadata until M06 enforces it. Public policy requires a real session; private requires policyKey; restricted adds requiresAdult. Dating must be hidden/adult-restricted. This does not certify age verification, dating consent or public readiness.

Internal dispatch(credential, slug, invocation) accepts WorldInvocationSchema: schemaVersion, exact worldVersion, exact sceneVersion, opaque membershipId, action (join/leave/command), command-only payload. It authenticates before lookup, checks policy, queues per world, reauthenticates and checks policy/membership/current activation. Hooks receive accountId, kind, membershipId, never cookies/session IDs. M06 must provide an authoritative membership port and invoke onJoin after provisional admission. M09 integrates transition rollback. No final room/travel wire contract is invented here.

World errors: NOT_FOUND (unknown/unauthorized), FORBIDDEN (invalid grant/membership), INVALID_REQUEST, WORLD_VERSION_MISMATCH (stale assets/world), WORLD_UNAVAILABLE (disabled/offline/full queue/lifecycle failure). Hook errors are sanitized. Refresh stale cards/assets; rejection does not roll back completed domain DB mutations. Owning domains supply idempotency/transactions. Disable-driven room/disconnect cleanup remains M06 acceptance; M05 tests hook drain/shutdown with explicitly controlled membership fixtures.

## Flags and rollback

config/world-flags.example.json defines schemaVersion 1 with development/test/production objects. WORLD_FLAGS_FILE is optional; no file means all modules disabled. Keep a local file outside version control, select it in the API environment, and send SIGHUP to that API process after atomic replacement. Main invokes the tested reloadFlags path. No remote write API exists. Other-environment flags do not activate this environment. Invalid JSON/schema, unknown current-environment slugs or read failure disables all worlds with a generic error. Missing flags mean false. Independent bootstrap failure leaves healthy modules unchanged; failed cleanup requires restart.

setEnabled is a trusted server API. Generation/revision rejects old queued calls and stale cards as authority. Disable drains in-flight work before shutdown; HTTP stays alive. No DB migration needed; rollback disables that adapter flag. Human product/release approvals remain separate and unchanged.

## Legacy compatibility strategy (M05-05)

Re-audit/pin each legacy revision at M15/M16. Concrete files and snapshots: repository-inventory.md, legacy-compatibility.md. Both dirty repos are untouched. Neither audited snapshot has production realtime handlers to bridge. Schema compatibility is not playable integration.

| Boundary | Deadline (M15) | Maid (M16) |
|---|---|---|
| Catalog | Explicit cafes.slug/cafe ID -> platform manifest; occupancy grants no access | Explicit cafe_templates ID -> platform manifest |
| Room reference | Mapping keyed by (source world, legacy ID) -> platform room ID; never nickname/publicCode | Same namespacing; equal source IDs across worlds never imply shared authority |
| Transport | Preserve HTTP/raw-ws facade pending runtime re-audit; no Socket.IO URL-only client swap | Translate event name and requestId/roomId/expectedVersion/payload at a dedicated facade |
| Versions | Negotiate platform schema/world/scene separately; HTTP summary is not manifest/membership | expectedVersion/roomVersion are room concurrency, never SDK/API versions |
| Response/event | Translate bounded summaries after platform auth/policy | Map ACK success/error, event version/occurredAt to M06 snapshot/delta only after its protocol verification |
| Authority | Platform identity/membership/access; no legacy-cookie grant | Resolve role via trusted service, never payload role |
| Rollback | Preserve source DB/transport, disable only that adapter | Same; room/role/shift cleanup through owned services, no cross-world SQL |

M05 hand-authored wire fixtures prove Deadline summaries/Maid versionless envelopes are rejected, including after merely adding schemaVersion. They do not test unimplemented bidirectional event mapping. Success/error/event translation, mappings, races and old-client compatibility are mandatory M15/M16 checks after M06 verification. No fictitious final transport contract is frozen now. Stable revision/source redistribution gates B-001/B-002 remain; no legacy code/assets copied.

SDK accepts exact API major 1; incompatible APIs/capabilities fail registration. World/scene versions match exactly per invocation. Future breaking contracts increment the owning schema/API major, document field/error changes and retain an explicit temporary facade for pinned clients. No silent coercion/fallback accepts old identity/role claims.
