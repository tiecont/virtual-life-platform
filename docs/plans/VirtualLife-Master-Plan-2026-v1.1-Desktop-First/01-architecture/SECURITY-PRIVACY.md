# Safety/security/privacy: live world + venues + games

## Security baseline
- Nest issues short TTL, audience/scope/worldId/nonce-bound game tickets after platform auth + admission + policy checks; Rust verifies signature, expiry, replay, revocation generation; internal gRPC uses authenticated service-to-service identity (mTLS or mutually trusted cert layer) and deadline.
- Authoritative movement input, seat/match membership, reward; all private projections tagged viewer/recipient scope, delivered only after current safety/consent check.
- Structured rate limits/anti-replay/nonces; server-side teleport cooldown, blocked users, private instance privacy, abuse moderation. No client-supplied role/points/damage or raw SQL.
- New code must preserve original N05 travel/blocks/privacy and N15 journal privacy invariants. Reuse or map existing report/block interface into world overlay without lowering role checks.

## Age and content
- Friendly public spaces including Maid Café are strictly **SFW**, cosplay/roleplay opt-in, no explicit interactions by default, player report/block/mute visible, private messaging controlled by existing policies. Creator submissions require licensing/content moderation before publish; minors receive age-appropriate safeguards.
- No camera/microphone/facial biometrics collection by default. Facial animation is rig-driven preset emotes. Face tracking (ARKit) is a separate opt-in feature with local processing and review, not required for expressive avatars.

## Privacy operations
- Account delete/export/retention applies to Pet/game data/receipts/chat references and cosmetic assets; receipts may need limited security retention with policy/legal review. Backups, data residency, disclosure and actual store requirements need owner facts and signed release review.
- Operators can see health and abuse reports but never generic hidden hand/secret RNG or private chat raw data in dashboards.

## Negative tests required
Stale token mid-teleport; block during seat reservation; invite to private room without consent; same `commandId` with different payload; replay packets after epoch takeover; unauthorized spectator leak; revoked session at settle; cross-device account switch; outbox duplicate/slow/failed; forged client position/skill/reward. On failure: safe reject, no double membership/receipt, resync and log scrubbed trace.
