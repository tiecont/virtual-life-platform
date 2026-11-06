# Operator identity and session boundary

N07-01 implements a separate singleton human operator in `identity/operator-*`. Player identity, moderator/game roles and telemetry credentials confer no operator authority. Admin UI and business controls remain N07-02/03. Defaults disable operator routes and provision no account.

## Bootstrap

Configure a separate32-byte hex `OPERATOR_AUTH_KEY` and exact `ADMIN_ORIGIN` distinct from `WEB_ORIGIN`, together; production requires HTTPS. Keep the key in the deployment secret system, outside chat/Git/browser bundles. Key loss/change without reviewed re-encryption makes MFA unavailable; it cannot allow another bootstrap.

Build packages/API and run `node apps/platform-api/dist/operator-bootstrap.js INPUT OUTPUT` in the explicit private runtime environment. Input must be a regular file owned by the invoking UID, mode0600, at most4096 bytes; symlink input is rejected. It contains exactly `password` (16–128 characters), `totpSecret` (32 uppercase Base32 characters representing20 random bytes) and current six-digit `code` confirming enrollment. Generate strong credentials through a trusted local tool. Arguments contain paths only; the CLI prints no credentials and never migrates automatically.

Output must be a new private file; it receives the immutable subject and ten random single-use recovery codes with mode0600. Store recovery material securely offline and handle temporary input through the owner's secret process. Concurrent/second bootstrap cannot create another principal. Failed attempts can leave an empty reserved output file. A write failure after DB commit requires inspecting the same identity, not destructive reset. No session is issued and there is no HTTP signup.

## HTTP contract

Paths use `/v1/operator`. Mutation Origin must equal `ADMIN_ORIGIN`; the private admin BFF is N07-02. Player mutations still require `WEB_ORIGIN`. No CORS allowance is added.

| Path | Requirement and result |
|---|---|
| POST `/login` | Password/code; operator metadata and a separate cookie. |
| GET `/session` | Cookie; validates audience, subject, auth version, revocation and both expiry deadlines. |
| POST `/step-up` | Cookie, session-bound `x-csrf-token`, password and fresh TOTP; rotates token. |
| POST `/logout` | Cookie, CSRF and empty body; revokes session and clears cookie. |
| POST `/revoke-all` | Cookie, CSRF, fresh step-up and empty body; advances auth version and revokes all sessions. |
| POST `/recover` | Password, unused `recoveryCode`, different `newTotpSecret` and confirming `code`; preserves subject, replaces MFA, revokes sessions and all old codes. Returns ten new codes once, no session. |
| GET `/audit` | Cookie and fresh step-up; latest100 redacted events. |

Production `__Host-city_operator` has Path=/, Secure, HttpOnly, SameSite=Strict and no Domain. Development/test uses `city_operator`. Random256-bit tokens have only domain-separated hashes stored. Player cookie/signature/response logic stays unchanged. Login allows one active operator session. Step-up preserves absolute deadline:8h lifetime,15min idle,5min elevated access. TOTP uses30s steps, at most one step drift either way, and a durable monotonic counter shared by login/step-up. Wait for the next code after bootstrap/recovery.

Five credential failures cause a durable five-minute lockout across IPs/processes; HTTP also limits authentication per peer and total operator requests. Existing exact proxy trust controls peer attribution. Lockout can temporarily deny the sole operator; it creates no bypass account. Recovery requires the password and an offline code. Lost password/all factors/key needs a separately reviewed process. TOTP is not phishing-resistant; physical enrollment/passkeys are not claimed.

Design references: [RFC6238 one-time validation](https://www.rfc-editor.org/rfc/rfc6238), [OWASP MFA/recovery](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html) and [server-enforced session expiry](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). The exact timeouts and lockout above are this implementation's explicit policy.

## Audit and operational scope

Bootstrap/login/step-up/logout/revoke/recovery audit uses fixed action/outcome enums and before/after auth versions, committed with effects. Credential denials commit lockout evidence. No credential, raw IP, body or recovery value enters audit. Hash links/triggers protect ordinary application operations, not DB-superuser schema changes or external retention. Future business commands must authorize and audit within their effect transaction, never cache an earlier session read.

`pnpm test:admin` runs RFC vectors and actual disposable PostgreSQL/HTTP/TCP/CLI cases; integration/security also include them. All credentials are synthetic. No real operator, admin deployment, external notification/archive, passkey or hosted release follows. See [ADR0116](../adr/0116-separate-singleton-operator-mfa.md). Rollback disables private ingress/config, retains additive schema/audit and uses a compatible qualified image; old strict38 images are not automatically compatible with39.
