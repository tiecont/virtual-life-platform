# ADR0023 - Shared focus engine after readonly Deadline audit

Status: accepted local M10-01 contract/migration decision,not runtime focus implementation.

Deadline source at the audited revision contains focus SQL/schema but no focus HTTP/service/wire commands; the current focus UI is explicitly disabled and stats show no data. Preserve viable Nest/Fastify/PostgreSQL/Drizzle/SQL-journal choices and do not overwrite that repository. Schema existence is not gameplay verification. Source hashes and dirty state are retained; M15 still needs a stable owner-approved revision and redistribution rights.

The city engine owns new account-scoped focus tables and strict contracts. Default durations remain15/25/50min. Start needs current authenticated focus-capable room/seat authority; a persistent timer then continues through leave/disconnect/travel/restart as the Deadline reference requires. Server conditional completion is idempotent and never accepts a browser completed flag or elapsed time. No reward economy is introduced, and completion means elapsed timer rather than proof of productivity.

Pause is optional policy. Deadline remains unpausable; an explicitly allowed mode may add PAUSED/resume semantics using trusted remaining duration and bounded pause expiry. Such state is never silently mapped onto legacy active/completed/cancelled rows. Account uniqueness spans active/paused timers across sessions/tabs. Browser clock/countdown is presentation; finalization uses trusted server timestamps.

Persist UTC instants; summaries use an explicit validated IANA timezone with Asia/Ho_Chi_Minh default and canonical completion deadline for date assignment. Timezone preference changes affect projection,not stored instants or completion multiplicity. Private notes are unnecessary in the initial engine,sharing is separate opt-in,history/export/deletion stays account-owned. No public leaderboard or activity surveillance.

FOCUS-COMPATIBILITY.md defines the planned adapter/import boundary. No legacy migration,source/media copy or account link is performed. Actual M10-02..05 implementation must supply PostgreSQL,clock,reconnect/privacy/UI/timezone evidence before verification. Rollback for this audit is documentation-only; future schema rollback retains additive history and disables entry points.
