# ADR0116 — Separate singleton operator identity and MFA

Date: 2026-11-06. Status: implemented for local qualification; deployment remains separate.

Keep player identity, moderator grants and telemetry credentials unchanged. Add a distinct immutable operator UUID with a database singleton constraint, provisioned only through a private out-of-band CLI. There is no HTTP signup or player-role promotion. MFA recovery keeps the same subject and invalidates sessions and old recovery codes.

Use the existing bounded scrypt password hasher plus RFC6238 TOTP. Consume a monotonic TOTP counter transactionally with session issuance/rotation. Encrypt the seed with a separate key and subject-bound AES-GCM; store session/recovery hashes. TOTP is susceptible to phishing; passkeys and physical enrollment remain separate work. Recovery needs the password and an offline code; it cannot recover a lost password/key by creating another operator.

Require separate exact admin Origin, independent host-only HttpOnly/SameSite-Strict cookie, CSRF, durable credential lockout and bounded HTTP limits. Absolute lifetime8h, idle15min, step-up5min. Fresh MFA rotates the token without extending absolute lifetime; every use checks revocation/expiry.

Append allowlisted authentication events with keyed hash chaining and DB triggers rejecting update/delete/truncate. Exclude credentials, raw IP and request bodies. This is not an off-host immutable archive and cannot constrain a DB superuser changing schema/triggers. External notifications, retention, backups, key custody and private ingress require separate operational qualification.

Migration0039 adds four identity-owned tables and triggers. Keep first38 SQL bytes and one journal; current policy stays strict39. No old38 image qualification or down-migration follows. Rollback disables operator ingress/config, retains schema/audit and uses a qualified compatible image. Authentication does not grant release entitlement, safety/media/adult approval or cluster authority. Defaults remain disabled and no real operator is provisioned by migration/tests.
