# Proposed APIs & event envelope (draft, repository adaptation required)

## Public endpoints (suggested route prefix `/api/v1/games/pet-arena`)
| Method | Path | Purpose | Scope |
|---|---|---|---|
| GET | `/bootstrap` | flags, content versions, own Pet summary, ruleset | S0 |
| GET | `/pets` | owned Pets, progression, cosmetics | S2 |
| PUT | `/teams/active` | set 3 owned Pet IDs with optimistic version | S2 |
| POST | `/battles` | create PvE session (`stageId`, `teamId`, `requestId`) | S1 |
| GET | `/battles/{battleId}` | canonical snapshot, legal moves, seq/version | S1 |
| POST | `/battles/{battleId}/turns` | atomic `MAKE_TURN` or `SWAP_PET` command | S1 |
| GET | `/battles/{battleId}/events?afterSeq=N` | event delta/recovery | S1 |
| POST | `/battles/{battleId}/surrender` | surrender with idempotency | S1 |
| GET | `/rewards` | reward ledger including pending | S2 |
| GET | `/leaderboard` | public season data with VLP privacy controls | S3 |
| POST | `/matchmaking/tickets` | join PvP pool | S3 |
| DELETE | `/matchmaking/tickets/{ticketId}` | withdraw matchmaking | S3 |

## Example `MAKE_TURN` request
```json
{
  "commandId": "uuid",
  "expectedVersion": 14,
  "type": "MAKE_TURN",
  "swap": { "from": [2, 3], "to": [2, 4] },
  "preSwapSkillId": "skill.ember.ignite"
}
```

## Sample success response
```json
{
  "battleId": "battle_uuid",
  "accepted": true,
  "commandId": "uuid",
  "stateVersion": 15,
  "rulesetVersion": "1.0.0",
  "eventSeqFrom": 88,
  "eventSeqTo": 103,
  "stateHash": "sha256_of_canonical_state",
  "state": { "board": [], "parties": [], "currentActor": "opponent", "turnNo": 8, "status": "ACTIVE" }
}
```

## Domain event envelope
```json
{
  "eventId": "uuid",
  "battleId": "battle_uuid",
  "seq": 89,
  "stateVersion": 15,
  "type": "GEMS_MATCHED",
  "payload": { "cascadeDepth": 2, "gemType": "STRIKE", "cellCount": 4 },
  "createdAt": "server_timestamp",
  "rulesetVersion": "1.0.0"
}
```

## Expected events
`BATTLE_CREATED`, `TURN_ACCEPTED`, `SKILL_CAST`, `GEMS_MATCHED`, `GEMS_REFILLED`, `SPECIAL_CREATED`, `BARRIER_GAINED`, `DAMAGE_APPLIED`, `HEAL_APPLIED`, `MANA_GAINED`, `ELEMENT_PROC`, `STATUS_APPLIED`, `PET_FAINTED`, `PET_SWITCHED`, `TURN_CHANGED`, `BATTLE_FINISHED`, `REWARD_PENDING`, `REWARD_COMMITTED`.

## Error contract
- `400 INVALID_COMMAND`: malformed data or nonadjacent cell.
- `401 UNAUTHENTICATED`: VLP session absent/expired.
- `403 NOT_ALLOWED`: not participant, user blocked, wrong mode or forbidden action.
- `404 BATTLE_NOT_FOUND`: not accessible or absent.
- `409 STALE_STATE`: return latest version/snapshot for client reconciliation.
- `409 NO_LEGAL_SWAP`: suggested reshuffle/server action.
- `422 INSUFFICIENT_MANA`, `422 COOLDOWN_ACTIVE`.
- `429 RATE_LIMITED`.
- `503 MODE_DISABLED` / `503 SERVICE_UNAVAILABLE` with retry semantics.

## Validation contract
- Commands require opaque idempotency key, expectedVersion, actor resolved from VLP context and request schema validation.
- Logs capture command ids and resulting state hashes, not sensitive user profile data.
- Reward ledger is eventual but exactly-once in effect for each unique reward key, with retries.
- Backward compatible API adjustments; bump `rulesetVersion` on mechanics changes and `contentVersion` on content changes.
