# ADR0115 — Review immutable digest promotion through a scoped App

Date: 2026-11-06. Status: accepted for local implementation; hosted N04-02 acceptance remains blocked.

Separate publication and desired-state changes. Reuse the existing source/run/digest verifier and immutable seven-file bundle. Generate a bounded proposal before obtaining write credentials and reverify before writes. Production proposals copy the staging descriptor without rebuilding images.

Use a default-disabled, main-only manual workflow with read-only job permissions. A repository-scoped App token may create a tree, commit, new branch and draft PR. Keep automatic promotion and auto-merge off; preserve existing Quality/publisher workflows and owner review while enforcement is unavailable.

Local binding validation proves consistency only. Neither arbitrary local digests nor mock API responses establish remote authenticity or actual required CI on a bot PR. No active overlay binding, deployment or public permission follows from the local checks.

Rollback disables activation and reverts to a compatible previous release binding, retaining bundles and evidence. Application protocol, dependencies, ORM and persistent data remain unchanged.
