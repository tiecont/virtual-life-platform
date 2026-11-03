# Local Moderation Desk and Incident Controls

M08-05 extends the existing assigned-case boundary and committed sanction guard. `/moderation` implements case search, scoped triage, assignment, confidential evidence, reasoned temporary sanction/reversal, independent appeal reading/disposition and per-world incident closure/recovery. No real staff/grant endpoint is introduced. Production case/chat writes and public/real-world rollout stay closed. See the [operator runbook](../operations/MODERATION-RUNBOOK.md).

## Endpoints

All mutations require authenticated session, exact Origin, CSRF, strict JSON and UUID Idempotency-Key under the existing shared HTTP/IP/session budget. Client roles/scopes never authorize a call.

| Endpoint under `/v1` | Server boundary |
| --- | --- |
| GET `/moderation/session` | Current registered unexpired scoped staff grants and own account ID; reportsAvailable is status, not a permission. Available for emergency staff work even without the evidence key. |
| GET `/moderation/cases?world=&category=&severity=&id=&cursor=` | Allowlisted optional conjunctive filters; ordinary staff sees assigned cases; admin sees in-scope triage; page25. No reporter/full-text/global user search. |
| Existing case/detail/assignment/sanction endpoints | Current assignment/role/conflict/evidence/severity/duration checks remain authoritative. |
| GET `/moderation/cases/:id/appeals?cursor=` | Current assigned independent reviewer, excludes issuer; platform appeals require safety-admin. Page25 of private note/original reason/current sanction; expired bodies shown null. Reads are audited. |
| POST `/moderation/appeals/:id/review` | `{decision:'uphold'|'revoke',privateReason}`; current independent assigned reviewer, strict terminal transition with durable retry/conflict. Uphold requires authentic unexpired appeal, case evidence and issuance reason; revoke requires authentic unexpired appeal. No invented findings when evidence is missing. |
| GET `/moderation/controls` | Controls in current granted scopes only. |
| POST `/moderation/controls/:slug` | Registered scoped safety-admin, known registry slug; `{surface:'chat'|'world',closed,reason:'incident'|'coverage-loss'|'reviewed-recovery'}`. Recovery requires a different current admin from the closer. |

An appeal disposition updates only its sanction if revoking, writes a separately encrypted private review reason and append-only audit, records reviewer/time, and commits a durable mutation receipt atomically. Target own receipts show controlled received/upheld/revoked status, not notes/reviewer identity. Identity deletion erases notes tied to an appeal reviewer before unlinking their FK. This is conservative local erasure, not a reviewed legal-hold policy. A false-positive reversal does not remove another active restriction or restore consent/seat state.

## Emergency Authority

The incident overlay is a deny layer queried on every shared world authorization and chat publication. Missing evidence keys do not bypass it or prevent authorized emergency closure. World closure removes all ephemeral memberships/seats for that slug before acknowledgement; chat closure prevents delayed moderation from publishing but leaves other room actions available. No automatic external notifications occur. The overlay does not bootstrap/shutdown resource-owning world modules; trusted-hook lifecycle/cleanup/deadlines remain the M06 activation limitation documented in the runbook. A stalled room hook can delay a queued closure; do not claim success until acknowledgement.

The existing single-authority room queue serializes sanction and incident mutations against join/final publication. PostgreSQL stores durable controls/audit/idempotency. A restart or a missing report key does not reopen a surface. Recovery removes only the emergency deny; the registry base flag/access/version/adult/staff/session/sanction/chat-production gates remain effective. A stale retry returns current control state and cannot re-close a recovered surface. Reopening after the closing actor has been deleted is conservatively denied pending reviewed recovery.

Incident audit uses controlled reasons and HMAC actor digests, no evidence bodies. SQL mutation/truncation triggers reuse the append-only guard. This is not database-owner tamper protection. Metadata TTL/hold/pruning approval and retained-log deletion remain explicit release work, not silently weakened by adding an audit-delete route.

## Desk Privacy and Behavior

The UI uses strict server schemas, native labeled controls, private unframed evidence text with wrapping, a paginated/filterable queue and bounded request/abort handling. Drafts/keys remain only in memory. Retried uncertain actions preserve keys; successful actions refresh current state. Hidden tabs and identity changes clear private desk state and abort older requests; generation checks reject late results. No authority is inferred from visible UI controls. The backend checks permissions on every click/request, including when grants/assignment changed while a page was open.

The target `/safety` exposes only own decisions and current appeal outcome/receipt. Session access stays available while world access is suspended. There is no permanent ban, global evidence export, break-glass/self-promotion endpoint, case-resolution claim or guaranteed response time. Controls appear only for current in-scope admins; having a button does not authorize a conflicting review.

## Migration and Rollback

Additive0007 adds incident control/audit/mutation tables and expands appeal status/reviewer/time, encrypted note purpose and controlled audit/mutation enums. Historical migration hashes are unchanged. Application rollback requires worlds/chat closed while keeping safety tables/committed denies. Never restore a pre-enforcement API against enabled worlds. No production migration or staff activation is performed by these tasks.
