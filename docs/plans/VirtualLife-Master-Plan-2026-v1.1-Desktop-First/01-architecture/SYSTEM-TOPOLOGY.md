# System topology — desktop game + official website + Rust data plane

```mermaid
flowchart TB
  SITE[VirtualLife Next.js official website] -->|HTTPS: account/social/news/download| NEST[NestJS platform API / workers]
  SITE -->|static media and installer| CDN[CDN: media / signed builds / immutable assets]
  UNITY[Unity 6.3 URP Windows native client] -->|HTTPS bootstrap/login scoped ticket| NEST
  UNITY -->|direct WSS: intent/movement/activity/combat| RUST[Rust Game Runtime - Tokio/Axum]
  UNITY -->|Addressables content| CDN
  NEST <-->|authenticated gRPC/async outbox| RUST
  RUST --> WORLD[Zone actors / AOI / 10-20Hz semantic tick]
  RUST --> RULES[Pure Rust card and Pet Arena reducers]
  RUST --> GAME[(PostgreSQL game schemas, receipts/outbox)]
  NEST --> PLATFORM[(PostgreSQL platform account/ledger)]
  RUST --> OBS[Metrics / traces]
  NEST --> OBS
  UNITY --> OBS
  WEBLITE[Optional web-lite preview] --> SITE
  LEGACY[Legacy Nest RoomAuthority only existing worlds] --> PLATFORM
```

Only one authoritative game owner per world ID: legacy Nest for legacy worlds until G7 cutover; Rust for new `Aurora` worlds and new games. Website never routes movement ticks through Next/Nest. No client can mutate database or wallet directly. Native installer/patch signing handled by restricted CI and CDN, not game server.
