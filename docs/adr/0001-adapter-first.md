# ADR 0001 — Adapter-first city workspace

Status: Accepted for local implementation, 2026-11-02 (AUD-08, M01-01).

Evidence: repository-inventory and legacy-compatibility; both source repositories have active uncommitted work, different Nest/TS/test versions and incomplete gameplay. Preserve independent repositories, branches, histories, databases, toolchains and dirty changes. Build city as its own pnpm modular monolith; use explicit versioned adapter ports when dependencies unlock M15/M16. Do not add symlinks to mutable source trees, submodules to uncommitted revisions, copy implementations, or consolidate migration journals.

Alternatives: immediate monorepo extraction risks lost changes and incompatible hoisting; git submodules require stable committed integration revisions; redirect-only links do not implement shared identity/travel. Adapter facade keeps rollback small, at the cost of translation and proof-exchange complexity.

Migration impact: none now. No external DB or source changes. Future mapping tables are additive and require explicit proof of ownership; no name-based account merges. Rollback disables per-world flags and routes back to source apps. Re-audit exact clean commits before adapter implementation. Missing code licenses gate redistribution, not local audit or independent city foundation work.

Module-specific DoD boilerplate about all tasks having runtime/UI/socket checks is applied to relevant deliverables: M00 and M02 are specifications and architecture; their verification is executable consistency/boundary review, never represented as gameplay verification. A missing remote PR is reported separately; M01-05 stays unverified until a real failing/passing PR and required checks are demonstrated. Modules depending on all M01 remain gated while that acceptance is unsatisfied. This is a strict reading of the dependency DAG, not an implicit waiver.
