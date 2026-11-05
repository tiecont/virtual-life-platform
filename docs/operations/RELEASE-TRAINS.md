# Offline candidates and wave release checklist

Current decision: **PUBLIC_RELEASE=false**. This inventory is a reviewed local candidate boundary,not authority to enable production. Run `node scripts/verify-release.mjs` for the current read-only report. `pnpm governance:check` also checks it. Technical verification and human approval are separate records.

The source of truth is [release-trains.json](../../config/release-trains.json). The project owner requested offline implementation;that does not assign a public incident commander,moderator,privacy/legal reviewer,backup custodian or release approver. Those six responsibilities are explicitly unassigned. Keep actual contact details and credentials in an access-controlled operator record,outside the repository.

| Wave | Candidate | Independent decision |
|---|---|---|
| W2 | Deadline + Maid and shared City baseline | Can be assessed without W3–W6,progression or dating pilot. Both actual adapters and native service/travel are locally tested. |
| W3 | Library + Central Park + shared Events | Separate content and quiet-room review;no books distributed. |
| W4 | Restaurant | Separate dining/reservation capacity and consent review. |
| W5 | Lounge | Separate live operator and media decision;current original visual/text fallback carries no third-party playback license. |
| W6 | Dating | Separate reviewed provider,jurisdiction,privacy,staffing and controlled pilot. M20-07 remains external;all eight approvals false. |

Each wave must pass the following before public activation. Record immutable source/image IDs,date,reviewer,evidence and expiry for approvals;checkmarks copied from this document are insufficient.

1. Select the wave and exact compatible API/web/DB artifacts. Recheck module evidence,current migration manifest and clean source fingerprint. Review security/dependency/image provenance and the unmet local load targets;1000 connected clients is not1000 admitted players.
2. Run the actual identity/world/service/travel/safety/reconnect/signout acceptance relevant to that wave on isolated data. Preserve failures and distinguish controlled clocks,fixtures,one-browser profiles and production capacity.
3. Take an encrypted backup and restore it into an empty isolated target. Record backup time,retention/key custody,measured recovery time and schema compatibility. Review each migration;there is no automatic destructive down migration.
4. Rehearse bounded stop/start,failed canary,compatible rollback and emergency world/chat denial. Confirm private monitoring and routing to an assigned on-duty human;keep player report/appeal paths and independent review functional.
5. Obtain explicit wave-specific owner,privacy/content and safety approvals plus real domain/TLS/credential custody. A W2 signoff never approves Lounge or Dating. Verify expiry/revocation of rights before every later release.
6. Review a production installation path. Current `LOCAL_*` options deliberately reject production;flipping the review JSON or reusing a browser fixture does not install a public world. Production installation requires a separate reviewed implementation and fresh acceptance.
7. Activate only approved scope with an operator present;observe canary health/error/occupancy/safety and abort on denied readiness,missing moderation,expired rights or data exposure. Record actual outcome and rollback. None of these public steps has occurred here.

Control ownership/defaults and runtime sources are enumerated in the JSON:world review flags,local installation plus registry flags,deny-only incident controls,chat/adult/media gates,private telemetry and backup schedule. Optional progression is server-injected and disabled in the default app;it is not a public entitlement switch. Browser profiles only install finite sanitized disposable fixtures.

All seven `config/rollout.json` flags are OFF. Global chat and unsolicited DM are OFF;local Maid uses a deliberately scoped canned-only exception. `WORLD_FLAGS_FILE` reload can close a local world;registered scoped incident controls independently deny world/chat access. Internal telemetry defaults disabled and the public proxy excludes it. No real recurring backups,offsite custody,collector,on-call routing or public credentials are installed. See [deployment recovery](DEPLOYMENT-RECOVERY.md),[PostgreSQL recovery](POSTGRES-RECOVERY.md),[moderation controls](MODERATION-RUNBOOK.md) and [private telemetry](OBSERVABILITY.md) for existing mechanisms and their measured limits.
