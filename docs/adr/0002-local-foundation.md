# ADR 0002 — Local foundation and offline execution scope

Status: Accepted local implementation, 2026-11-02.

User instruction: “bạn chỉ cần code offline ở đây nhé, tôi sẽ tạo repo sau khi bạn làm xong tất cả” — implement offline here; owner will create the remote repository later. This overrides M01-05's immediate remote PR demonstration. Implement CI workflow and demonstrate local success/failure propagation now. Remote PR, required-check settings, hosted runner evidence, publishing and deployment remain NOT_RUN and outside this session's authorized scope. Local M01 verification does not imply those remote checks happened. This explicitly supersedes ADR 0001's temporary remote dependency gate; local DAG can advance when amended M01 acceptance passes.

Use pnpm 11.28.5 and installed Node 26.9.0 pinned in .node-version and engines. Nest 11.2.8/Fastify 5.12.8, TS 5.9.3, Drizzle 0.45.4, Zod 4.6.7 and Next 16.4.4 are exact audited versions, keeping independent legacy runtimes intact. This pin is reproducibility, not a claim of active-LTS or vulnerability clearance; security checks remain M22. pnpm release-age exceptions are exact versions (no broad package wildcard). No mass dependency updates.

Foundation vertical slice is a Next development status page → Nest/Fastify health endpoints → separate PostgreSQL schema metadata. Readiness requires migrated schema version, not merely a TCP connection. World SDK contains compatibility version only; M05 owns lifecycle/registry contracts. No identity/room/social feature claimed by a health endpoint.

Local/test databases bind loopback, use independent Compose projects, and tests use random ports/passwords and disposable tmpfs storage. No production credentials. Migration runner uses transactional checksum validation and advisory lock; isolated rollback test proves partial DDL rollback. Normal commands never delete developer volumes. Schema changes are additive; future production rollback is route/feature rollback plus approved restore, never implicit down migration.
