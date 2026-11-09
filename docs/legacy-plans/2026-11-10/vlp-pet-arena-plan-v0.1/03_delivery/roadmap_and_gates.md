# Release roadmap, milestones and decision gates

> Work should be performed in the current repository and toolchain. The plan describes sequence, not promises of calendar-time delivery.

## S0 — Architecture check and contract lock
- Inspect current VLP repository; catalogue auth/session, games registry, routing, inventory/currency, social/notifications, analytics, deployment.
- Map each integration through existing APIs; decide service vs in-process module based on repo constraints.
- Freeze battle command/event/schema version and PRNG/hash canonicalization fixtures.
**Exit:** architecture review approved; no team owns overlapping file paths; security/migration plans accepted.

## S1 — Playable vertical slice (PvE first)
- 7x7 board, 5 gem types, canonical cascade engine, basic enemy AI, Pet team and 8 archetypes.
- 6 story encounters + 1 boss; trial progression and single-player tutorial.
- Server-generated seed and snapshots, command replay, stateHash, reward receipts.
- Mobile-first, keyboard/touch controls, reduced motion and symbol+color gem semantics.
**Exit:** new user can complete story sample; combat deterministic from fixtures; no infinite match; zero duplicated commands/rewards in retry tests; stage balance simulated.

## S2 — Persistent VLP integrated release
- Use existing VLP login/profile route; saved Pet inventory, Pet Camp, equipment, cosmetics, achievements bridge.
- API stress/load test, support dashboards, durable reward outbox, analytics/feature flags.
- Social invitation entry can be enabled only with existing VLP privacy/blocklist rules.
**Exit:** auth+refresh+relogin work, reward retries cannot double-grant, outages degrade gracefully, observability green, rollback tested.

## S3 — Competitive PvP beta
- WebSocket/delta transport, server turn clock, reconnect, surrender, matchmaker, normal stat templates.
- Rating, per-season cosmetic ladder, replay, misconduct/fraud/velocity monitors.
- Opt-in beta, limited cohort, separate flag for ranked, disable on system pressure.
**Exit:** simultaneous two-client test same final hash, duplicate/stale/reordered actions safe, disconnection handled, anti-cheat and balance accepted.

## S4 — Post-launch expansion (optional)
Guild bosses, co-op, spectator, VLP housing Pet interactions, decorative events, more original creatures, new stage mechanics. Schedule only after retention and balance data justify.

## Project-wide go/no-go tests
1. Deterministic replay across supported server runtimes.
2. Server only grants rewards, never from client assertion.
3. Accessibility + responsive baseline validated on mobile and desktop.
4. Fair ranked stat templates and no purchasable competitive advantage.
5. No cross-wallet mutation before signed bridge review.
6. PvE fails gracefully without live social/matchmaking services.
7. Every risky feature has a flag and a documented rollback.
