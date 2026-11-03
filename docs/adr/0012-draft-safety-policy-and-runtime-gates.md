# ADR 0012: strict draft safety policy without implied activation

Status: accepted local policy definition, M08-01. Runtime moderation/reporting/sanctions are separate tasks.

Audit found working identity/session guards, bilateral social block and viewer-filtered room/profile/motion projections, bounded command queues and a registered event allowlist. It found no chat/report/case/sanction/appeal storage, moderator identity assignment, encryption/retention jobs or staffed workflow. Existing transport security is not a content moderation pipeline. The detailed threat/escalation model records each current control and future gate.

Use a versioned strict `SafetyPolicySchema` and committed `config/safety-policy.json` as the local policy definition. Cover all nine product contexts, twelve case categories, severity/allowed sanction categories, draft response/duration/retention bounds, confidential evidence, independent appeals and unassigned escalation roles. Unknown policy fields and unsafe fallback/disclosure/auto-sanction defaults fail validation. Keep reviewed-adult/isolated dating and staffed Lounge constraints, while permitting stricter silent/no-media closure. No client or costume supplies staff authority.

Public release, operator coverage and retention approval stay false; chat defaults OFF, unsolicited DM/unlicensed media/unreviewed classifier sanctions stay forbidden. Draft retention and triage values are engineering targets pending owner review, not legal advice, a public promise or an active job. Policy role names do not create privileged accounts. No external messages are automatic. No new sensitive input collection is authorized.

M08-02 must consume these rules on authenticated bounded server commands with validation/moderation before any delivery, safe canned or denied outage fallback and current recipient/block checks. M08-03..06 implement confidential evidence/audit/RBAC, actual sanction/appeal transitions, moderator/kill-switch workflows, purge jobs and false-positive/security testing. Each receives actual verification before being marked complete. All real world rollout flags stay OFF; local policy verification does not open social production.

No migration/runtime activation in this task. Rollback its local commit if policy changes require redesign. Owner review for operational contacts, age/privacy/retention and restricted/public rollout remains the existing B-003 release gate and does not block local implementation.
