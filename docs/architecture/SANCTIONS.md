# Local Sanctions and Appeals

M08-04 implements temporary, human-issued sanctions against the subject of a confidential assigned case. Real/public world flags and production staff/report/chat writes remain closed. No staff is provisioned and there is no self-promotion route. This implementation does not approve a public service or legal/retention policy.

## API

All paths are under `/v1`; authenticated writes require exact Origin, CSRF and a UUID Idempotency-Key. JSON inputs are strict. Neither subject ID nor arbitrary scope, severity, authority or permanent duration can be supplied by clients.

| Method / Path | Access and result |
| --- | --- |
| POST `/moderation/cases/:id/sanctions` | Assigned registered staff with current world grant; `{kind,durationMinutes,privateReason}`. Case supplies subject, category, severity, world and server-recorded room. |
| GET `/moderation/cases/:id/sanctions` | Same assigned-case access; bounded summaries without reporter or private reasons. |
| POST `/moderation/sanctions/:id/revoke` | Independent current assigned reviewer, distinct from issuer; `{privateReason}`. Platform reversal also requires safety-admin. |
| GET `/me/sanctions` | Own bounded summaries and own appeal receipts, including when banned or evidence-key access is unavailable. |
| POST `/me/sanctions/:id/appeal` | Subject only, within policy deadline; `{note}`; private receipt. |

Issuance requires nonexpired authenticated case evidence and policy-allowed sanction kind for the case severity. Platform bans and actions against registered staff require an assigned safety-admin. Reporter/subject conflicts and staff-abuse rules remain enforced by ReportService. Durations are positive whole minutes, bounded by policy: mute24h, world-ban/eject/warning168h, platform-ban720h. Permanent restrictions have no API. Assigned admins do not bypass the independent-reversal rule. A new explicit issue is needed for an extension; revoking one restriction does not erase another active restriction.

Private reasons and appeal bodies are AES-256-GCM encrypted with the separate local evidence key, authenticated to each unique note ID and key/schema. Subjects see controlled category, kind, scope, dates and state, never reporter/issuer IDs or staff notes. Audit records controlled action/reason codes and HMAC actor digests, not note bodies. SQL audit mutation/truncation guards continue to apply; the database owner can bypass them and is outside this guarantee.

## Enforcement and Ordering

The shared world admission policy queries committed restrictions on every authorization. Platform bans close all world admission/catalog/direct SDK dispatch; world bans close the case world only. Room ejection prevents rejoining the recorded room until expiry, including explicit room ID and previous join retries; another room/world is not a world ban. Mutes apply to chat/text/canned/emote in the case world, across tabs and sessions. Other-world mute behavior is deliberately scoped, not a platform-wide mute. Ban enforcement is independent of the evidence key, production review gates and report availability. Database errors fail the activity rather than bypass policy.

Issuance and revocation enter the same bounded authoritative room queue as joins, room commands and final chat publication. The sanction transaction commits before affected memberships and seats are removed across all account connections, then the HTTP response is acknowledged. Moderation runs outside this queue; publication rechecks committed policy inside it after moderation and projection. No chat publication can interleave a commit in this supported single-owner process. A join already in a trusted hook completes before the queued issue; after issuance acknowledges, its membership has been removed. Identity session access remains available for own decisions, appeal, export and deletion.

Account-scoped `sanction.changed` contains only `{schemaVersion:1}`. It is a refresh hint, not a delivery guarantee or a grant. Room interruption reuses existing `room.ended` with `world-unavailable`; no reporter/case detail enters room events. Expiry and revocation are evaluated from authoritative timestamps on each request, without waiting for a scheduled sweep. Removed memberships/seats are never automatically restored; the user must request fresh admission. Retried issuance returns the current sanction state and cannot reactivate a revoked/expired sanction.

This relies on M06's one room owner per database schema. No distributed fencing, arbitrary direct database edits or multiple live room authorities are supported. Trusted world hooks can still stall room work; resource-owning cleanup/deadlines remain the documented M06 activation limitation. M09 travel does not exist yet; its target-admission implementation must call the same guarded registry and add actual travel-bypass tests before M09 verification.

## Durability, Privacy and Limits

Migration0006 adds sanctions, encrypted notes, appeal receipts and durable mutation receipts, and expands controlled audit codes. Transactions serialize actor/subject account locks and case/sanction rows; retries/conflicts are persistent across sessions/restarts. New issuance is bounded to30/actor/day; appeal intake to5/subject/day and one appeal per sanction. A same-key same-body retry returns the original appeal receipt after an interrupted response; a new-key second appeal or altered body conflicts. These are local limits, not operational staffing capacity evidence.

Encrypted notes have policy TTL and bounded100-row purge. Identity deletion/guest expiry erases notes associated with subject/issuer/case participants before unlinking identities; body-free audit remains. Export includes only own sanction summaries/own receipts, excludes reasons and third-party allegations. Metadata retention, legal holds, rotation/KMS, recovery and approval of deletion policy remain M08-06/release work. Lists return at most100 entries and explicitly signal sanction truncation; pagination and long-history operational handling remain limitations. Appeal intake is implemented; independent human appeal reading/disposition and moderator UI remain M08-05.

`/safety` restores the authenticated identity, shows current dates/category/scope and private receipts, and submits appeals. It preserves unchanged draft/request keys after uncertain delivery, bounds/aborts requests, clears private state on identity changes, refreshes on visibility/manual action and uses native labeled forms. No password, report body or note is persisted in browser storage.

## Migration and Rollback

Apply additive migration0006 locally using `pnpm db:migrate`; historical migrations/checksums are unchanged. Disposable PostgreSQL tests apply it through the real migrator. Roll back application activation by disabling worlds/chat/review access, retaining the new tables/audit. Do not drop safety tables or deploy an older API that omits committed-ban enforcement while worlds are enabled. Data removal, production migrations or legal holds require owner-approved procedures.
