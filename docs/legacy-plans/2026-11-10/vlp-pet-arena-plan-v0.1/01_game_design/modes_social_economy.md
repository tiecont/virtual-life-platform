# Modes, social and fair economy

## Rollout
**S1:** Guided battle → 6 PvE story stages → one boss encounter. Replayable stages with first-clear and repeat rewards. Practice against AI. Friend challenge deep-link may show a 'coming later' state but must not mislead.

**S2:** Daily missions, Pet Camp, achievements bridge to VLP, friend invitations using existing social graph, cosmetics earned by playing, basic event challenge; offline-safe fallback for social outages.

**S3:** 1v1 live PvP ranked/unranked, seasonal ratings and rewards, replay/share link, rematch and gentle conduct controls. No voice or direct free-text chat inside battle at launch; existing VLP safety/privacy rules apply.

**Future (not scheduled):** Guild bosses/co-op, tournaments, spectator, asynchronous arena with transparent AI rule sets.

## Reward inventory
- `pet_arena_gold`: game-scoped soft currency for noncompetitive PvE progression, capped and transaction-logged.
- `pet_arena_tokens`: game-scoped earned cosmetic currency, non-tradable, no cash-out.
- `pet_arena_cosmetic`: skins, Pet Camp decorations, profile frames and optional VLP home display decorations.
- Cross-reward to VLP only via an audited bridge adapter with explicit idempotent transfer intents and anti-fraud limits. Never modify VLP's shared wallet directly from battle outcome handlers.

## Economy principles
- Cosmetics-first business model. Avoid monetizing battle wins, revive-for-money, random paid loot boxes in MVP, or paid stats in ranked.
- Earning a pet/ability must be reasonable through gameplay; ranked uses normalized templates so longevity does not become power advantage.
- Repeated stage farming rewards taper by daily budget; *do not* create punishing energy depletion to lock casual play. Practice PvE always available.
- Reward claims use `{battleId, rewardKind, ownerId}` unique idempotency key, with server-origin verification and audit records.

## Social boundaries
- Reuse VLP friends and moderation decisions via adapter; user discovery, blocked users and parental restrictions remain governed by platform.
- Invite deep-links are signed, time-bound, single-game context and never disclose private identifiers.
- Matchmaking region and ping awareness; don't promise 'real-time fair match' before S3 capacity is proven.
- Personalization/audiences must respect VLP consent and data-retention policy.

## Live ops guardrails
- Ruleset/content versions pinned for each started match; schedule changes between matches.
- Seasonal rewards should be cosmetic; never remove purchased/earned cosmetics unexpectedly.
- Add kill switches for PvP, cross-reward bridge, content events and spending flow separately.
