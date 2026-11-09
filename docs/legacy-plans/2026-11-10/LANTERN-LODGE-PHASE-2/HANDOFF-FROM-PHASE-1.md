# Yêu cầu bàn giao từ agent Phase 1 (khi hoàn thành phạm vi đang chạy)

**Không gửi yêu cầu này để agent dừng giữa task.** Dùng khi agent đang chạy hoàn tất đợt công việc và có checkpoint an toàn.

## Thông tin cần bàn giao

- Repository path, branch, HEAD SHA, dirty/untracked status, list PR/commits chưa merge.
- Trạng thái thực tế của `docs/plans/platform-vnext/state/task-state.json` (hoặc plan trước tương đương); không copy trạng thái từ ZIP cũ.
- Evidence của các predecessor Phase 2: N00-02, N02-01, N02-04, N05-01, N05-04, N05-06, N06-01, N06-02, N07-03, N08-01, N10-04 — ghi `VERIFIED` / `NOT_VERIFIED` / `BLOCKED` đúng theo từng task; không đánh dấu đủ khi chưa chạy.
- Kiến trúc thực tế tại HEAD: World SDK, RoomAuthority/single process guard, Socket contract, DB migration journal, admin, client shared, Android env. Những thay đổi từ SHA audit cũ và test regression.
- Migration compatibility và kết quả schema checksum/backup-restore/drain; tên commands và exit codes thật.
- Danh sách agent/process/worktree/PR còn đang sửa những file liên quan game (`packages/contracts`, `apps/platform-api`, `packages/game-client`, `packages/pixi-scene`, `apps/portal-web`, `tests`, `infra`, `docs`).
- Quyết định release hiện tại; public, content rights, moderation coverage chưa đủ là blocker; không gán quyền mặc định.
- Nếu state đang chứa N15–N19, liệt kê ID đã bắt đầu và evidence cần chuyển, chọn một scheduler sở hữu task; không chạy kế hoạch này song song.

## Template ghi vào state/PHASE1-HANDOFF.md (chỉ tạo sau khi có dữ liệu thật)

```md
# Phase 1 -> Lantern Lodge Phase 2 handoff
Date/time:
Repository/branch:
HEAD SHA:
Clean/dirty + changes:
Upstream state file + SHA:
Confirmed prerequisite IDs + evidence:
Incomplete prerequisites:
Overlapping agent/edit ownership:
Existing N15-N19 scheduling? (yes/no):
Migrations/schema compatibility:
CI/security/e2e actual outcomes:
Content & public release constraints:
Owner authorization reference:
Next exact action: N15-01 after gate + prerequisites, else identify blocker.
```

**Không ghi `PHASE1-HANDOFF.md` bằng dữ liệu tưởng tượng.** Việc `phase-gate.json` được sửa thủ công chỉ là signal điều phối, không thay test proof.
