# VirtualLife v1.1 — Agent execution contract (DESKTOP-FIRST)

**This is a planning package, NOT permission to deploy.** Read `START-HERE.md`, `01-architecture/ADR-003-DESKTOP-FIRST.md` and `04-delivery/MIGRATION-V1-TO-V1.1.md` before changes.

1. **Read-only repo audit**: inspect actual HEAD/migrations/Unity (if any)/N06-04 worktrees and legacy Nxx/PA/Lodge ledgers; archived verified statuses remain untouched. Plan task IDs VL-001..110 are **all TODO** before source review, no evidence invented.
2. **Native Windows product priority**: one Unity 6.3 LTS URP game client, compiled Windows first; Windows 3D city/combat/avatars are G2/G3 main tasks. Web is official Next.js portal; Three.js work only compatibility/demo with separate optional gate. Don't accidentally create a second full-feature browser client.
3. **Authority and state**: Rust one writer for new world/pet/card/seat/teleport, Nest control plane for account/social/moderation/economy. Legacy Nest RoomAuthority continues for legacy worlds until fenced cutover. No authoritative sim in Unity/Nest. No direct client wallet mutations.
4. **Shared contracts**: lock versioned Proto/C# bindings, content manifest, avatar rig/schema and session/ticket rules. Reserve hot files before parallel work; each branch handles explicit allowlist and handoff.
5. **GPU/visual quality**: URP shader variant budget, Unity profiler **compiled Windows player on named physical GPU**, 3 golden scenes and UX manual approval. AI key-art is reference, not runtime screenshot. Exported rig licensed and tested for expression/ear/tail/IK.
6. **Security**: signed installer/artifacts, SHA256/signatures, TLS, auth scope/revocation, no embedded web OAuth secrets in deep-link URL, no client-authored damage/reward, private card projections only to participant. No secrets in PR CI or agent handoffs.
7. **Failures**: Rust tick lost/reconnect, seat race, teleport saga, outbox/reward idempotency, GPU driver restart, updater interrupted, asset mismatch must have test/fallback/rollback.
8. **Evidence**: `VERIFIED` only reviewed source-bound PR SHA + build/content/proto hashes, test logs, GPU/driver/OS, screenshots from actual player, reviewer signoff. Missing hardware/license/trademark/keys → `BLOCKED_EXTERNAL`; continue independent lanes.
9. **Parallel safety**: coordinator owns schedule. Unity project/URP settings, Rust proto/migration, Next.js `app/`, release keys/manifests each have one writer. Do not let task-states from this ZIP overwrite active legacy task-states.
10. **Quality before breadth**: polish one city block, one café, one Pet Arena and one board game end-to-end before adding multiple districts, massive crowds, ultra shaders everywhere or platform ports.

Try `python3 tools/validate_plan.py` and `python3 tools/next_task.py G0`. Refer `04-delivery/AGENT-EXECUTION-ORDER.md` for lane ordering, `04-delivery/PERFORMANCE-GO-NOGO.md` for release gates.
