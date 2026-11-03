# ADR 0013: gated ephemeral room chat

Status: accepted for local M08-02 implementation.

The existing authenticated room gateway has viewer-specific block/privacy projections but no content delivery port. Add strict chat contracts and a trusted RoomService authorization/publish port rather than letting clients select audiences or bypass room authority.

Require validation, shared account budgets and bounded/deadlined moderation before publishing. Use a conservative curated local allowlist with unknown content withheld; do not claim it is a general classifier or automatically sanction users. Retain worker slots for timed-out uncooperative providers. Recheck session/membership/owner/world and viewer filtering after inspection. Use server-authored canned IDs only under explicit fallback policy.

Use volatile ephemeral events without ordinary raw-message persistence. Acceptance is not per-recipient delivery, and bounded five-minute metadata-only deduplication is not durable. Default chat is disabled, and production denies even a trusted enable override. Local fixture tests do not activate a real world. Reports, encrypted evidence, sanctions, human review and public approval are subsequent gates. See CHAT-SAFETY.md for limits and actual evidence.
