# Product requirement document (PRD) — VLP Pet Arena

## Vision
A fast, approachable, strategic match-3 arena with a sense of pet companionship, purpose-built for VLP rather than a retro remake. The experience succeeds as a stand-alone mini-game and becomes better when connected to VLP's social identity and virtual-life ecosystem.

## Target users
- Casual VLP visitor: first battle in <2 minutes of interacting with the module, no mandatory strategy tutorial before playing.
- Return user: wants a 3–5 minute ritual with daily missions and collectible companions.
- Competitive user: values readable strategic decisions, credible matchmaking, replay and anti-cheat.
- Social user: wants to challenge friends and decorate their VLP space with earned cosmetics.

## User journey
1. Open game from VLP Game Hub; VLP session or approved guest fallback is resolved by adapter.
2. Short tutorial demonstrates 3-gem match and pet skill.
3. Starter Pet selection from three original archetypes; automatic fair starter team for trial.
4. Complete one 3-minute PvE battle; get visible, deterministic rewards.
5. Enter Pet Camp to upgrade/collect; show next level and optional friend challenge.
6. Later: ranked/seasonal modes with standardized PvP stat templates.

## Engagement loops
- **Micro:** swap → cascade → gain power → cast skill → counter enemy → reward feedback.
- **Session:** select team → encounter → 3–5 minute battle → earn upgrade/cosmetic progress.
- **Long:** new abilities, evolutions, collection catalog, co-op/social goals, ranked seasons.

## Success metrics (targets to validate, not external benchmarks)
- Tutorial battle completion rate ≥75% among players entering first battle.
- Median PvE battle duration 3–5 minutes; 90th percentile ≤7 minutes.
- Turn action success ≥99.5% under healthy network; <0.5% hard battle desync.
- 100% server-verifiable rewards; duplicate grant rate zero in automated tests.
- Time to usable board ≤3 seconds on a defined mid-tier mobile test device after core VLP shell load (budget to re-baseline).
- Reduced-motion and color-independent gem identification available at launch.

## Design pillars
1. Readable tactics over random punishment.
2. Pets with personality and gameplay identity.
3. Fair PvP; no purchasing numerical advantage.
4. Short battles with meaningful choices.
5. Modular VLP interoperability.

## MVP in scope
7x7 board, 5 base gem types, deterministic combos, three-pet team, skill + elemental loop, basic enemy AI, 8 Pet definitions, 6 stages and 1 boss, Pet Camp progression, user inventory and save, first-time onboarding, mobile-web responsive layout, accessibility, live-ops telemetry, VLP identity adapter, cosmetic placeholder inventory, battle replay format.

## Deliberately out of scope until gates pass
Real-money purchase flow, marketplace, gacha, guild raid, full virtual pet AI, voice chat, cross-world trading, user-generated creatures, open economy, simultaneous multi-user board, NFT/blockchain features.

## Art direction
Original chibi/soft-stylized creature silhouettes, clear elemental color coding plus shapes and glyphs for accessibility, VLP-friendly animations, 2D/2.5D visuals that work on mobile. Character/story names are new IP. All images/animations/audio must be created in-house or licensed.
