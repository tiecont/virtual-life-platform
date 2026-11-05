# Current local release rehearsal

M23-04 validates two separate environments. Neither is external staging or a public release. All real flags remain OFF;production deliberately rejects `LOCAL_*` installers. Do not describe test-mode world travel as publicly enabled TLS gameplay.

| Lane | Actual work | Scope |
|---|---|---|
| Closed production-mode TLS | Current38 Docker API/web,Caddy,trusted local certificate,Host Secure HttpOnly cookie,rotation,Origin/forwarded-IP denial,private operator edge isolation,failed canary/compatible API rollback/roll-forward,guest logout and old-cookie401 | Loopback disposable stack;no real worlds installed. API rollback keeps current web fixed. |
| Actual world/test profile | City→Deadline→Maid→Library→Restaurant→City;native seats/private start-cancel or order withdrawal,same identity/avatar/one membership;Maid confidential report/assigned synthetic moderator/requeue;block across actual Deadline;friend consent and independent appeal | Separate sanitized test-mode API/DB lifetimes per spec/device;actual adapters plus explicitly labelled synthetic protocol case. No real staff grants or public adult access. |
| Recovery | Encrypted snapshot/empty restore/exact38journal/authenticated session/no phantom visit/stranded order cancellation | Fresh M23-02 exercise reused with unchanged application/package runtime;not a second restore claim. |

Reproduce the TLS lane with the exact selected image IDs/provenance in [migration release](MIGRATION-RELEASE.md):

```sh
CITY_SMOKE_IMAGE=virtual-life-platform:m23-current \
CITY_SMOKE_ROLLBACK_IMAGE=virtual-life-platform:m23-previous \
node scripts/staging-smoke.mjs
```

Run each world/safety spec as a separate invocation to preserve finite profiles and real IP quotas:

```sh
node scripts/run-browser-tests.mjs tests/e2e/travel.spec.ts
node scripts/run-browser-tests.mjs tests/e2e/maid-safety.spec.ts
node scripts/run-browser-tests.mjs tests/e2e/social.spec.ts
node scripts/run-browser-tests.mjs tests/e2e/safety.spec.ts
```

Run Docker-backed TLS and browser harnesses sequentially;interface creation/removal can produce Chromium `ERR_NETWORK_CHANGED`. That is a test-environment risk,not permission to suppress network failures or auto-retry product mutations. Preserve failures and investigate them. Chromium trusts the generated certificate's exact SPKI;Node HTTPS separately trusts that certificate. Playwright's Node APIRequestContext does not inherit Chromium's trust pin. Guest logout now checks anonymous401 with same-origin browser fetch rather than weakening certificate validation.

The fresh rehearsal contains12 browser executions across8 complete spec/device lifetimes. The actual four-world tour does not complete a multi-course dinner or two-actor Maid service;those remain separately verified module scenarios. The retained synthetic lost intent/commit ACK/reconnect/multitab/logout case is still labelled synthetic. The production TLS run proves browser-acknowledged guest logout,old cookie401,cookie removal and no automatic new identity after reload. It does not pretend an absent public on-call assignment or real legal/media/age approval exists.

Private telemetry emitted actual aggregate request/error/online counts with no identities/traces;the error count includes an intentionally denied unauthenticated request. No SLO or production occupancy inference follows. Generated test projects/env/TLS/key/archive files are cleaned;only safe facts,selected screenshots and reports are retained.24 freshly written historical PNG/JSON outputs were copied to the new evidence directory and all8 changed historical bytes restored. Six fresh synthetic protocol artifacts were saved separately. Initial TLS trust and artifact-audit invocation failures remain recorded.

See `docs/agent/evidence/m23-rehearsal-checks.json` for exact commands/exits and [incident procedures](INCIDENTS.md) for the separate public staffing gate. A completed local rehearsal is a candidate check,not a release decision.
