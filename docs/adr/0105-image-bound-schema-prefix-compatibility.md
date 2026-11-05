# ADR 0105 — Image-bound schema checksum prefix and expand/contract

Date: 2026-11-06. Status: accepted for N02-04 local implementation.

Readiness previously required the database journal to equal the running image's entire migration manifest. That correctly rejected unknown schemas but prevented rolling back an image after an additive migration, even when the older runtime had been tested against it.

Keep exact matching as the default. An optional `SCHEMA_COMPATIBILITY_FILE` declares a bounded, ordered checksum prefix anchored to the image's migration digest. The minimum equals that image's migration count; the maximum equals the complete declared list. An expanded window must include the image's unchanged prefix, explicit suffix checksums and an evidence review reference. Missing, malformed, mismatched or unsupported configuration fails startup. Unknown history, holes, altered old or suffix checksums, and incompatible metadata fail readiness. Liveness remains independent, as before.

The same policy constrains migration preflight under the existing transaction and advisory lock. Fresh/partial known prefixes can advance using only SQL carried by that image. An older qualified migrator may replay its existing prefix against the declared expanded database; it never executes absent suffix SQL, deletes history, or down-migrates. A strict older migrator rejects the expanded database. Historical checksums, SQL rollback, one journal and metadata version 1 remain intact. Migration count is not the protocol/metadata version.

Use expand first: additive changes must preserve old readers/writers, defaults and constraints. Test the exact previous runtime image against the expanded schema, including identity/socket behavior and code rollback. A later contract change requires a separately reviewed phase after old readers/writers are retired and a backup/restore/recovery gate is satisfied. A checksum list or `reviewRef` is trusted deployment configuration, not semantic proof or a signed approval. No automatic policy widening or destructive contract migration is introduced here.

N02-04's executable proof uses real disposable PostgreSQL and source-built images with 38 production migrations plus a clearly synthetic table-only migration 39. It establishes that specific fixture's compatibility, not permission for a future production migration, hardened deployment, or public release. See the task evidence for actual outcomes and image identities.
