# ADR0101 — vNext baseline choices and ownership

Date: 2026-11-05. Status: **Accepted for implementation preparation** under the owner's discretion to choose ordinary implementation details. Source base: `b707e85`. This records architecture direction, not implemented features, activated worlds, public staffing, purchases or production/store approval.

## Context and alternatives

The existing TypeScript/pnpm applications, PostgreSQL/Drizzle migrations, Socket.IO authority, Pixi/DOM scenes and shared world engines have actual local regression evidence. N00-01 preserved a hosted cadence failure separately from local passes. Replacing the stack, extracting every world into a service or adding a Redis adapter would add migration/consistency risk without qualifying a performance problem. Keep current stack and histories; use measured bottlenecks to justify later changes.

N00-03 measured this CachyOS development host. The owner reports one Android; actual device details and native tooling remain unverified. Neither a production cluster nor signing credentials were supplied. Local preparation proceeds without requiring those resources in advance.

## Decisions, invariants and reconsideration

| Area | Chosen baseline | Tradeoff / reason | Reconsider when |
|---|---|---|---|
| Runtime/data | Modular Nest/Fastify monolith, PostgreSQL as durable authority, current Drizzle/SQL journal | Preserves transactions and audited behavior; module ports must be enforced | Measured independent lifecycle/scaling need with an ownership/failure model |
| Images | Separate API, portal and admin images; shared packages build internally; worker/migrator reuse API digest initially | Independent runtime dependencies/deploys without treating packages as services | Worker dependency/security footprint materially differs |
| Authority/transport | One room owner; authenticated HTTPS/Socket.IO WSS, snapshot/resync and durable critical receipts | Bounded interruption on deploy; no premature multi-replica promise | N13 measured trigger plus fenced epoch/routing/chaos qualification |
| Schema | Preserve all historical SQL; expand/contract and tested compatibility become separate N02/N12 work | Current exact readiness remains until replacement has failure tests | Candidate/schema/support-window change requires fresh compatibility evidence |
| CD | Same-repo Kustomize overlays and Argo Applications, digest-only promotion of tested artifacts | Git remains desired-state authority; local cluster rehearsal precedes real rollout | Multi-cluster/tenant needs justify ApplicationSet/Helm or another design |
| Worker | Independent composition root for durable jobs/outbox; never call API createApp or acquire RoomAuthority | Same image reduces artifact complexity; room-bound work stays owner-side | Job isolation/performance/security measurements justify a separate image/service |
| UX/client | One polished social/focus/service journey; shared React DOM/Pixi client and platform adapters | Reuses accessible controls; extraction must keep Next/server dependencies out | Usability or bounded renderer/device spike fails |
| Mobile | Capacitor local bundle spike, Android first on Linux; N14 iOS conditional | Physical single-device evidence has a narrow scope; shared code is not cross-platform certification | Device results or product direction invalidate the choice |
| Operator | Exactly one human principal, player-independent session, MFA/passkey, step-up and append-only audit; distinct service identities | Needs bootstrap/recovery custody and authorization boundaries; none are provisioned here | Owner explicitly changes human-operator count |
| Admission | PostgreSQL tickets/offers/leases with atomic slots, TTL, FIFO/aging and idempotency | One durable store makes last-slot and recovery semantics explicit | Qualified queue throughput/latency needs another store |
| Telemetry/capacity | Bounded private metrics/logs/traces with freshness and safe labels; measured workload-specific recommendations | Missing/stale is unknown, not zero; initial headroom hypothesis is not certified capacity | Hardware/source/workload/SLO changes or measurements invalidate policy |
| Config | Git owns deployment/release entitlement; versioned DB runtime policy may operate only within it | Avoids Argo drift and dashboard bypass of release gates | Proven cross-region policy-distribution requirements |
| Evidence | Compact indexes plus private immutable raw archive; migrate readers and verify restore before cleanup | Existing raw files remain until retrieval is proven; Git history is not rewritten | Retention/security/storage requirements change |

These choices consolidate NEXT-ADR-001…015 in the plan register. Their implementation remains Nxx work; nothing in this ADR marks those tasks VERIFIED.

## Coordination and ownership

| Lane | Owns | Coordination boundary |
|---|---|---|
| Coordinator (current Codex session) | Manifest/task-state/evidence, composition roots, package scripts, public contracts and migration numbering | Serializes changes; reserves one reviewable task/commit at a time |
| Foundation/CI | Toolchain, images, workflows, evidence migration, local infra/GitOps and docs index | No source/evidence deletion before consumer/restore gates; no production access inferred |
| Runtime | Identity/safety, room/travel authority, engines, jobs/admission and policy transactions | Contracts/migrations through coordinator; no private repository bypass |
| Experience | Game shell, scenes, tokens, native/keyboard alternatives and usability | Uses public client contracts; no client-controlled authority or leaked telemetry secrets |
| Mobile/admin | Android/native adapters and isolated operator UI/auth | Player auth remains guarded; signing and real operator custody stay explicit prerequisites |
| Release owner | Actual production/store promotion, purchases and real staffing/privacy/media/adult approvals | This role is not assigned to the agent or to synthetic test staff by this ADR |

These are code responsibilities, not a claim that parallel agents or real public operators exist. No subagents were requested or used. Service identities for CI/Argo/telemetry are distinct from the one human admin.

## Migration, rollback and verification

Each dependency-ready task changes one boundary end-to-end, preserves compatibility exports where needed and runs its applicable matrix. Do not scaffold over current apps, duplicate domain trees or rewrite the ORM. Keep API replicas at one; worker bootstrap must not reuse room composition. Preserve source pins, old task IDs and SQL checksums.

Rollback code/docs per reviewable commit; never force-push, rewrite history or down-migrate production to satisfy a checklist. Images must roll back only against tested schema/protocol/assets compatibility; failed gates keep admission closed. New runtime policies require reason/version/audit, with no entitlement bypass.

N00-04 verification is architecture consistency plus plan/evidence validation and historical-ledger preservation. Domain extraction, worker isolation, image runtime inspection, native auth, operator security, queue races and Argo behavior have their own later acceptance tests. This ADR cannot replace them.

References: [vNext master](../plans/platform-vnext/MASTER-AGENT-PLAN.md), [decision register](../plans/platform-vnext/adr/DECISION-REGISTER.md), [environment matrix](../plans/platform-vnext/architecture/ENVIRONMENT-MATRIX.md), [current architecture](../architecture/CURRENT-STATE.md).
