# Technical architecture — modular VLP integration

## Assumptions
Repository/stack and current Virtual Life Platform architecture are **not available** in this conversation. Design is stack-agnostic; TypeScript is suggested for contracts/example engine only. Agents must choose framework/runtime by inspecting the actual VLP repo.

## Logical components
```
VLP Game Hub / App Shell
  -> Game entry + VLP Auth Adapter
       -> Pet Arena Web UI (board, pet camp, rewards)
           -> Battle API + command transport (HTTPS initially / WebSocket S3)
                -> Battle Orchestrator (server authority, idempotency, timers)
                     -> Pure Deterministic Engine (ruleset/version + seed)
                     -> Snapshot/Event log store
                -> Pet/Inventory/Progression service
                -> Reward ledger (outbox)
                -> Social/Matchmaking adapter (later)
                -> VLP achievement/cosmetic bridge (outbox / versioned)
  -> VLP existing identity, friendships, achievements, wallet/content systems
```

## Service boundaries
1. **Combat engine**: pure functions `init(seed, config)`, `validate(state, command)`, `reduce(state, command)` returning new state+ordered events+stateHash. No database/network/clock inside.
2. **Battle orchestration**: authenticates actor, checks turn ownership/TTL, serializes per-battle commands, persistent state versions, idempotent command receipts, timeout logic. Avoid multi-writer race.
3. **Meta progression**: PetInstance management, teams, stage progression, XP, currency and cosmetics owned by game domain.
4. **Content and balancing**: read-only versioned manifests and asset references, ruleset validation, playtest simulation.
5. **VLP adapter**: thin integration contract for user identity/permissions, achievements, cosmetic decoration grants, friends, notifications. Reuse existing services, do not duplicate them.

## Suggested data entities
- `arena_battles(id, mode, status, seedServerSecretRef, rulesetVersion, contentVersion, stateVersion, snapshot, latestHash, createdAt, finishedAt)`
- `arena_battle_commands(battleId, actorId, commandId, turnNo, accepted, responseHash, submittedAt)`, unique `(battleId, actorId, commandId)`.
- `arena_battle_events(battleId, seq, type, payload)`, unique `(battleId, seq)`.
- `arena_pet_instances(id, ownerVlpId, speciesId, level, xp, evolutionId, affinity, cosmetics, version)`.
- `arena_teams(ownerVlpId, slot, petInstanceId)`, unique `(ownerVlpId,slot)`.
- `arena_reward_ledger(idempotencyKey, battleId, ownerVlpId, reward, status, createdAt)`.
- `arena_outbox(id, eventType, payload, status, retries, createdAt)`.
- `arena_season_ratings(seasonId, userId, rating, wins, losses, updatedAt)` (S3).

## Boundaries and deployment
- Own namespace, migrations, API prefix, observability dashboards and feature flags.
- Use VLP existing logging, tracing, auth middleware, secrets, CI/CD, CDN, asset pipeline and error reporting where possible.
- Do not couple core battles to VLP social/network uptime. Post-match rewards are recoverable via ledger/outbox.
- Event replay for debugging and anti-cheat; redact PII. Only server reveals RNG values relevant to public result, not future draws.
- Browser/mobile client draws sprites via optimized 2D canvas/WebGL or game rendering library *already accepted in repo*; keep animation separate from reducer.
- For PvP, WebSocket events are an optimization, not the source of authority. HTTP command receipts and state re-fetch enable reconnect.

## Failure paths
- Duplicate command: return prior receipt; no second attack, no duplicate reward.
- Stale stateVersion: reject with current canonical view and allowed next actions.
- UI reconnect: fetch snapshot and event delta after lastSeenSeq; replay only VFX as appropriate.
- Server restart: recover from durable snapshot/event log and outstanding battle timers.
- VLP rewards unavailable: persist outbox, retry with dedupe, surface 'pending' not 'granted'.
- PvP infrastructure degraded: feature-flag PvP off; PvE remains playable.

## Security
- Auth actor derived from VLP session, never supplied as trusted client player ID.
- Rate limit action endpoints; validate enum, positions, ownership, cooldown, version and mode.
- No client-provided damage, currency grant, item unlock or rankings.
- Enforce block/privacy/safety for invitations, aliases and social features.
- Reward fraud monitoring: impossible battle durations, nonces, excessive farm patterns, hash mismatches.
