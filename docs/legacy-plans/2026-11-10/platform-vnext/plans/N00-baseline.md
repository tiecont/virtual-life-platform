# N00 — Baseline và nguồn sự thật hiện hành

**Owner lane:** Coordinator  
**Activation:** active · **Implementation:** TODO  
**Goal:** Khóa phạm vi mới trên code hiện hữu, phân biệt chất lượng lịch sử với kết quả tại HEAD, tránh scaffold lại hoặc reset công việc đã làm.

## Phạm vi file dự kiến

- `AGENTS.md`
- `MASTER-AGENT-PLAN.md`
- `docs/agent/*`
- `docs/architecture/*`
- `docs/plans/platform-vnext/*`

Path mới là đề xuất; kiểm HEAD và consumers trước khi thay đổi. Chỉ coordinator thay contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N00-01 — Xác minh baseline tại HEAD đang làm

**Depends on:** —  
**Trạng thái ban đầu:** TODO  
**Priority:** 1

**Deliverables**

- Repository inventory, versions, clean/dirty status, CI run và baseline report

**Acceptance / Definition of done**

- Pin SHA/diff; đọc scripts thật và migrations; ghi kết quả từng lane, cả lỗi sẵn có/blocker.
- Audit task có thể hoàn tất với baseline failures được ghi đúng; không biến nó thành release pass.
- Không sửa source hoặc dữ liệu legacy/production để ép baseline xanh.

**Verification**

Scripts/commands đã có ở baseline; xác minh lại tại HEAD:

- `git status --short`
- `git rev-parse HEAD`
- `pnpm install --frozen-lockfile`
- `pnpm check`
- `pnpm ci:browser`

Scenario / evidence:

- Browser/DB lanes chỉ chạy trong môi trường test được cấu hình; báo rõ nếu chưa chạy.

**Rollback / recovery:** Chỉ thêm báo cáo baseline; revert documentation nếu sai, giữ logs gốc.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N00-02 — Tích hợp plan vNext và sửa docs drift

**Depends on:** N00-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 2

**Deliverables**

- Link root master tới vNext; current architecture/evidence index; old-doc history labels

**Acceptance / Definition of done**

- 151 task Mxx và mọi evidence cũ được giữ.
- Mobile/Kubernetes mới thuộc scope được chủ dự án yêu cầu; offline handoff cũ không ngăn scope mới.
- Không ghi APPROVED cho public/store release chưa được duyệt.

**Verification**

Scripts/commands đã có ở baseline; xác minh lại tại HEAD:

- `pnpm governance:check`
- `pnpm architecture:check`

Scenario / evidence:

- Đối chiếu current source với docs ARCHITECTURE/JOURNEY/HANDOFF; ghi date/SHA.
- Chạy helper đã có sẵn trong gói sau integration: node docs/plans/platform-vnext/tools/validate-plan.mjs.

**Rollback / recovery:** Revert links/labels; không sửa task-state Mxx.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N00-03 — Inventory môi trường đích và assumptions

**Depends on:** N00-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 3

**Deliverables**

- Server/device/region/runtime matrix; unresolved assumptions có owner

**Acceptance / Definition of done**

- Ghi CPU/RAM/disk/network/cluster/ingress, load generator host, target Android/iOS nếu biết.
- Thông tin chưa được cung cấp là UNKNOWN, không tự gán máy 2vCPU/4GB hay CCU.
- Thiếu credentials không chặn design/local validation.
- Ghi profile CachyOS + một Android là thông tin user cung cấp; CPU/RAM/GPU/model/OS chưa đo thì UNKNOWN. Thiếu Mac/iPhone không chặn baseline web/backend/Android.

**Verification**

Scenario / evidence:

- Read-only inventory trên server chỉ khi có access; không install hoặc mua tài nguyên.

**Rollback / recovery:** Không có runtime mutation.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N00-04 — Ghi ADR baseline và ownership

**Depends on:** N00-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 4

**Deliverables**

- ADR cho modular monolith/images/GitOps/authority/mobile/admin/admission; owner matrix

**Acceptance / Definition of done**

- Giữ stack audited; quyết định có lý do/tradeoff/trigger xem lại.
- Một operator user; service accounts không bị nhầm thành user admin.
- Current restrictions được xử lý theo yêu cầu mới, không tạo approval gate vô ích cho code preparation.

**Verification**

Scripts/commands đã có ở baseline; xác minh lại tại HEAD:

- `pnpm architecture:check`

Scenario / evidence:

- Review contracts và quyết định trong architecture/00, không yêu cầu owner phê duyệt lại các bước routine.

**Rollback / recovery:** Supersede ADR bằng lý do; không rewrite ADR lịch sử.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.
