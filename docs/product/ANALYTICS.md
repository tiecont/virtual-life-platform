# Minimal event taxonomy and retention targets

No external analytics by default. Aggregate counters have no user identifiers or free text. Optional return measurements require explicit local consent and a resettable pseudonymous key; no cross-world dating tracking. These are implementation targets, not claims of active collection or legal compliance.

| Event | Source / dedupe | Allowed properties | Consent / retention |
|---|---|---|---|
| portal_view | client, per view id | schemaVersion, outcome | optional analytics; raw 7d, daily aggregate 30d |
| guest_created | server, account transaction | schemaVersion, outcome | essential operational count only; no ID in aggregate |
| world_admitted | authority, admission id | schemaVersion, publicWorldClass, outcome | optional analytics; restricted worlds excluded |
| travel_finished | authority, request id | schemaVersion, outcome, latencyBucket | operational aggregate, no source/target identifiers |
| activity_completed | engine, unique source id | schemaVersion, activityClass, outcome | optional; no task description, order/chat text |
| invite_responded | service, invitation transition | schemaVersion, outcome | operational aggregate, no recipient IDs |
| safety_action | moderation audit | controlled action code; restricted record ID in private audit only | operational necessity, restricted RBAC; target 30d evidence retention pending review |

Never collect nickname, IP, tokens, chat, real name, precise location, dating preferences, restricted world presence or raw URLs in analytics. Avoid high-cardinality labels. Consent withdrawal stops optional collection and deletes raw optional records; delete/export hooks must handle pseudonymous keys. Deduplication keys stay private, TTL bounded to purpose; daily aggregates cannot expose small dating cohorts. Retention jobs must be tested in implementing modules. Public retention policy and abuse contact require owner review.
