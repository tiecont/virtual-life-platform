# Context, containers and module ownership (M02-01)

Current executable container: Next portal status page → Nest/Fastify API → independent PostgreSQL. This is the verified foundation. All gameplay modules below are target boundaries, not existing features. One API process is a modular monolith, not microservices. Pixi/Socket.IO are not yet mounted.

```mermaid
flowchart LR
  Browser[Browser: DOM controls and future Pixi scenes] --> Web[Next portal / shared shell]
  Web --> API[Nest Fastify modular monolith]
  Browser -. future authenticated Socket.IO .-> API
  API --> Platform[Platform service interfaces]
  API --> Engines[Shared engine service interfaces]
  API --> Adapters[World adapters]
  Adapters --> Platform
  Adapters --> Engines
  Platform --> DB[(City PostgreSQL)]
  Engines --> DB
  Adapters -. future verified compatibility facade .-> Legacy[Independent legacy APIs and DBs]
```

Dependency direction: apps compose services; worlds depend on public service ports and shared contracts/SDK; engines know no specific world UI; platform identity/privacy/moderation own authority; contracts import no app/domain/world/SDK; SDK depends on contracts. Neither world imports another world's repositories. No cross-app source imports. Package/manifest guards are executable in scripts/check-boundaries.mjs and regression tests.

| Owner | State / service authority | Consumers |
|---|---|---|
| Platform foundation | platform_metadata, city_schema_migrations | API readiness / migration runner |
| Identity | accounts, sessions, profiles, private choices, consent; server IdentityContext | auth guards, social/admission services |
| Social | friendship state, confidential directional blocks | invite, presence recipient filter, moderation |
| Registry | catalog activation and capability metadata | discovery, authoritative admission |
| Rooms/presence | in-memory membership/seat/version/connection lease, single room owner | sockets, travel, safe summaries |
| Invitations/travel | one-time intents and consent/invite transitions | portal, room owner; no arbitrary redirects |
| Moderation | reports, sanctions, immutable audit, role scopes | pre-broadcast guard, admissions, operator UI |
| Focus engine | trusted sessions and scoped aggregates | Deadline/Library through engine API |
| Hospitality engine | menu/order/shift transitions, idempotent completion | Maid/Restaurant/Lounge via policy |
| Events/progression | booking/holds/RSVP; unique reward ledger | eligible worlds, discovery |
| World module | maps/art/NPC/config and world-scoped progression | explicitly declared platform/engine APIs |

Code locations are incremental: API owns composition and first persistence implementations; extract domains only when a real module is implemented. Do not create empty directories and call them complete. M05/M06/M09 own final world/lifecycle/room/travel wire schemas and compatibility tests. M02 port sketches below describe service responsibilities, not a frozen HTTP/socket contract.

## Service port responsibilities (M02-02)

- IdentityPort.authenticate(opaqueCredential): server-issued account/session context or denial; never accept accountId/role/age supplied in a command body. Session rotation/revocation notifies active transports. Public profile is an allowlisted view, distinct from private preferences and restricted profile.
- RoomAuthority.admit(context, destination, requestId): authoritative membership lease/snapshot after access + capacity checks. claimSeat/releaseSeat require current context/membership and idempotency. snapshot includes owner epoch and monotonic per-room sequence.
- WorldAdapter.bootstrap/onJoin/onLeave/onCommand: validated contract envelope and guarded service ports. Cannot bypass IdentityPort, RoomAuthority or SocialPolicy; no database handles exposed to clients/world adapters.
- SocialPolicy.canContact / canViewPresence(viewer, subject, world): applies bilateral blocks, friendship/consent, per-world visibility and restricted-world isolation. A shared account does not authorize disclosure.
- EventPublisher.publish: versioned payload, aggregate ID/sequence, eventId/time and safe recipient classification. Critical persistent effects are committed transactionally before notification; at-least-once consumers dedupe unique source keys. No exactly-once delivery promise.

## Trust boundaries / threat model

Untrusted browser payload → strict contracts → server session/origin/CSRF or socket-origin guard → membership/access/rate policy → authoritative service → minimal response to authorized recipients. DB credentials stay inside API; session hashes and private choices are not broadcast. Moderator role is server-scoped, never Maid/host role. Block/report records remain private. Dating identifiers/preferences/active presence never enter public catalog, analytics labels or friend feed by default. Unknown age denies restricted access across HTTP, socket, travel and deep links. Kill switches also apply at server edges, not only UI.

No multi-instance runtime, Redis, external auth provider, realtime gateway, moderation pipeline or migration bridge is claimed by this design. See ADR 0003, FUTURE-OWNERSHIP and the concrete legacy compatibility matrix.
