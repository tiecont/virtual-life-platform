# Local Moderation and Incident Runbook

This runbook describes implemented local controls. It does not establish a staffed public operation. Named operator, safety lead, privacy owner, coverage, legal/age review, approved retention/contact and public activation are absent. Real-world rollout flags remain OFF; production case/chat writes remain closed. Do not provision real staff or activate public worlds as part of this implementation.

## Before a Local Review

Use `/identity` for the separate registered reviewer account and `/moderation` for the desk. The server requires a currently registered account with an unexpired world-scoped `safety_staff_grants` row. No grant/create-role UI/API exists. Synthetic test fixtures provision disposable grants solely in test databases. Any real staff provisioning needs a reviewed owner process, named scope, expiry and independent oversight; never elevate an account because it chose a staff costume/name.

Check `/health/ready`, DB migrations, local evidence-key availability and allowed world flags. Emergency closure needs DB/session/staff authorization but deliberately does not require the evidence key. Case reading and reasoned sanctions need the separate confidential evidence key; a missing/wrong key must not bypass already committed restrictions. Do not print/copy keys, cookies, evidence or personal data into logs, issues, chats or terminal transcripts.

## Triage and Case Work

1. Search the desk by world, category, severity or exact case ID. Page with Next cases; Search starts again. Ordinary moderators see assigned cases only; safety-admin sees in-scope triage summaries. A summary is not permission to read evidence. Guest, expired, wrong-world and reporter/subject-conflicted reviewers are denied.
2. A scoped administrator assigns the case to a registered current reviewer using the reviewed account UUID and a controlled reason. Reporter and subject cannot review their own case. Suspected staff abuse requires an independent safety-admin. Admins must assign themselves before reading evidence; infrastructure ownership alone grants no review permission.
3. Review the confidential note and any bounded server-recorded message references. The desk marks reports as allegations, not findings. Evaluate context, consent, Vietnamese/unaccented slang, quoted language, platform blocks and possible mistakes. A report count/classifier score is not guilt. Never paste evidence into public room chat or exports.
4. For a supported temporary action, choose kind/duration and record a specific private reason. Subject/category/severity/world/room come from the assigned case. The server rejects arbitrary targets, invalid kinds/severity, permanent bans and excessive duration. Platform bans and actions against staff require safety-admin. Unknown/expired evidence blocks new issuance.
5. Confirm the HTTP result and current restriction list. Accepted-but-interrupted responses can be retried unchanged using the preserved request key. A failed/timeout display is unconfirmed, not proof nothing committed. Refresh before trying a different action. Revocation needs a different current assigned reviewer and a private reason; it never restores former friendships, seats or consent.

There is no anonymous global user/evidence search, DM, role self-promotion, automatic classifier sanction, case export, blanket staff access or permanent-ban UI. Case status closure and metadata retention are separate M08-06 work; do not describe an open case as resolved merely because a sanction was issued.

## Independent Appeals

The target can visit `/safety`, read controlled own decisions, submit one private appeal per restriction within its deadline, retry uncertain delivery and retain a receipt. Session/export/delete access remains available while world access is suspended. The receipt is intake acknowledgement, not a promised human response time. No public appeal service/contact is approved.

Reassign the case to a current reviewer different from the issuer. The issuer cannot read the appeal through the review endpoint or decide it. Platform appeals require another safety-admin. Read the available original private reason, appeal text and case evidence in the desk; expired bodies are shown as unavailable. Preserve confidentiality when a note self-identifies a reporter. Record an independent private reason and choose uphold/revoke. One terminal disposition and append-only audit commit together; repeated same-key requests do not duplicate the action. Revoke removes this restriction only. Existing separate restrictions still apply. An own-account refresh hint contains no evidence; the target page exposes only controlled result/receipt/state.

If supporting context is incomplete, do not invent findings. Escalate to the owner under the current closed local operation, maintain conservative closure, and document the missing context. Reviewed legal holds, extension/shorten/change workflows, independent review staffing and authorized break-glass are not supplied by this runbook.

## Emergency Closure

1. An in-scope safety-admin selects a registered world and Chat or World admission, with Incident or Coverage loss reason, then closes the surface. Closure commits durably before acknowledgement. World closure removes every live/grace room membership and seat in that world; clients receive a truthful interruption. Chat closure prevents text/canned/emote delivery, including moderation already in flight, while room activity remains available if otherwise allowed.
2. Verify affected deep-link/socket joins or chat are denied and unrelated scoped worlds remain available. Verify `/health/ready` and DB reachability. Policy-query failure denies the activity. A closed flag persists over restart and missing evidence key. Keep all base rollout flags closed for unapproved worlds. No external alerts/messages are sent automatically.
3. For a stalled trusted world hook, the authoritative room queue may be unable to finish closure promptly. Do not claim success without acknowledgement. Keep edge access closed using the owner-controlled local process/flag procedure, stop the owning API gracefully if possible, and restart only with worlds disabled. Resource-owning hook shutdown/deadlines are an M06 activation limitation; removing ephemeral membership alone is not a certificate that external resources were cleaned up. Never run a second room owner or force a production migration to work around this.
4. Review the controlled incident audit. It stores world/surface/state/reason/time and actor HMAC digest, never raw evidence. SQL UPDATE/DELETE/TRUNCATE is rejected. This is not database-owner tamper protection. DB backup/recovery and real operational monitoring remain release gates.

## Recovery and Rollback

A different currently scoped safety-admin completes independent recovery review and clears the emergency closure. The initiating actor cannot reopen it. An old idempotent closure retry returns current state and cannot undo reviewed recovery. Recovery only removes this emergency deny; it never enables a feature flag, restricted/18+ permission, moderation provider, staff grant, scene version, platform sanction or production chat gate. Confirm approved base flags and fresh admission separately. Old memberships/seats are not resurrected.

If the initiating account was deleted and cannot be independently attributed through the application linkage, automatic recovery is denied. Keep the surface closed pending an owner-reviewed recovery procedure. Do not rewrite incident audit or bypass gates with unreviewed SQL. No break-glass endpoint exists.

Migrations0006/0007 are additive to city storage; historical checksums remain unchanged. For app rollback, disable worlds/chat and preserve safety tables/audit. Do not run an older API lacking committed ban/incident enforcement against enabled worlds. Metadata erasure/legal holds, verified backups/restores, key rotation and production operations require separate approval/evidence.

## Evidence and Release

Save command, exit code, SHA, test/artifact path, actual scope and remaining limitation in docs/agent checkpoints. Use synthetic data in screenshots. Public release requires human coverage/appeal/incident ownership, privacy/retention/contact and reviewed age controls plus the other W1/W2 gates; a passing local test does not approve any of them. Never issue unrequested external messages or production actions from this runbook.
