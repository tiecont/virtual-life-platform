# Persistence and transaction boundaries (M02-02/03)

Current local migrations 0001–0004 include foundation, identity and social; table owners are listed in ownership.json and verified against actual SQL. No production/legacy migrations have been applied. Future tables use owner prefixes or schemas and are added by additive, checksum-verified migrations; the owner map must be updated in the same change. The current database is independent from both source apps. Never point the city migration command at their databases.

| Operation | Transaction / authority | Retry and rollback |
|---|---|---|
| Session issue/rotate/logout | identity transaction; unique token hash; rotate revokes old token atomically | idempotency keyed by authenticated actor/request, no client-chosen actor |
| Profile/private choices | identity transaction and allowlisted public projection | version/ETag or explicit latest-write policy; private records never global events |
| Friend/block | social transaction with ordered pair uniqueness; reciprocal consent | one accepted relationship; block invalidates contact/presence cache immediately |
| Seat/room | single owner serialized in memory; owner epoch + lease | retry same request gives same outcome; restart interrupts memberships and requires resync |
| Travel | scoped intent + destination reservation/confirmation before source release | serialize per actor; no dual active membership; consume once, retry idempotently |
| Focus | DB unique active actor/idempotency; trusted timestamps | complete once; deadline interruption visible, no fake successful completion |
| Order/reservation/reward | row locks/unique constraints and atomic state transition + ledger | duplicate claims/completions cannot double assign or reward |
| Report/sanction | restricted RBAC; evidence/audit + action committed transactionally | no unsafe text broadcast before validation; append-only action history |

Initial monolith can invoke post-commit in-process notifications and resync clients on lost notification. Critical cross-service persistence later requires transactional outbox + idempotent consumers, not best-effort broadcasts. SQL constraints remain last-line invariants; Socket.IO adapter is never the persistence layer.

Migration rollout order: foundation → identity → social/registry → rooms contracts → moderation → travel → shared engines → adapters → expansion worlds. Module DAG may run independent engine/infra tasks when prerequisites are verified. Migrations are forward-only in shared environments. Tests use disposable schema/DB and assert partial DDL rollback; production needs encrypted backup and restore drill before any approved migration. Destructive down migration is not an automated release step.

Legacy strategy: concrete route/cookie/schema/event differences are in legacy-compatibility.md. No account linking by display name. Add per-source external-ID mapping only after ownership proof. First read-only contract comparison, then feature-flagged cohort; original guest token remains in original context. Keep old DB/journal and histories intact. Rollback disables adapter routes, invalidates city travel to affected destination, returns users to safe lobby and leaves original service available. No legacy data transformed at W0.

Retention targets from product analytics/content policies are provisional until implementation and operator review. Deletion/export coordinates owners through service APIs; restrict evidence retention by reviewed legal necessity, never silently delete an audit trail. Restricted dating storage has independent access and retention policy; no raw identity documents by default.
