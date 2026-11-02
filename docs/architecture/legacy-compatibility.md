# Current contracts and target compatibility

## Identity and HTTP (AUD-03)

| Concern | Deadline actual | Maid actual | Target / bridge |
|---|---|---|---|
| Session | `deadline_session`, random 32-byte base64url token, SHA256 DB hash; 30 days; HttpOnly, SameSite=Lax, Secure in production | users/profiles/sessions tables; no session issuance routes in audited app.ts | Separate city host-only cookie; do not reuse or trust either cookie |
| Bootstrap | `POST /api/v1/guests/session` | not implemented | `/v1/session/guest`; explicit future proof-of-possession migration |
| Profile | `GET/PATCH/DELETE /api/v1/me`, displayName/avatarKey; CSRF hash derived from cookie | schemas nickname/avatar, not implemented endpoints | Allowlisted mapping; no account linking by name/avatar |
| Catalog | `/api/v1/cafes`, `/cafes/:slug/rooms`, `/rooms/:id` | migration/seed catalog only | Registry consumes adapter summaries after policy checks |
| Avatar | fern/amber/indigo/rose/cloud/cocoa/mint/plum | sakura/mint/lavender/amber | Explicit mapping with fallback and consent; never merge identities on avatar |
| Origin | write Origin exact PUBLIC_ORIGIN; CSRF required on profile writes | write Origin exact WEB_ORIGIN; health only | City same-origin guards independently enforced |

Cookie scopes on localhost include all ports: different ports are not isolation. Use distinct names and host-only scope; never set parent-domain cookies. Existing tokens are not sent as URL/query/invite data. No automatic guest migration has occurred. Proof exchange, one-time code, expiry, issuer/audience and replay tests belong to M03/M15/M16.

## Persistence (AUD-04)

Deadline owns guest_sessions, cafes, rooms, focus_sessions (one active per guest, unique guest/idempotency, constrained duration). Guest deletion cascades focus rows. Hourly purge deletes expired guests. Focus SQL exists but no start/finish service is present in snapshot. Maid owns users, profiles, sessions, cafe_templates, menu_items, cosmetic_catalog; SQL runner uses checksums and advisory transaction lock. Sessions have expiry/revocation fields but no runtime purge yet. Planned seven-day chat / thirty-day moderation retention is documentation, not implemented deletion.

No databases imported or mutated by integration. Future migration order: encrypted backup + restore verification; additive city IDs and mapping table per adapter; prove identity ownership; shadow read contract comparisons; feature-flag a test cohort; reconcile counts; retain legacy access until rollback window ends. Rollback disables adapter and removes city routing; preserve original DB/journal. Never run city migrations in legacy DBs. Production migration/backup permissions and retention policy remain owner gates.

## Room and transport (AUD-05)

No authoritative seat/room owner or websocket listeners found in either audited API source. Deadline contracts currently expose HTTP room summaries only, catalog occupancy defaults to zero until owner is mounted. Maid defines room.join/leave/snapshot, seat.claim/release, orders/chat and ACK/event envelopes, but has no handlers. Its envelope lacks schemaVersion/worldId, uses expectedVersion and roomVersion; events use version/occurredAt. City draft uses schemaVersion/worldId and sequence/timestamp. Do not treat these as compatible wire formats. Adapter tests must translate both success and rejection semantics. Deadline raw ws vs city Socket.IO requires a transport facade, not reusing clients unchanged.

Seat rules: Deadline scene-data defines 30 seats, max room 40 in SQL. Maid plan sets 24 Customer + 6 Maid, total <=30; these are not runtime-enforced yet. City room authority must preserve world-specific limits. No legacy order/minigame/focus success can be claimed from schemas.

## Rendering and assets (AUD-06)

| Item | Evidence | Reuse decision |
|---|---|---|
| Deadline coordinates | packages/scene-data/src/index.ts: 960x640, 30 generated positions | Candidate mapping fixture; not production city scene |
| Deadline scene | CafeShell.tsx explicitly says connection under construction | No playable scene to extract |
| Deadline vectors/CSS | docs/ASSET-LICENSES.md ledger | Keep in source repo; owner rights review before redistribution |
| Maid | assets/LICENSES.md: planned original art, no external assets | No shipped sprites to reuse |

City will create code-native original test assets with a provenance manifest in M07. No screenshots or art quality gate claimed in W0.
