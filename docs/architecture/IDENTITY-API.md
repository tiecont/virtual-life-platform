# Identity API v1 — guest, registration and privacy

All routes same-origin under /v1. Browser uses trusted Next rewrite; internal API URL never comes from a request. Production TLS/edge configuration remains M21/release work. Every mutation requires exact WEB_ORIGIN. Signed cookie is HttpOnly, host-only and contains no account claims. No CORS wildcard.

The local-only optional [Deadline association](DEADLINE-IDENTITY.md) adds GET/POST/DELETE `/me/legacy/deadline`. It requires a current city session and explicit consent with actual source-cookie proof for linking;withdrawal needs no source access. It never issues a city login or merges identities. Its private metadata appears only in own-data export;city erasure leaves the separate legacy history intact.

| Route | Body / authority | Result / duplicate semantics |
|---|---|---|
| POST /session/guest | strict displayName, avatarKey, random requestId | Me; 201 first, 200 duplicate/current browser; conflicting key 409, expired/deleted bootstrap 401 |
| POST /session/upgrade | active cookie + CSRF/key; strict loginName/password | same account becomes registered; old sessions revoked; idempotent original upgrade while target session active |
| POST /session/login | strict loginName/password/requestId; exact Origin | verified credentials required on each retry; new signed cookie, prior browser session revoked |
| GET /me | signed active city cookie | own public profile, account kind, session expiry, CSRF; no private preferences |
| PATCH /me | nonempty partial profile; cookie + CSRF + Idempotency-Key | Me; duplicate same normalized input returns original profile; forged ID/role rejected |
| GET/PATCH /me/privacy | GET cookie; PATCH complete strict choices + CSRF/key | own private choices; hidden/false defaults; no public dating override |
| GET /me/export | active cookie | own profile/choices/consent receipts only; no credential material |
| POST /session/rotate | empty body, cookie + CSRF/key | same identity/new signed cookie; old token invalid; same old request retry returns new active session |
| POST /session/logout | empty body, cookie + CSRF/key | revoked session + cleared cookie; duplicate old cookie/key accepted within receipt lifecycle |
| DELETE /me | empty body, cookie + CSRF/key | cascade identity data, clear cookie, anonymous 24h deletion receipt |

Server-created IdentityContext is derived from DB. No HTTP body can set actor, staff role, age proof or restricted permissions. Unknown routes remain unavailable. Guest creation capped at 10/IP/min; writes 60/token/min and API 300/IP/min. Limiter key map bounded to 10,000 and fails closed on saturation. No X-Forwarded-For trust configured; actual edge/proxy rate policy must be verified before public deployment.

Errors use contracts ApiErrorSchema with safe code/message/requestId, no body/credentials. Strict Zod rejection is 422, unauthenticated 401, origin/CSRF 403, duplicate conflict 409, limits 429, service/database failure 503. Cookies, passwords, tokens, request body and query contents are excluded from app logging. No auth secrets in browser storage or URL; transient bootstrap retry key is discarded after success.

Registered upgrade/login implemented and verified with actual HTTP/PG and desktop/mobile browsers. Guest identity remains optional. Sign-in names are normalized ASCII and separate from public nickname; passwords are untrimmed 12–128 characters, salted scrypt with bounded concurrent KDF work. No password recovery available. Registered accounts persist across session expiry until explicit deletion; session cap is 10 active per account, oldest creation-order first. Anonymous login requests are capped at 5/IP/min. No legacy shared login, room membership, social relationship, socket or travel functionality claimed. Optional privacy consent is stored, but no external analytics collector connected.

Readiness now checks that all migration filenames bundled with this API build appear in the city journal, as well as schema compatibility v1. A foundation-only database no longer counts as ready for the identity API. This is tested on a partially migrated real database; no claim that TCP connectivity alone is readiness. Migration 0003 adds credentials/login receipts, revocation reason and monotonic DB session creation order for deterministic eviction when timestamps tie.
