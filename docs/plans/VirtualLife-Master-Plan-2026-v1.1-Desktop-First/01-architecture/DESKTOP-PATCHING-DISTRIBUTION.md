# Windows distribution, launcher/update, assets, trust and rollback

## Two update channels must not be confused
1. **Executable installer/launcher/game binaries**: code-signed artifacts with release manifest (signature, SHA256, version, OS, protocol compatibility, mandatory flag), atomic staged replace and rollback; installer permissions least-privilege; reboots/restarts explained.
2. **Unity Addressables content (asset bundles)**: remote catalog/CDN allowing changed scenes/animations/cosmetics to download without full executable rebuild *if asset/API compatibility allows*. Never hot-replace arbitrary executable/game logic from unsigned bundles.

## Release path (recommended)
- **Closed alpha**: signed Windows installer per version + optional Unity Addressables for safe asset updates. No mandatory self-updating launcher while product slice is unstable.
- **Closed beta / public**: decide `Windows self-distribution signed patcher/launcher` OR Steam distribution pipeline after business/distribution gate. Don't maintain two patch systems concurrently without capacity.
- **Dedicated launcher candidate**: **Tauri 2 + Rust updater** for news/account/download and binary version bootstrap, not the 3D runtime. Tauri updater signs updates to the **launcher**, not automatically the external Unity game payload; the game updater requires a separate signed manifest/downloader/atomic activation/rollback implementation and tests.
- **Steam**: optional third-party store/platform review; preserve independent account/entitlements model. Do not assume publication or Steam keys already exist.

## Sample artifact workflow
`commit+UnityEditorHash+ProtoHash+ContentCatalogHash` → reproducible CI Windows build → malware/security scan → release signed installer + manifest → canary CDN bucket → staging Windows install/upgrade/downgrade test → rollout cohort → 24h monitoring/revocation/rollback. Private release signing keys in KMS/offline protected storage; never accessible to PR CI or public agents.

## Failure modes
- Manifest signature invalid: reject and do not start untrusted payload.
- Download interrupted: resume chunks with bounded disk, verify hashes **after** download; download to staging directory before atomic rename. Disk full: preserve previous launchable binary.
- Incompatible client/server protocol: version negotiation explicit; force-update page is informative, does not expose account token.
- Rollback: keep last known good version on disk if space permits, remember content schema compatibility. DB migrations/reward contract cannot be rolled back blindly.
- Offline: official site accessible, optional game front-end menu offline read-only; no trusted gameplay offline receipts.

## Installer security and operations
Use Windows code signing and Microsoft Smart App Control compatibility; publish publisher name, hash and version. Authenticity checks for release manifests are **separate** from TLS. User can opt out of diagnostic telemetry. Keep crash dumps free of private card hands/tokens. Run installer smoke on clean Win10/11 VM or physical PC, admin and non-admin accounts, limited disk space, antivirus and power interruption scenarios.

## Reference
- Unity Addressables remote distribution: https://docs.unity.cn/Packages/com.unity.addressables%402.9/manual/remote-content-intro.html
- Tauri updater signing: https://v2.tauri.app/plugin/updater/
- Microsoft Windows signing: https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control
