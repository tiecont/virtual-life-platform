# M09-04 Next Implementation Boundary

Read after the M09-03 checkpoint at7142014. This is an audit/implementation input, not a verified handshake.

Observed existing code:

- `rooms/service.ts` owns account/connection/membership indexes and seats under one queue. Ordinary join inserts a provisional active membership before invoking the registry join hook. This cannot be reused for cross-world preparation while retaining an active source.
- `world-sdk/src/registry.ts` dispatches only after `hasMembership`. No nonpublic preparation grant, bounded reservation lifecycle or resource rollback protocol exists. Hooks are trusted, asynchronous and may not settle; the room queue must not remain stalled behind a preparation timeout.
- `travel/service.ts` persists scoped CREATED authorization and consumption metadata; `redeem` neither prepares capacity nor advances READY/COMMITTED. Cancellation/read/maintenance use account locks and must coordinate with eventual final switch.
- Sanction/incident changes already enter `rooms.safetyMutation`, serializing publication with owner work. Identity revocations/flag generations may invalidate asynchronous preparation before queued cleanup; commit must observe fresh session/authority/generations.
- Shared pool calls inside held account-lock transactions can deadlock under concurrent callers. Follow M09-03's separation or use transaction-aware policy ports; do not hold all pool connections while awaiting registry requests using the same pool.
- Current ordinary room UI/recovery assumes one world scene. A switched snapshot needs explicit receiving/reconciliation semantics; M09-06 must test actual browser routing and concurrent reconnect separately from synthetic API fixtures.

Next exact action: write a real PostgreSQL/socket failing acceptance test with explicitly synthetic source and target adapters: source remains the sole active membership/seat while target preparation is delayed, capacity includes bounded holds, then exactly one target index switch with old source commands denied. Implement a registry-owned one-use preparation grant distinct from normal active membership, with expiry/cancel/abort cleanup and no ordinary command authority. Define how resource-owning source/target hooks roll back or fail to a truthful safe lobby. Do not silently reuse ordinary join by fabricating target membership.

Before marking M09-04 VERIFIED, test timeout/cancel before commit, same-key retry after lost ACK, original source/session/epoch mismatch, target fills/flag/private/adult/safety change, multiple tabs/sessions, owner loss/restart, and database mutation failure/ambiguous commit. A durable COMMITTED observation must not be presented as proof of current live admission after restart or a failed response. Document the actual linearization point and rollback/reconciliation behavior in an ADR; distributed owners remain unsupported.

M09-05 group capacity and M09-06 cross-world fault browser flows are not implemented. No code worker is continuing in the background; only the owner-facing loopback preview is running.
