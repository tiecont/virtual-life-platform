# Identity API v1 — guest/privacy slice

All routes same-origin under /v1. Browser uses trusted Next rewrite; internal API URL never comes from a request. Production TLS/edge configuration remains M21/release work. Every mutation requires exact WEB_ORIGIN. Signed cookie is HttpOnly, host-only and contains no account claims. No CORS wildcard.

| Route | Body / authority | Result / duplicate semantics |
|---|---|---|
| POST /session/guest | strict displayName, avatarKey, random requestId | Me; 201 first, 200 duplicate/current browser; conflicting key 409, expired/deleted bootstrap 401 |
| GET /me | signed active city cookie | own public profile, account kind, session expiry, CSRF; no private preferences |
| PATCH /me | nonempty partial profile; cookie + CSRF + Idempotency-Key | Me; duplicate same normalized input returns original profile; forged ID/role rejected |
| GET/PATCH /me/privacy | GET cookie; PATCH complete strict choices + CSRF/key | own private choices; hidden/false defaults; no public dating override |
| GET /me/export | active cookie | own profile/choices/consent receipts only; no credential material |
| POST /session/rotate | empty body, cookie + CSRF/key | same identity/new signed cookie; old token invalid; same old request retry returns new active session |
| POST /session/logout | empty body, cookie + CSRF/key | revoked session + cleared cookie; duplicate old cookie/key accepted within receipt lifecycle |
| DELETE /me | empty body, cookie + CSRF/key | cascade identity data, clear cookie, anonymous 24h deletion receipt |

Server-created IdentityContext is derived from DB. No HTTP body can set actor, staff role, age proof or restricted permissions. Unknown routes remain unavailable. Guest creation capped at 10/IP/min; writes 60/token/min and API 300/IP/min. Limiter key map bounded to 10,000 and fails closed on saturation. No X-Forwarded-For trust configured; actual edge/proxy rate policy must be verified before public deployment.

Errors use contracts ApiErrorSchema with safe code/message/requestId, no body/credentials. Strict Zod rejection is 422, unauthenticated 401, origin/CSRF 403, duplicate conflict 409, limits 429, service/database failure 503. Cookies, passwords, tokens, request body and query contents are excluded from app logging. No auth secrets in browser storage or URL; transient bootstrap retry key is discarded after success.

Guest/registered upgrade/login NOT IMPLEMENTED at this checkpoint; the kind enum reserves registered for the next slice. No legacy shared login, room membership, social relationship, socket or travel functionality claimed. Optional privacy consent is stored, but no external analytics collector connected.
