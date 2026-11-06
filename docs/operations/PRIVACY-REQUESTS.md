# Suspended-owner privacy requests — N07-03 slice

The portal's `/private/privacy-access` page lets a suspended registered owner request export or deletion without reviving revoked player sessions. Active accounts retain their ordinary signed-in privacy controls; guests retain existing session-expiry cleanup. This slice is locally qualified by its dated evidence; N07-03 still requires event calendar and durable entitlement-bounded runtime controls.

1. The owner submits sign-in name, password, fixed purpose and UUID request key. An identical retry recovers the same pending request and credential. The separate privacy cookie is HttpOnly; production adds Secure and the `__Host-` prefix, with Path `/`, no Domain and SameSite Strict.
2. In Accounts, the operator loads privacy requests for an exact account UUID. Only request identifiers, purpose, status, revision and deadlines appear. Approval requires fresh MFA, Origin/CSRF, expected revision, a fixed reason, an explicit ownership-check attestation and a UUID private-review reference. Declining uses a fixed reason. The reference is a manual attestation, not automatic verification of an external case or legal identity.
3. The owner checks status, then confirms with their password again. Deletion also requires its explicit checkbox. Requests cannot switch purpose or use another tab's request identifier. An export downloads directly to the owner; neither the operator nor the service receives a retained export copy. Existing domain export/deletion owners run within the identity transaction.
4. A completed deletion remains privately retryable after account erasure. Closing privacy access invalidates its token. Account control changes, approval expiry and password changes prevent further approved execution. Approval replay never extends the original window.

The owner endpoints are `POST /v1/privacy/requests`, `GET /v1/privacy/request`, `POST /v1/privacy/complete` and `POST /v1/privacy/close`. They use exact schemas, same-origin POST protection, privacy-specific CSRF and private/no-store responses. The operator endpoints are `GET /v1/operator/privacy-requests?accountId=<UUID>` and `POST /v1/operator/privacy-review`; the admin BFF forwards only allowlisted operator credentials and metadata. There is no operator export/download or deletion execution endpoint.

| Data | Access / retention |
|---|---|
| Pending request and credential | At most seven days; purpose and owner credential are bound |
| Approved execution | At most 15 minutes, bounded by request expiry and current control/password revision |
| Completed, denied or closed receipt | 24 hours from the terminal transition; closing removes credential access immediately |
| Export payload | Generated for the owner; no server-side copy |
| Audit | 30 days by database clock; HMAC request reference, fixed action/reason, redacted before/after state, operator/private-review reference where applicable |
| Authentication bucket | HMAC sign-in reference, failure/lock timestamps; eligible for cleanup after a day without activity |

The API's tracked minute maintenance removes at most 100 expired rows per table per tick. Access deadlines apply even when cleanup is delayed; physical removal may lag during outages or a cleanup backlog. Audit UPDATE/TRUNCATE and early DELETE are denied; expired DELETE retains the digest-head anchor. Application-secret rotation invalidates outstanding privacy credentials/bindings. Preserve protected evidence separately before owner-authorized cleanup; the application audit is not an indefinite evidence archive.

Password verification shares the existing bounded hashing pool. Five failed owner attempts trigger a durable five-minute name lock across peers/instances. HTTP authentication is limited to five attempts per IP and 60 globally per five minutes; creation is limited to three retained requests per owner/day and operator review to 30 decisions/hour. Retry/close paths do not bypass current authority or revive a revoked player token. Exact review replay does not count as a new decision.

Migration 0041 requires strict 41 compatibility. Keep the first 40 migration bytes, audit history and existing data. Roll back by disabling privacy ingress/review access or deploying a separately qualified 41-aware image; an old strict-40 image is not a qualified database rollback. Do not down-migrate production data.

Verification uses synthetic owners/operators, disposable PostgreSQL, browser mobile emulation and local production artifacts. Time-expiry tests use controlled clocks or explicitly expired synthetic rows. They do not demonstrate that days elapsed, certify external ownership review, establish production cleanup SLOs, provision a real operator or authorize a public/private deployment. See `docs/architecture/N07-03-PRIVACY.json` for actual commands, hashes and limitations.
