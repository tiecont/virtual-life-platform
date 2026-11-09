# PHASE 2 — MASTER AGENT PLAN: Lantern Lodge

> Owner revision 2026-11-09: [web/server first; mobile later](games/10-WEB-FIRST-EXECUTION.md). N15–N18 and N19 platform work use web/responsive browser scope. N19-04 native is DEFERRED_APPROVED; no physical Android/APK/AVD prerequisite blocks web features. Existing sequential wave/art/privacy/authority/release gates remain.

**Scope:** 5 module `N15`–`N19`, 25 task. **Source:** v2.2 ZIP + owner animal/landscape requirement 2026-11-06; tách riêng để vận hành sau kế hoạch Phase 1 đang chạy. **Current state:**4accepted foundation tasks;read state/handoff for scheduling and owner-deferred native scope.

## 1. Điều kiện bắt đầu, không làm phiền Phase 1

- Phase 2 implementation agent **không** sửa `docs/plans/platform-vnext/{PLAN-MANIFEST.json,state/*,MASTER-AGENT-PLAN.md}`, root `AGENTS.md`, các checkpoint M00–M24 hoặc source khi Phase 1 còn agent làm việc. Phase 1 coordinator được đồng bộ planning requirements theo yêu cầu owner vào cả hai plan; việc cập nhật docs đó không kích hoạt Phase 2 hoặc chuyển source ownership.
- Phase 2 dùng **trạng thái riêng** tại `state/task-state.json`; chỉ đọc Phase 1 để đối chiếu các `upstream_requires`.
- Chỉ bắt đầu khi có **handoff rõ ràng** từ Phase 1 + owner đồng ý + không còn agent khác sở hữu files trùng phạm vi.
- Không đòi tất cả task upstream `VERIFIED`: N13 scale, N14 iOS và public rollout có thể là điều kiện riêng. Mỗi task Phase 2 chỉ đòi đúng các **upstream prerequisites** của nó, gồm visual3D khi có liên quan; activation vẫn cần Phase1 dừng tại một checkpoint.
- Không chạy đồng thời hai scheduler có N15–N19. Nếu Phase 1 đang chạy bản v2.2 đầy đủ, phải chọn **một** scheduler, bảo toàn mọi state/evidence trước chuyển giao; đọc [INTEGRATION-GUIDE.md](INTEGRATION-GUIDE.md).

## 2. Định hướng sản phẩm

Làm một world gốc `lantern-lodge` (Hội Quán Ánh Đèn), ba mode `lantern-colors`, `mask-and-tell`, `mistbound-routes`. Owner cập nhật sang **animals3D có hoạt ảnh/lông chi tiết và UI gameplay đẹp cho web/mobile**, thay baseline2D; [3D addendum](games/09-3D-ART-ADDENDUM.md) dùng shared renderer/creator Phase1, Android Emulator chỉ bổ sung development. Không sao chép artwork, tên thương hiệu, thẻ bài có nhận diện hay luật độc quyền của Party Animals; luật gợi ý đã ghi tại `games/`.

Yêu cầu owner 2026-11-06: [gameplay ngang và animal art](games/08-ANIMAL-LANDSCAPE-ART.md), dùng chung creator theo từng bộ phận/appearance với toàn Virtual Life, ưu tiên cảnh và nhân vật đẹp mắt. N15-05 thêm upstream N06-09 để shell Lodge dựa trên visual slice đã kiểm chứng; không sản xuất hệ avatar riêng. Style cụ thể và artwork vẫn cần review thật.

**Core invariants:** giữ RoomAuthority singleton hiện hữu, seat game riêng seat room, một user không có hai match active, không tiết lộ bài/vai trò/đích ẩn, server-authoritative RNG/deadlines/commit, những kết quả không chắc chắn khi reconnect phải được giải quyết bằng receipt/snapshot. Spectator OFF ở v1; report/moderation và privacy luôn nằm ở platform owner hiện tại.

## 3. Lộ trình tuần tự có chất lượng

| Wave | Module | Outcome / acceptance gate |
|---|---|---|
| W0 | N15 | GameSession contract, encrypted match journal, Lodge world và shared UI được kiểm chứng (`N15-05`) |
| W1 | N16 | Sắc Đèn chơi trọn một ván và pilot có evidence (`N16-05`) |
| W2 | N17 | Mặt Nạ chơi trọn một ván và pilot bảo mật bluff (`N17-05`) |
| W3 | N18 | Hải Đồ có cả hai lối thắng, kiểm phe ẩn và pilot (`N18-05`) |
| W4 | N19 | Cross-game web QA, metrics, admin và staged internal playtest; native N19-04 deferred |

Mỗi wave sau không được scheduler mở nếu task milestone của wave trước chưa `VERIFIED`. Việc này cố ý nghiêm ngặt hơn DAG chung v2.2 để tránh agent dàn trải khi bạn đã có plan khác chạy.

## 4. Bootstrap và execute

1. Đọc root `AGENTS.md`, source HEAD/working tree, **handoff thực** từ Phase 1; không reset source. Đọc `START-HERE.md`, `PLAN-MANIFEST.json`, `state/phase-gate.json` và module plan đúng task.
2. Chạy `tools/validate-plan.mjs`, `tools/check-upstream.mjs`, rồi `tools/next-task.mjs`; nếu status = `WAITING` hoặc `CONFLICT`, không tự kích hoạt.
3. Với task được mở: viết acceptance tests hoặc scenario có thể tái hiện; code **một vertical slice**, chạy lint/typecheck/test/build đúng ảnh hưởng, UI cần E2E/ảnh, backend cần races/security/protocol.
4. Ghi evidence (`taskId`, SHA/diff, môi trường, lệnh + exit, artifacts/hash, limitations), cập nhật **state của Phase 2** và `state/HANDOFF.md`; commit/PR theo quyền chủ dự án.
5. Giữ flags OFF trừ phạm vi test/staging được duyệt; không deploy public, mua dịch vụ, phát hành Steam/App Store hoặc mở dating chỉ vì game tests pass.

## 5. Report mỗi phiên

`Task IDs / Changed files / Tests actually run & exit / Git SHA / Migrations / Security & privacy evidence / Known failures / Blockers / Next exact action`.

Mọi task và acceptance được ghi nguyên trong [manifest](PLAN-MANIFEST.json) và `plans/N15*`–`plans/N19*`. Handoff cũ của Phase 1 vẫn là nguồn để kiểm chứng prerequisite, không phải nơi ghi progress mới.
