# Android disclosure inventory — owner-review draft

N06-07 implementation update at `a0ec8ab39fbeba6c21b474ff333ba173a24bfe52`,2026-11-08: the opt-in native account lane now also has a shared modular animal creator and dedicated account-asserted avatar GET/Save ports. Browser/API tests have actual evidence;new packaged-native qualification is still pending at this update. This changes the inventory draft,not release/distribution or Play declarations. Normal native origin/release defaults remain disabled.

The new flow stores bounded species/body/head/eyes/muzzle/ears/tail/fur/marking/hair/outfit/accessory IDs,catalog version,revision and change time in additive `engine_avatar_parts`;idempotency receipts store account/request IDs,fingerprint,revision and timestamp in `engine_avatar_part_mutations`. It does not capture photos,biometrics or arbitrary model URLs. Both tables cascade on account deletion;export includes the selected document. Mutation retention beyond live account erasure remains an owner/backend policy question;no automatic TTL or backup-erasure claim is introduced. Legacy profile/uniform data remains unchanged. Only privacy-filtered room participants receive public cosmetic parts;owned inventory and receipts stay private. Re-audit the actual eventual candidate before declaring shipped data categories.

Inspected source `5ea296e5e9a70f10e6d3fd0a9d0e16ad80d6cc32`, 2026-11-07. This document is preparation for N11-03, not a submitted Data safety form, content rating, legal review or owner acceptance. Actual build/manifest/dependency facts are indexed in the native-safety checkpoint. No public privacy/support/deletion URL or store delivery is established.

## Artifact and feature scope

The normal mobile bundle is a logged-out local preview. Its generic platform request returns unavailable, the room socket origin is deliberately unavailable, and native login remains disabled without an explicit DEBUG build origin; release builds disable native login. Separate qualification bundles use a local synthetic API/room and never supply release evidence by their existence alone. The normal AVD install is a developer test, not a distributed user/client track.

The opt-in native account lane implements guest/login/upgrade, encrypted native refresh custody, own account settings and explicit erasure. Its safety controls use real current-room projections, private reports and cross-city blocks. Current normal gameplay does not wire authenticated travel, business widgets, free text/chat upload, message reporting, notifications or private dating. These are scope boundaries for a future candidate, not permission to omit data collected by enabled parts of an eventual artifact.

Google's guidance includes transmissions by SDKs and app-controlled WebViews in the collection assessment. Owner declarations must reflect the actual proposed track artifacts, backend configuration and third-party behavior. Encryption, transient processing or a currently closed preview alone does not establish a completed “no data” declaration. [Official Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), reviewed for this draft; recheck at submission.

## Source-backed data flows

Candidate category names below are review prompts, not final Console answers. Owner review must decide the actual categories, purposes, optional/required behavior, sharing and retention for the shipped scope.

| Data and trigger | Current client/server handling | Deletion and unresolved disclosure |
| --- | --- | --- |
| Guest name/avatar and account ID; create account | Form → fixed native HTTPS → identity account/profile. JavaScript receives public identity, not reusable native grants. Candidate personal information/user ID/name fields need review. | Identity erasure and domain hooks delete/unlink associated live data. Deployment backups are separate and unconfirmed. |
| Login name/password; register/sign in | Entered for authentication, sent through native HTTPS; server owns credential hashing. Form resets after submission. Immutable Java/JS strings cannot promise zeroization. | Registered credentials cascade on account deletion. Password recovery is not implemented; do not advertise it. |
| Device/session metadata; account bootstrap/refresh | App device label, generated UUIDs, platform/build/protocol claims. Android stores encrypted refresh in noBackupFilesDir with Keystore AES-GCM; access/CSRF stay in native memory. These are not hardware attestation or advertising identifiers. | Logout clears local custody and reports remote revocation truthfully. Grant/session expiry is an authorization lifetime, not a universal data retention period. Server native rows cascade on account erasure. |
| Presence/privacy choices | Own profile/privacy GET/PATCH. Default presence hidden and analytics consent false. Public peer profiles are projected by the existing server owner for the current room. | Own choices cascade; activity exposure follows world/relationship/block rules. Proposed public scope must inventory enabled worlds separately. |
| Private report category/note and room/member/target evidence | Explicit submit → native HTTPS → existing confidential report owner. A bounded note/source is encrypted at rest; reporter receives a private receipt. Report is an allegation, not an automatic sanction. Candidate user-generated-content and interaction fields need review. | Identity erasure purges associated encrypted evidence and unlinks retained case identity references. Evidence expiry/purge and metadata retention are different, as detailed below. |
| Block pair, optional known-player label and timestamps | Explicit block/unblock → existing transactional social owner. Own block list only; contact/projection withdrawal uses existing enforcement. | Block rows cascade on account deletion. Unblock does not recreate friendship or invitation consent. |
| Request IDs, source IP/network metadata and security records | HTTPS/network/server necessarily handle connection metadata; API budgets and idempotency prevent abuse/duplicate effects. First-party operational logs redact request bodies and credentials. | Hosting/edge/proxy/provider log retention, access and recipients are deployment facts still UNKNOWN. Absence of GPS permission does not answer every network-data disclosure question. |
| Optional analytics setting | Current source stores consent choice; no external analytics collector is configured by this mobile lane. Qualification/performance instrumentation is isolated from normal builds. | This is a source finding, not a provider-wide SDK certification or a public “no analytics ever” declaration. Re-audit the actual candidate and deployment. |

Relevant owners: `apps/mobile/src/{NativeAccountPanel,NativeSafetyPanel,NativeAccountDeletion}.tsx`; Android `NativeSession{Engine,Http,Store,Plugin}.java`; API identity/native service, social service, safety reports and room projections; SQL1–45 remains unchanged by the safety slice.

## Permissions, components and dependencies

The actual merged **release** manifest requests `android.permission.INTERNET` and the app's signature-only `life.virtualcity.spike.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. It has no camera, microphone, location, contacts, advertising-ID or notification runtime permission request in this inspected artifact. Backup and cleartext traffic are disabled. This is a binary/build-scope finding, not a claim about every future artifact or all possible transmitted data.

The launcher Activity is exported. FileProvider and AndroidX initialization providers are not exported. The profile-installer receiver requires Android's DUMP permission. The FileProvider template retains external/cache path declarations with URI grants supported; no file-sharing/upload UI or plugin is wired in this mobile lane. Review/remove unused path breadth before enabling file sharing. No owner keys, provider configuration or userdata were opened for this inventory.

The generated Capacitor registry includes `@capacitor/app`; MainActivity additionally registers the first-party orientation and native-session plugins. Direct mobile dependencies include pinned Capacitor core/Android/App and React; shared renderers bring the reviewed Three/Pixi paths. Android native HTTP uses OkHttp4.12.0. The actual offline Gradle `releaseRuntimeClasspath` report captures resolved AndroidX/Kotlin/HTTP/transitive coordinates; the lockfile and source hashes are retained privately. This inventory does not substitute for provider disclosure review or a release SBOM/security/license gate.

## Retention facts and gaps

Identity privacy-access code declares requests7days, approvals15minutes, receipts24hours and privacy-review security audits30days. These are access/retention windows, not a human review response SLA. Active erasure is synchronous when its transaction succeeds; lost delivery remains unconfirmed to the client. Suspended registered users use the existing browser ownership review and second password confirmation.

The inspected draft safety policy sets report evidence to720hours, case metadata2160hours and audit metadata4320hours. ReportService writes evidence expiry, rejects expired evidence reads and offers a purge bounded to100 expired evidence records per batch. Its evidence purge does not establish automatic case/audit metadata deletion at the draft90/180day values. Deployment maintenance uptime/scheduling, backup expiry, legal holds and the final approved metadata-retention implementation remain unverified. Publish no exact case/audit deletion guarantee from the policy numbers alone.

The account erasure transaction removes associated evidence, cascades account-owned rows and unlinks protected security/case records according to existing owners. It is not a backup purge or third-party deletion receipt. A public policy must explain actual retained data, reasons and timeframes after owner review. [Official account deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), reviewed for this draft.

## Age, scope and owner facts still required

| Gate | Current evidence / exact unresolved fact |
| --- | --- |
| Target audience/content rating | Owner has not specified the intended age audience, regions or rating answers. Animals artwork is not age verification. Do not infer a child-directed or adult-only whole app. |
| Terms/community standards | Public terms/content-policy links and acceptance before enabled UGC are not qualified by this account-safety slice; verify the actual candidate flow and owner-reviewed policy before distribution. |
| Dating/random matching | Initial public mobile scope excludes it. Existing restricted-world eligibility, consent, operator/privacy approvals remain closed; no remote flag is a substitute for those gates. |
| Public policies/support | Public privacy/deletion URLs, support email/contact, controller/operator identity and response commitments UNKNOWN. Local routes and draft text are reviewable preparation only. |
| Data safety/SDK review | Complete owner-reviewed purposes/categories/sharing, actual provider processing and candidate SDK disclosures before submitting the form. |
| Retention | Owner-approved backup/security/legal-hold policy and implementation aligned with claimed periods still required; current draft metadata numbers are not measured purge evidence. |
| Play account/testing | Account type, creation date, actual Console eligibility/testers/track access UNKNOWN. No upload, account access or submission performed. |
| Physical/accessibility/platform coverage | AVD safety/normal preview evidence is separate from physical Android/TalkBack/lifecycle/performance; iOS needs Mac/Xcode/Simulator and physical qualification in N14. |

Next local action after the safety regression checkpoint: use this concrete inventory for the remaining disclosure/retention review, preserve all unknown owner facts, and continue independent N06-11 art/loading/heap work while release gates remain closed. N11-03 cannot be marked VERIFIED solely from API/native tests or this document.
