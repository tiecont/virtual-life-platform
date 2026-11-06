# vNext current handoff

Updated 2026-11-06T00:10:23.904307+00:00; task N05-05 VERIFIED on `codex/vnext-n05-05-durable-worker`. Base revision `a8c04eae1b44d9c51c7397aaf008e73da2138f32`; this task has its own reviewable commit after evidence finalization.

Implemented a separate compiled durable reward worker with independent pool/lifecycle and no createApp/RoomAuthority/socket bootstrap. Shared ledger/account-lock ports retain the four original reward method bodies and reward SQL; foreground API/focus/correction adapters remain. Explicit external dispatch leaves room-bound maintenance in API; default API and legacy retry behavior stay unchanged. Worker-only bounded retry/quarantine uses existing rows, with scoped optimistic event/consumer/attempt/due-time CLI control and no receipt deletion. Actual103-case final worker gate passes concurrent compiled workers, SIGKILL at COMMIT/uncertain outcome resolved through receipts, poison retry, schema refusal, current safety restrictions and API-role handoff. Full check passed61 governance,315 unit,582 integration and all workspace builds. Final compiled14-file worker graph is identical after rebuild. All initial failures retained.38 SQL/dependencies/original151-task ledger/public gates preserved.

[Actual checks](../audit/N05-05-CHECKS.json) / [evidence index](evidence-index.json). Counts: `{"VERIFIED": 25, "TODO": 44}`.

## Remaining gates

Hosted baseline Quality 42037215254 failed Deadline cadence (133.3 ms vs <100 ms); scoped local baseline passed without budget changes. Cause remains unresolved. Raw logs are private local artifacts until owner cleanup, not off-host archives. Historical 151 Mxx tasks/evidence and all public/restricted gates persist. No production/store release is authorized by code verification; platform distribution contexts remain false until actual supported distribution. N13/N14 are inactive.

## Next exact action

Reserve N05-06; audit current SessionHandshake/room content schemas, Socket.IO gateway and actual portal consumers. Implement additive protocol/capability negotiation with explicit incompatible-client outcomes, preserve legacy strict response/handshake adapters and Origin/cookie/CSRF/revoke checks. Keep protocol, scene schema, content identity and DB migration versions independent. Exercise real N/N-1 or explicitly pinned legacy fixtures, epoch/gap resync/token revoke and graceful unsupported content; wire/test the relevant client adapter and run applicable contracts/consumer/protocol/integration/browser verification without claiming a released old mobile binary exists.

Continue dependency-ready tasks independently of external server/device/store inputs. Do not claim unattended background continuation.
