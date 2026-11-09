# Stable error codes (illustrative public names)

| Code | Retryable | Meaning / client behavior |
|---|---|---|
| `UNAUTHENTICATED` | after relogin | token missing/expired; never reveal room |
| `POLICY_REVOKED` | no | block/consent/age/sanction changed; leave activity |
| `CONTENT_MISMATCH` | after update | required asset/ruleset differs, download proper version |
| `STALE_VERSION` | yes after resync | expected state version differs; get snapshot |
| `STALE_EPOCH` | yes after resync | room owner changed; don't reapply old move |
| `NOT_IN_PROXIMITY` | depends | player far from action; show walking hint |
| `SEAT_TAKEN` | yes new seat | race lost; refresh table map |
| `GAME_ALREADY_ACTIVE` | no | must forfeit/complete before teleport |
| `TELEPORT_DENIED` | no | locked/unsafe/capacity; don't move client |
| `TARGET_CAPACITY_FULL` | later | queue/try later, no invented slot |
| `COMMAND_ID_COLLISION` | no | same commandId different fingerprint, security event |
| `BACKPRESSURE` | yes with backoff | overloaded zone; no silent accepted action drop |
| `TEMPORARILY_UNAVAILABLE` | yes | dependency outage, show truthful pending state |
| `REWARD_PENDING` | yes status lookup | game settled, platform ledger not yet committed |
| `UNSUPPORTED_CLIENT` | after update | incompatible client/proto |

All errors return `traceId` and optional `canonicalVersion` but no private game state or full authorization details.
