# VirtualLife migration playbook — preserved legacy state, new desktop-first world

**Do not migrate everything at once.** The plan archive reflects status as of 2026-11-09, not live source. First inspect source HEAD, protected branch, migrations, active N06-04 owner and artifact provenance. Do not edit existing N/PA/Lodge status/manifest from this package.

1. Approve v1.1 ADR. Keep old Nest RoomAuthority for existing world IDs and encrypted N15 journal. Allocate **new** Rust Aurora world ID namespace behind disabled flags. No duplicated authority.
2. Add Rust game runtime and stable Proto at isolated branch. Run headless Pet Arena PvE, replay and PG receipt/outbox tests, negative auth/seat tests.
3. Bring up **new Unity Windows client** (URP pinned editor/build profile) connecting directly to Rust new world. Migrate no existing browser user data; preserve web N06 routes optional/under old owner.
4. Publish Next.js official site as parallel portal; only show real download after signed artifact/release gate. Browser preview has no gameplay authority or requirement to meet Windows shaders.
5. Release native G2/G3 slice and test real Windows GPU; feature flags/cohorts. Existing Nest control/ledger processes remain; adopt one content catalog contract.
6. Later, if necessary, migrate **legacy** world RoomAuthority with snapshots/epoch fencing and explicit player session transfer, staged rollback, N15 encrypted journal compatibility. Never rely on two active writers.

Recoverable failures: abort failed teleport prepare, resume outbox with idempotency, restore signed client/content release, preserve previous game journal. Cleanup only after verified migration and retention/privacy policy.
