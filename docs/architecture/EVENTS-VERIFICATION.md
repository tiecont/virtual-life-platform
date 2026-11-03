# Event and reservation acceptance evidence

M12 validation uses disposable local PostgreSQL schemas with real authenticated HTTP/TCP requests and Socket.IO admissions. Tests are in tests/integration/events.test.ts; schemas and clock reducers are also tested in events/lifecycle.unit.test.ts. Synthetic resources are explicitly named as fixtures. No Restaurant/Lounge adapter or new event-management UI is implied.

| Requirement | Executed scenario / evidence |
|---|---|
| Zero RSVP oversell | Twenty actual TCP accounts race capacity2;2success/18conflicts; receipts/account uniqueness checked |
| Table exclusivity | Twelve TCP accounts race a table;one hold; eight confirmation retries produce one receipt |
| Resource overlap | Six trusted simultaneous schedule attempts produce one slot; adjacent windows accepted |
| Deadline precedence | Exact hold TTL, clipped startsAt, confirmed no-show expiry; SQL lock wait crosses RSVP deadline |
| Timezone change | New M12-06 spring/fall cases adjust UTC display zone to America/New_York before consent; absolute instants unchanged |
| DST and network sessions | Two independent signed sessions with separate live Socket.IO connections race a table via TCP; confirm/cancel/expiry/replacement/check-in across spring gap and repeated fall hour |
| Check-in admission | Actual attached session/epoch/room/membership required; forged/foreign/stale denied;20occupant room-full cannot be bypassed |
| Durable retry/restart | Exact-key hold/confirm/check-in/RSVP/invitation/cancel receipts; old keys do not recreate allocation/membership |
| FIFO consent | Explicit bounded queue/claim/confirm; no automatic booking or queue jump; expired/withdrawn entry cannot renew via old key |
| Atomicity | Injected receipt/notice/block/opt-out failures roll back their state and allocations together |
| Permissions | Registered scoped organizer/performer grants and separate M08 moderator cancellation; no self-promotion |
| Privacy | Private events absent from global catalog; pending inbox preview only; acceptance separate from RSVP/table/room; seeded adult event denied |
| Consent withdrawal | Opt-out/block/unfriend revoke accepted private access and private bookings; re-enabling does not restore grants |
| Notifications | One private cancellation notice per participant, including invited accounts; version-only postcommit hints; no delivery/read guarantee |
| Privacy lifecycle | Bounded own export; account/event erasure cascades;100+5 terminal cleanup and fair20batch observation |

M12-06's two sessions are independent local network clients, not physical-device/browser booking UI certification. Existing desktop/mobile scene/travel/social/invitation/safety regressions are recorded separately in earlier M12 evidence. No benchmark, production CCU, browser timezone-picker, real staff coverage, media approval, interactive audience or public release is certified here. Interactive audience remains schema/SQL denied. Actual worlds and release operations retain their dependency/gate requirements.

Canonical commands, failures and full-check exit artifacts are in m12-regression-checks.json and the earlier m12-*-checks.json files. The initial combined DST tests attempted to free a CHECKED_IN allocation; the model correctly retains historical attendance until end. The corrected scenario releases CONFIRMED consent first, verifies a replacement hold expires, then confirms/checks in a new allocation. Runtime semantics were not relaxed to pass a test.
