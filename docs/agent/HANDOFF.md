# Session handoff

- W0 VERIFIED locally. M03 IN_PROGRESS; guest/privacy vertical slice verified; full registered identity next. No downstream M04/M05 yet.
- Last complete W0 checkpoint 2de87c3; this guest implementation checkpoint follows (git log -1). Local Git only, no remote per owner.
- Actual latest `pnpm check` → 0: 7 governance/boundary, 9 unit, 14 actual PostgreSQL integration, lint/types/ownership/builds. `pnpm test:e2e` → 0: 4 desktop/mobile tests including real identity lifecycle across two tabs. Logs/checks JSON and screenshots under docs/agent/evidence/m03-guest-*.
- Read ADR 0004 and IDENTITY-API.md before changing identity; bootstrap retry keys are transient capabilities, signed opaque tokens stored hashed, CSRF/origin and UUID idempotency required. Registered kind is reserved but not implemented yet. No automatic legacy token migration.
- Next exact action: implement M03-02 optional guest→registered upgrade and local password login, keeping the same identity. Salted bounded async scrypt, no credential logs/export, request idempotency, rotate/revoke cookies, abuse controls. Add real PG/HTTP + browser tests before module verification. Then complete M03 policy/revocation contract review and unlock M04/M05.
- Current city dev DB was stopped after W0 and still needs 0002 when restarted. Ignored .env has generated SESSION_SECRET; never print/copy it. Tests create random local disposable DBs, now all cleaned up.
- Both legacy working trees unchanged/dirty; integration requires re-audit and stable commits. All worlds OFF; no actual socket/travel/moderation pipeline or public release verified. Hosted CI/PR/branch protection outside offline scope.
