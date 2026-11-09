# Contract-first APIs and event conventions

See `05-contracts/rpc/game-runtime.proto`, `map-location.schema.json`, `content-catalog.example.json`. **Design samples** — NOT wire-compatible with existing production yet.

## Public route examples (proposal)
- `POST /api/v1/world-tickets`: platform auth + admission, returns one-time scoped signed ticket + endpoint.
- `GET /api/v1/discovery/places`: platform catalog labels/visibility; capacity/availability last-known via Rust read projection.
- `GET /api/v1/games/{id}/receipt/{commandId}`: authorized reconciliation fallback.
- `POST /api/v1/reports`/`POST /api/v1/blocks`: reuse existing safety ownership; world publishes policy-change for prompt enforcement.
- Rust `/rt/v1`: upgraded WSS, auth ticket; binary command envelope with negotiated protocol/content version; avoid exposing internal game DB queries.

## Internal RPC examples
`IssueWorldGrant`, `JoinInstance`, `ExecuteWorldCommand`, `ExecuteGameCommand`, `GetGameReceipt`, `GetAuthorizedSnapshot`, `ReserveTeleport`, `CompleteTeleport`, `ReadHealth`; game endpoint receives verified identity context and checks freshness at commit.

## Version discipline
Independent `publicProtocolVersion`, `internalRpcVersion`, `rulesetVersion`, `contentCatalogVersion`, `stateSchemaVersion`, `assetManifestHash`, `engineBuildDigest`; additive proto fields, reserved field numbers, expand/contract SQL, semantic content version pinned per session. Client mismatch gets explicit `UPGRADE_REQUIRED`/`CONTENT_MISMATCH`, not silent failure.

## Error model
Every rejection has stable error code, safe message, retryable boolean, optional canonicalVersion, traceId and privacy-safe detail; see `05-contracts/ERROR-CODES.md`. No leaking private participant IDs, hidden cards, unredacted sanctions or server PRNG seed.
