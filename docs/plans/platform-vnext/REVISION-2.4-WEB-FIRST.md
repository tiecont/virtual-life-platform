# Revision 2.4 — Web/server trước, native mobile sau

Owner instruction 2026-11-09: “mobile nên phát triển sau … không làm block các tính năng của platform lúc phát triển. Viết lại … plans”. This revision supersedes the Android-first scheduling profile. It changes task scope/dependencies; it is not implementation or release evidence.

## Thứ tự thực hiện

1. Web/API Docker, local Compose, CI, immutable artifacts and migration/readiness checks.
2. Platform web: modular animal creator, polished landscape 3D Deadline/Maid, shared browser client, safety/privacy, admin, queue, observability and web usability/performance.
3. Lantern Lodge web: N15 foundation → N16 Sắc Đèn → N17 Mặt Nạ → N18 Hải Đồ → N19 web QA/ops/internal playtest. Preserve the existing sequential wave gates and server-authoritative hidden state.
4. Web scoped release dossier, real deployment/recovery evidence and explicit owner release approval. No public deployment is authorized by this replan.
5. Native Android/iOS only after explicit owner resumption. Existing mobile code remains; no rewrite/removal or stack change is required.

## Split dependency và acceptance

| Platform task | Current acceptance | Deferred native counterpart |
|---|---|---|
| N06-03 | Shared browser shell/navigation; no N10-02 prerequisite | N10/N11 packaging/lifecycle |
| N06-07 | Authoritative modular creator + browser Save/world/travel/reconnect | New N10-06 packaged native creator/world/device qualification |
| N06-08 | Browser landscape/resize/portrait/a11y fallback; no N10-02 prerequisite | N10-06/N11-02 native orientation/Back/resume |
| N06-11 | Browser technical renderer spike; retain original AVD observations | N10-06/N10-04 native workload/device qualification |
| N06-04/09 | Integrated web art/gameplay/performance/recovery with responsive browser coverage | N10-06/N10-04 physical Android, N14 iPhone |
| N15–N18 + N19 platform | Web game UI/authority/security/ops/pilots | N19-04 native three-mode acceptance |

N10/N11/N14 are conditional inactive. Pending native tasks, N12-03 and N19-04 are DEFERRED_APPROVED with this actual owner instruction. Already VERIFIED native tasks retain their historical source/evidence; deferral does not erase them or imply new testing. N10-04 now follows N10-06. No platform feature has an unconditional dependency on any native task. Responsive/mobile-browser layouts remain part of web quality.

N06-07 returns from physical BLOCKED_EXTERNAL to TODO for its narrower web scope, **not VERIFIED**. Its previous evidence/physical findings remain. It is the next dependency-ready platform task; after real web qualification, continue N06-04 → N06-09 → N15-05. Final graphics must still address documented silhouette/groom/loading findings, locked budgets and actual visual review. This is not permission to accept technical art as final.

## Compatibility và release vẫn fail-closed

No supported/distributed native binaries currently exist according to retained inventory/context; all three distribution fields remain false. Do not set them false merely to bypass a gate. If Android/iOS becomes supported/distributed, update inventory/context immediately; N12-01/04/05 conditionally require N12-03/N14-04 for that platform. True **or unknown** requires compatibility evidence even if new mobile development remains deferred. Native auth, ticket/protocol compatibility, physical performance, disclosures, signing/store and iOS resource gates remain mandatory for their own distribution.

One RoomAuthority, separate worker bootstrap, immutable SQL/evidence, privacy/report/block, adult/media gates and production approvals remain unchanged. Browser QA does not qualify physical devices, human usability or owner art approval.

## State và scheduling

The old 72d3713 Phase1 snapshot and all 64 evidence records remain in Git history; raw evidence is never rewritten. A fresh handoff must pin the revised upstream state before the Phase2 verifier resumes reading it. Only the sole coordinator schedules work, one vertical slice at a time. No duplicate N15–N19 tasks are added upstream. Run both plan validators/schedulers and the web-first dependency regression check after changes; proposed commands remain unrun until implemented and executed.
