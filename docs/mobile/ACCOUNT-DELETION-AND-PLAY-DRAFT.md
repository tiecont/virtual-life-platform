# Account deletion and Play dossier — N11-03 partial implementation

Local draft, 2026-11-07. This is not a submitted Data safety form, legal approval, public support resource or whole N11-03 acceptance. [ADR0131](../adr/0131-native-account-erasure-and-unconfirmed-delivery.md) records the implementation decision. Native rooms, user content and their safety adapters remain gated.

## Current implementation

The opt-in Android account panel offers explicit permanent deletion for the displayed guest or registered account. The dedicated native operation authenticates its own account, checks NI-bound CSRF and rejects a stale displayed account. Existing identity/domain deletion runs in its canonical transaction. Successful commit withdraws sessions and sockets. No new migration or data owner is introduced. Browser deletion remains unchanged.

Only the strict successful response confirms deletion. Network failure or an unparseable/uncertain response clears device custody and says **unconfirmed**; it never retries automatically. Logout, uninstall and an ended session are not deletion evidence. Signed-out help remains accessible in the account panel. Suspended registered users use the existing web privacy-access review and second password confirmation; a native suspended-request adapter is not implemented in this slice.

The local web route `/account-deletion` names Virtual Life Platform and links active controls and `/private/privacy-access`. It is implemented and locally exercised, but no public URL exists. Owner contact and deployment-specific retention must be supplied and reviewed before public distribution. Android release still disables native login, and normal bundles remain a logged-out preview.

Privacy access code declares 7-day requests, 15-minute approvals, 24-hour receipts and 30-day review security audits (`apps/platform-api/src/identity/privacy-requests.ts`). These are access/retention windows, not an operational response promise. Domain erasure hooks remove account-associated live data; some security records are unlinked. Backup retention and recovery handling need deployment evidence and owner disclosure review. Do not publish guessed retention or claim immediate erasure from backups.

## Policy reference review

Reviewed official pages for this development checkpoint; recheck at submission. Google Play requires account-creating apps to provide an in-app deletion path and an accessible web resource, with associated-data deletion and clear applicable retention disclosures. The local implementation supplies part of that path; the public resource and owner facts remain open. [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Public user content needs actual in-app reporting and blocking, appropriate terms and objectionable-content enforcement. Existing browser/backend safety evidence does not qualify a native gameplay UI. No native UGC acceptance is claimed here. [Google Play user-generated content policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

For personal developer accounts created after 13 November 2023, the reviewed production-access guidance requires a closed test with at least 12 continuously opted-in testers for 14 days before applying. Account type, creation date and actual Console eligibility are **UNKNOWN**; apply the rule only after those facts are established. A local AVD is not this testing track. [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

## Remaining acceptance work

| Item | Evidence/status |
| --- | --- |
| Native deletion and local web resource | Implemented; actual command outcomes in the N11-03 evidence record |
| Native report/block and enforcement UI | Not wired to authenticated gameplay; must be implemented and exercised |
| Privacy/Data safety inventory | Draft only: identity/login/profile/privacy, native device labels/grants, social/report/audit and domain records need a complete feature/SDK/data-flow inventory and owner review |
| Android permissions | Source main manifest requests INTERNET only; merged release inventory still belongs to release qualification; no runtime permission grant claimed |
| Age/rating and terms | Owner target audience, content rating, terms and actual enabled features need review; dating/random matching excluded from initial public mobile scope |
| Public resource/contact/backup retention | UNKNOWN; no public deployment authorized by this task |
| Owner approvals and Play account/testers | UNKNOWN; no Console access, upload, submission or approval performed |
| Physical Android and iOS | Current tests use an owned AVD; physical qualification and Mac/Xcode/iPhone gates remain separate |

## Reproduction

`pnpm test:mobile-policy` is now implemented: six real isolated database/API cases cover strict confirmation/CSRF/Origin/Cookie/stale-account denial, own erasure, real socket withdrawal, expiry during an actual lock wait, concurrent effects and transactional rollback/retry. It does not test the entire Play dossier or report/block.

`pnpm mobile:build:policy` builds a separate local qualification bundle. With the owned emulator, task-local public test CA and isolated `scripts/native-policy-fixture.ts`, `node scripts/verify-mobile-policy-native.mjs` exercises actual forms, native bridge, HTTPS, WSS and process restart. `node scripts/verify-mobile-policy-web.mjs` starts its own production-mode Next server and exercises resource/guest deletion/privacy entry on desktop/mobile. Both require live PID/start-time ownership proofs. The fixture can deliberately drop one acknowledgement after a successful deletion commit; it is not a production route.

Normal rebuild/Capacitor sync and Gradle build without native/test properties must follow qualification. Inspect the normal APK with `python3 scripts/inspect-native-apk.py normal --task n11-03`, then run `node scripts/verify-mobile-policy-native.mjs default-off` and the normal emulator smoke. Stop only the owned fixture/emulator and record cleanup. Task-local TLS keys, Android signing/ADB keys, SDK and AVD userdata never belong in evidence archives.
