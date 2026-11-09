# Official desktop release runbook — staged, signed, reversible

## Pre-release
- Product/legal: approved `VirtualLife` naming/logo/trademark; all art/music/license provenance, user agreement, SFW content, incident contacts, moderation/privacy and account deletion path.
- Security: game endpoint scoped ticket, auth revocation, rate limits, TLS, no private card hands in analytics; code signed Windows installer, signed manifests, secrets isolated from agent CI; stable backend REST/versioned proto.
- Reliability: Postgres restore, reward reconciliation, idempotent outbox, Rust rollback compatible with active matches, client/server protocol support matrix and pinned assets.
- User experience: PC system requirements based on real benchmark, accessibility/localization, account recovery, install/update instructions, launcher opt-in diagnostics.

## Canary
1. Build and sign `client-Win-x64`, manifest/content bundle, server OCI images. Store SHA256, Rust commit, Unity scene catalog hash and editor version.
2. Run install/upgrade/rollback on clean Win10/11 physical+VM, disk-full/antivirus/network-drop failures; smoke game loop on staged backend.
3. Deploy Rust canary behind specific world cohort / feature flag; install/update available only to testers on signed channel; web release page displays actual version.
4. Monitor client crash, game auth, FPS sampling by tier (with opt-in telemetry), RTT, room state, seat ghost count, teleport timeout, RPC p95/p99, outbox lag, duplicate settlement and site download errors.
5. Approve expansion only when no critical correctness/privacy/security incidents; SRE retains simple rollback route and support announcements.

## Immediate stop + revert
Critical: double reward, split-brain room, leaked card hands, unauthorized transfer, launcher signature failure, pervasive GPU device crash → stop new admissions/disable feature & acknowledge ongoing sessions. Server rollback only after checking event schema/active match compatibility, content bundles to previous known good, official website displays maintenance/compatible client state. Evidence retained.

## Release notes / external channels
Keep independent release tracks `alpha`, `beta`, `stable`; release manifest immutable per build; public official website never points download to unsigned/unreviewed CI artifact. Steam and macOS require separate paperwork/certification/ownership gates.
