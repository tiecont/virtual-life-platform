# Native account safety — N11-03 partial slice

[ADR0132](../adr/0132-explicit-native-safety-ports.md) records ownership and uncertain-delivery semantics. This lane adds opt-in Android account safety controls; it does not enable authenticated gameplay in the normal room preview or complete the Google Play dossier.

After sign-in, **Open safety controls → Refresh safety controls** loads the current account's room projection, reporting availability and disclosed block list. A user can report a visible peer with a private bounded note, block that peer independently, or unblock an existing entry. Without a room, the panel says reporting requires an eligible visit and still exposes existing blocks. Reporting availability is shown honestly and block does not depend on the evidence service.

The native custody port has three operations:

| Operation | Fixed API calls | Public result |
| --- | --- | --- |
| safetyState | GET `/v1/me/room`, `/v1/safety/status`, `/v1/blocks` | Strict account-bound projection/status/own blocks |
| report | POST `/v1/reports` | Existing reporter-only receipt |
| setBlock | POST `/v1/blocks` | Confirmed blocked boolean |

Every call includes a native-only expected-account assertion. It is checked against authenticated authority on both sides, and never selects an actor. Mutations retain CSRF, strict schemas, request UUID, durable owner budgets and canonical account-lock rechecks. The existing general native request method remains restricted to own profile/privacy GET/PATCH. No JavaScript-supplied destination, bearer, refresh token or internal grant is accepted or returned by these safety ports.

A lost report acknowledgement is **unconfirmed**. The panel provides **Retry unchanged report**, preserving account/source/category/note/request ID even after a separate block. A committed original report returns its existing receipt. New drafts are new requests; there is no automatic transport retry. The pending draft and displayed receipt are process-memory UI state, not durable native storage. Closing/restarting the panel can lose that draft; no persisted report-history/recovery guarantee is made. Blocking success and a subsequent view-refresh failure are disclosed separately.

The new state contains public profile IDs/names already authorized by the room owner, own block labels/IDs and reporting availability. Private notes and report sources travel over native HTTPS to the existing encrypted evidence owner; public room/socket results do not carry their plaintext. Receipt IDs remain reporter-visible. This is a bounded lane inventory, not a completed platform Data safety declaration. Deployment backup retention, real support contact, legal basis, target audience, SDK inventory and owner-reviewed disclosures still need evidence before distribution.

## Actual qualification and reproduction

`pnpm test:mobile-policy` now includes the existing six erasure cases plus native safety API cases. It verifies current-account/Origin/Cookie/CSRF/strict-body guards, actual native memberships, confidential reporter-only report receipts and concurrent retry, block projection/contact enforcement, stale room evidence and expiry during an actual SQL lock wait. Full security/integration results must be recorded separately at fixed source.

The isolated build command is `pnpm --filter @virtual-city/mobile build:native-safety`; normal builds exclude `nativeSafetyQualification`. Prepare a **new** task-owned local CA with `node scripts/prepare-native-test-tls.mjs n11-03-safety` only before the first build for a qualification batch. Its private keys stay in private scratch and are never evidence. Run `scripts/native-safety-fixture.ts` through the existing isolated DB harness, build the DEBUG APK with exact localhost origin/test-CA/task properties, then run `node scripts/verify-mobile-safety-native.mjs` against the guarded project AVD. The fixture owns one API/RoomAuthority and two labelled synthetic native TCP peers; the installed app uses actual native HTTPS/WSS. This is not integrated Maid gameplay.

The verifier exercises an actual post-COMMIT dropped report acknowledgement, duplicate submit suppression, actual peer-message exclusion while a witness receives, receipt recovery after block, explicit unblock, 200% text, account-switch rejection and process restart. Inspect exact APK assets/signature/trust with `python3 scripts/inspect-native-apk.py safety --task n11-03-safety`. Frozen deletion artifacts in the parent N11 directory are never overwritten.

Finish with a normal mobile build/Capacitor sync and Gradle build without native/test properties. Inspect normal and unsigned-release policy with `--task n11-03-safety`, run `node scripts/verify-mobile-safety-native.mjs default-off`, normal bundle/AVD smoke, and stop only owned fixture/AVD resources. Default-off qualification checks seven selected native entrypoints reject activation. Raw logs/APKs/screenshots live under private `artifacts/vnext/n11-03/safety-v1/`; repository evidence keeps summaries/hash. Source/evidence checkpoint determines acceptance, not this guide's existence.
