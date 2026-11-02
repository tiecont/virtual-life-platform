# Session handoff

- W0 VERIFIED locally. M03 IN_PROGRESS, guest/privacy and registered upgrade/login slices VERIFIED. No downstream room/social/registry modules started.
- Latest actual results: m03-checks.json, pnpm check → 0 (7 governance, 11 unit, 18 actual PG integration); pnpm test:e2e → 0 (6 desktop/mobile tests, cross-browser login preserves account ID). Prior timestamp-tie eviction failure retained and fixed via DB creation_order. Readiness requires all bundled migrations.
- Next exact action: M03-06 authentication-only Socket.IO gateway and actual network revocation/origin/CSRF/command-auth tests. No room commands until M06. After verifying this final identity acceptance, update all M03 task statuses and continue lowest ready M04 per DAG.
- Identity docs: ADRs 0004/0005 and IDENTITY-API.md. Registered login/password now implemented (supersedes guest-only notes in earlier checkpoint). No recovery available; separate public nickname and private sign-in name, salted bounded scrypt, signed cookies, CSRF, idempotency, export/delete and expiry maintenance.
- Source changes and evidence committed locally; see git log -1 for this checkpoint. Owner requested offline code only: no remote/PR/hosted CI/publication. All worlds OFF, no public release.
- Dev DB stopped after W0; ignored .env contains local generated secrets; migration 0002/0003 pending on that DB. Test containers cleaned up. Never print secrets or alter legacy repos; adapters require re-audit. Read app-level AGENTS and local Next docs before web changes.
