# ADR0041 — Server-approved appearance for each participant

Status: accepted for local implementation; real world rollout remains OFF.

The previous sandbox renderer applied one visual outfit to everyone. Inventory and staffing are private server state, so a client renderer option cannot establish either entitlement or role.

World definitions now explicitly allow, forbid, or require an active shift for the apron. Missing policy means casual. The server resolves each privacy-visible participant independently from their saved selection, current entitlement and, when required, connected session plus exact voluntary shift/world/room/epoch/membership/policy. Only the effective outfit is projected; inventory and shift records stay private. Existing snapshots that omit outfit render casual. The atlas lab remains an unrestricted local preview.

POST `/v1/me/appearance` requires session, Origin, CSRF, a UUID request key and an exact connected visit. Account-locked selection and durable fingerprint receipt commit together. Replaying an old request observes current state without reapplying its historical selection. No outfit grants staff, admission or reward authority. A postcommit visit change may return a conflict after preference was saved; retry cannot resurrect an old visit.

Migration0024 adds account-cascading selection and receipts. Maintenance deletes at most100 receipts older90days per call; clients must not reuse request keys after that window. Prefer forward repair; removing the new feature leaves older clients safely on casual. No existing rows or legacy databases are rewritten.

Fresh snapshots immediately apply current restrictions. Shift ending/expiry has no dedicated appearance push; existing room reconciliation refreshes every15seconds while active, with transport/queue delays possible. This is presentation latency, never service authorization. Invalid art falls back to existing accessible room controls. Real adapters must declare their policies explicitly. See m13-outfit-checks.json for executed verification, not a public release certificate.
