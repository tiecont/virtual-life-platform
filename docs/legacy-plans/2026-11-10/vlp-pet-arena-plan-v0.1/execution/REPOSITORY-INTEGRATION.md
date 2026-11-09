# Repository review và integration matrix

Read-only source audit tại HEAD `1576b5b` ngày 2026-11-09; Node26.9.0/pnpm11.28.5. Có dirty renderer experiment và CI evidence từ phiên trước; không dùng chúng làm Arena acceptance. Source facts dưới đây không phải kiểm thử lại các module.

| Nhu cầu Arena | Source hiện có | Cách tích hợp / gap |
|---|---|---|
| Monorepo, API/UI | `pnpm-workspace.yaml`, `apps/platform-api/src/app.ts`, `apps/portal-web`, `packages/game-client` | TypeScript/Nest/Fastify/Next/shared React; PA-001 ADR trước scaffold, không dùng mẫu `services/*` của proposal như đường dẫn đã có. |
| Identity/CSRF/export/delete | `identity/service.ts`, `identity/http.ts`, owner registrations trong `app.ts` | Reuse signed browser session, CSRF và transaction account locks; game không tự cấp guest/session. Ghi Arena owner export/deletion và future bridge revocation. |
| Game core/seed | `packages/boardgame-core/src/{core,entropy,json}.ts`, `scripts/boardgame-boundary.mjs` | Core đã có pure boundary, nhưng typed cho ba mode Lodge. `shuffleWithWords` tiêu thụ entropy words, không phải seeded PRNG của Arena. Chốt stream/cursor/replay riêng tại PA-002/003. |
| Durable match | `games/{journal,journal-crypto,journal-host,room-host}.ts`, SQL0047 (`0045` native auth và `0046` avatar là domains khác) | Journal encrypted/receipts/claims và patterns phục hồi có sẵn. Policy ràng buộc room epoch/membership và world `lantern-lodge`; không dùng trực tiếp cho PvE không-room. Không tạo RoomAuthority thứ hai. |
| Contracts | `packages/contracts/src/games.ts` | Enum/mode/payload/public/private projections Lodge là allowlists đóng. Arena schemas/version/serialization riêng; compatibility review trước shared export. |
| Hub/navigation/avatar | `/worlds/lantern-lodge`, `GameLobbyPanel.tsx`, shared scene/creator | Hub entry Arena chưa có. Dự kiến `/games/pet-arena`; account avatar tiếp tục platform-owned, battle Pet riêng. Không bắt đi qua room để chơi PvE. |
| Social/invite/safety | `social/service.ts`, `invitations`, `safety`, `travel` | Reuse permission/block/consent, không nhét challenge vào travel-intent để bypass scope. Social invite adapter thuộc S2 opt-in; block/revoke phải recheck ở delivery/accept. |
| Wallet/rewards | `progression/ledger.ts`, `progression/policy.ts`, `hospitality/outbox.ts` | Có capped XP/entitlement và durable completion pattern, **không có generic wallet/achievement grant API**. Game-local ledger/currencies riêng; bridge OFF tới khi contract review. Không thêm `'pet-arena'` vào source/world enum để lách validation. |
| Worker/DB | API worker entrypoint, Drizzle SQL journal, PostgreSQL | Cùng DB authority/journal ban đầu, owner reserve số migration thật. Outbox game không dựng room owner; không dùng in-memory queue cho durable rewards. |
| Deployment | API/web/admin image tooling, local Compose, Argo manifests | Local `vc-*` vẫn giữ nguyên. Deploy độc lập Arena là target cần ADR/artifact/runtime/bridge tests PA-019, chưa được implementation bởi docs này. |
| Art/performance | `packages/scene3d`, `docs/design/vnext/animals-3d/budgets-v1.json`, vNext N06 | Proposal2D Pet direction bị thay bởi hướng3D hiện hành. Khóa Arena workload trước đo; preserve original budget bytes và café failures, native owner-deferred. |

Các đường dẫn trong cột source API tương đối với `apps/platform-api/src/` nếu không có prefix khác. Mỗi integration task phải đọc lại source HEAD khi thực thi. Không có auth, persistence, game UX, cross-reward hay deployment Pet Arena được xác minh ở lần review này.

## Topology decision cần PA-001

So sánh hai phương án bằng code/dependency evidence: (A) S1 module trong API hiện hữu, package UI riêng; (B) API/UI artifact độc lập với narrow VLP identity/safety bridge. A giảm duplicate infrastructure, B đạt lifecycle độc lập sớm nhưng cần auth/compatibility/revocation boundary thật. Baseline đề xuất A cho S1, PA-019 chứng minh B hoặc extraction được owner chấp nhận trước S2 release. Không được đổi target “independently deployable” thành feature flag rồi tuyên bố xong.

PA-001/019 phải phân định DB schema owner, credential scope, request/session validation và service revocation, cross-game active-claim policy (PvE trial vs multiplayer active match), migrations, worker, artifact rollback. Không giả game PvE luôn chiếm room slot; cũng không bỏ invariant không có hai multiplayer matches active. Tránh reuse game journal bằng sửa enum/room policy lan rộng làm hỏng N15 evidence.
