# Operating rules — VLP Pet Arena agents

1. Read `README.md`, `03_delivery/decision_log.md`, relevant workstream, then your technical specification.
2. Inspect the real VLP repo before writing code; record assumptions and adapt its naming and services rather than creating parallel auth, wallet, chat, or social systems.
3. Only edit paths allocated to your workstream. If conflict occurs, open an integration task rather than editing other agents' files.
4. Use versioned battle rules (`rulesetVersion`), idempotent commands, integer/fixed-point math, deterministic seed PRNG, and explicit event ordering.
5. Do not access or duplicate VLP sensitive profile fields for game analytics. Use VLP user IDs only through existing auth and privacy patterns.
6. Never trust the client for damage, rewards, PvP turn order, inventory grant, or rankings.
7. Keep **original assets**: no copied Pokémon characters, Pokiwar branding, or third-party game sprites/audio without rights.
8. Add unit tests, contract tests, and concise change summaries to each PR. Record balance changes and replay fixtures.
9. Feature-flag unfinished PvP, purchases, and external reward bridges. PvE must remain usable when social or push notifications are down.
10. Do not start implementing S3 before S1/S2 acceptance gates are met.

## Definition of Done for every agent
- Works against approved interfaces and existing VLP infra.
- Unit tests, negative path, accessibility/responsive concerns (if UI), metrics, rollback notes.
- API changes versioned; seed rules and event envelopes stable.
- Handoff: changed paths, sample payloads, tests, blockers, and necessary migration.
