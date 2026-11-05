# N02 — Domain boundaries và lifecycle cấu hình

**Owner lane:** Runtime + Coordinator  
**Activation:** active · **Implementation:** TODO  
**Goal:** Tạo ranh giới rõ trong monolith và chính sách cấu hình/migration đủ để triển khai, không mở dịch vụ rỗng.

## Phạm vi file dự kiến

- `apps/platform-api/src/*`
- `packages/contracts/*`
- `packages/world-sdk/*`
- `scripts/check-boundaries.mjs`
- `config/*`
- `docs/adr/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N02-01 — Lập module API và dependency graph

**Depends on:** N00-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 30

**Deliverables**

- Current-to-target ownership map, public module ports và forbidden imports

**Acceptance / Definition of done**

- Accounts/social/safety/rooms/travel/engines/worlds/operations có owner.
- Giữ một DB và migration journal; world không đọc repo/SQL world khác.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm architecture:check`
- `pnpm lint`

Scenario / evidence:

- Kiểm callgraph thực, đặc biệt app.ts và room-dependent engines.

**Rollback / recovery:** Chỉ đổi map/rules; rollback rule mới nếu chặn import hợp lệ có lý do.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N02-02 — Refactor module từng vertical slice

**Depends on:** N02-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 31

**Deliverables**

- Một module/PR chuyển boundary/exports; worker-ready composition seams

**Acceptance / Definition of done**

- Không đổi behavior cùng rename hàng loạt.
- Giữ compatibility exports khi consumer chưa chuyển.
- Không tạo domains/ và modules/ chứa bản sao implementation.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`

Scenario / evidence:

- Chạy subsets phù hợp mỗi PR; full regression khi chạm composition root/shared contracts.

**Rollback / recovery:** Revert từng PR/module, giữ DB schema không đổi.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N02-03 — Chuyển offline guards thành policy theo environment

**Depends on:** N02-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 32

**Deliverables**

- Versioned release policy + runtime config model; updated guard tests

**Acceptance / Definition of done**

- Default deny; production installer thật, không chỉ flip false.
- GitOps entitlement giới hạn runtime switches; admin không bypass gates.
- Old offline fixtures tiếp tục được test; một admin principal thay vì yêu cầu giả sáu người mới.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm governance:check`
- `pnpm infra:check`
- `pnpm test`
- `pnpm test:security`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm release-policy:check`

Scenario / evidence:

- Test dev/staging/prod và missing policy/version/unknown world => deny.

**Rollback / recovery:** Revert policy writer/readers, giữ effective world OFF khi mismatch.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N02-04 — Schema compatibility cho migration và rollback

**Depends on:** N02-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 33

**Deliverables**

- Compatibility manifest, checksum-prefix policy, expand/contract ADR

**Acceptance / Definition of done**

- Giải quyết readiness exact manifest hiện tại bằng policy có test, không bỏ checksum guard.
- Image N-1 phải chạy trên schema N khi được khai tương thích.
- Unknown incompatible schema fail closed; destructive contract migration là phase riêng.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test:integration`
- `pnpm infra:check`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:migration-compat`

Scenario / evidence:

- Dùng DB test disposable với schema38, N expand và N-1 runtime; xác minh rollback thật.

**Rollback / recovery:** Rollback code tới compatible image; không tự down-migrate dữ liệu.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

