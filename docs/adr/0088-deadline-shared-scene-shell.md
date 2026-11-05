# ADR0088 — Selected Deadline layout in the shared scene shell

Status: accepted and locally verified for M15-04,frome1f8f9d. [Actual evidence](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/evidence/m15-scene-checks.json) distinguishes the first and final visual builds and scoped regressions.

Selected source CafeShell is a placeholder,not a playable scene to embed unchanged. Reuse its actual30 seat identities/960x640 configuration and transform coordinates to40pixel tiles in a24x16 scene,rounding each axis by at most20pixels. Add original walkable/collision furniture and deterministic code-authored cafe art on the existing renderer/atlas/native WorldRoomPanel. City Room/Focus/Identity/Travel remain authoritative. No old client or original source file is overwritten.

Dedicated renderer theme is additive,with old theme branches unchanged. Backend world version advances to1.1.0 for the new scene. All seats must be reachable and avoid collisions;native controls remain usable if avatar/graphics fail. Same-host City identity/avatar persist across explicit Portal travel,scene attachment and confirmed leave/return. Returning uses the existing authoritative leave operation and does not navigate on an unconfirmed departure. Existing reconnect grace/epoch/current-session semantics stay shared.

Default-OFF installation and registry gates remain;production rejects local activation. Browser fixture flags are explicit and separate from real settings. Source/API/history association remains optional and independent. Actual browser,version/collision/fallback/reconnect tests and provenance are required before VERIFIED;invitations/safety05 and full performance/migration06 remain subsequent.
