# Architecture decisions & open questions (do not block initial parallel work)

## Accepted as starting proposals
- **D-001:** Modernized original-IP title *VLP Pet Arena*, not Pokiwar remake.
- **D-002:** Match-3 turn-based tactical RPG with 3 Pet team and 7x7 board.
- **D-003:** S1 PvE before S3 competitive live PvP; PvP behind independent flag.
- **D-004:** Server-authoritative state, pure deterministic reducer, replay logs.
- **D-005:** Separate Pet Arena soft currencies; optional vetted VLP cosmetic bridge.
- **D-006:** 4 element classes (Ember/Grove/Tide/Aether) and 5 gem classes.
- **D-007:** Fair ranked mode normalizes combat stats; cosmetic-first economy.
- **D-008:** All creature names/assets original and IP-cleared before launch.

## Must verify in actual VLP repository
- **O-001:** Is frontend React/Vue/Svelte/native game shell? Which rendering and routing library is standard?
- **O-002:** Do we have a monorepo/package system? Where do isolated game features live?
- **O-003:** What are existing VLP auth/session claims, friend/blocklist, user privacy and guest policies?
- **O-004:** Are there existing VLP currency/inventory/achievement interfaces? What transactions are permitted?
- **O-005:** Which database, queue/outbox, websocket gateway and observability stack are already in place?
- **O-006:** Device/performance/accessibility standards; localization conventions and release pipeline?
- **O-007:** Real art pipeline and content licensing process.

## Balancing values to playtest, not architectural dependencies
Board dimensions, mana costs, barrier decay, elemental multiplier, damage coefficients, first-player advantage, 20s turn limit, 12-turn cap, stage reward cadence.

## Scope control
If an agent encounters a missing core-platform capability, implement a stub adapter and notify A0; do not build a parallel platform. Changes to shared VLP wallet, auth, users, notifications or social semantics require explicit owner review.
