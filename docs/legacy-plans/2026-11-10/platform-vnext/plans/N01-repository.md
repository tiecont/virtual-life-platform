# N01 — Repository sạch và evidence bền vững

**Owner lane:** Foundation  
**Activation:** active · **Implementation:** TODO  
**Goal:** Giảm noise/checkout cost nhưng giữ truy vết, fixtures và khả năng chạy clean checkout.

## Phạm vi file dự kiến

- `docs/agent/evidence/*`
- `docs/evidence/*`
- `scripts/verify-*.mjs`
- `scripts/ops-watch.mjs`
- `.gitignore`
- `integrations/legacy-snapshots/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N01-01 — Phân loại file và consumer map

**Depends on:** N00-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 20

**Deliverables**

- Keep/move/archive/remove inventory với hash, size và consumer

**Acceptance / Definition of done**

- Phân biệt runtime source, raw output, evidence JSON dùng bởi verifier, generated assets và legacy fixtures.
- Không suy ra unused chỉ bằng extension hoặc không có direct import.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `rg --files`

Scenario / evidence:

- Rà dynamic imports, fixtures, file-reading scripts và relative documentation links.

**Rollback / recovery:** Inventory-only.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N01-02 — Thiết kế evidence index và archive/restore

**Depends on:** N01-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 21

**Deliverables**

- Evidence schema/index loader; private archive với content hash và restore report

**Acceptance / Definition of done**

- Raw evidence không chứa secrets/PII ngoài policy; access/retention được nêu.
- Hash inventory bao phủ toàn bộ file dự định archive; ít nhất một restore sample thật và kiểm đủ manifest.
- Không dùng artifact URL hết hạn làm bản lưu duy nhất.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm evidence:check`
- `pnpm evidence:restore-smoke`

Scenario / evidence:

- Hai scripts mới cần được implement; storage access thiếu thì giữ file cũ và đánh blocker riêng.

**Rollback / recovery:** Giữ originals đến khi restore và consumers đạt; archive không tự xóa nguồn.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N01-03 — Chuyển validators sang evidence index

**Depends on:** N01-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 22

**Deliverables**

- Loader adapters cho governance/release/ops watch và docs links

**Acceptance / Definition of done**

- Không mất gate cũ; artifact missing/hash mismatch gây fail rõ.
- Historical VERIFIED vẫn gắn đúng SHA/environment, không được dùng thay fresh test của source đổi.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm governance:check`
- `pnpm test`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm evidence:check`

Scenario / evidence:

- Chạy release/ops scripts phù hợp scope cũ và test missing/tampered evidence.

**Rollback / recovery:** Rollback loaders trước khi bỏ raw originals.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N01-04 — Bỏ output đã archive khỏi current tree

**Depends on:** N01-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 23

**Deliverables**

- PR cleanup riêng; .gitignore; compact evidence summaries

**Acceptance / Definition of done**

- Không rewrite Git history.
- Không xóa SQL, lockfile, provenance, .tar fixtures đang dùng.
- Diff không thay runtime behavior; archive IDs/hash có thể truy vết.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm legacy:check`
- `pnpm governance:check`
- `pnpm architecture:check`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm evidence:check`

Scenario / evidence:

- Review classification và restore coverage trước remove.

**Rollback / recovery:** Git revert PR cleanup, restore originals bằng verified archive nếu cần.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N01-05 — Chứng minh clean checkout và docs hiện hành

**Depends on:** N01-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 24

**Deliverables**

- Clean-checkout build/test log; canonical docs index

**Acceptance / Definition of done**

- Build không cần artifact ẩn từ máy tác giả.
- Current docs không mâu thuẫn checkpoint lịch sử.
- Kích thước current tree trước/sau có số thật, không coi Git history đã giảm.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm install --frozen-lockfile`
- `pnpm check`
- `pnpm legacy:prepare`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm evidence:check`

Scenario / evidence:

- Đọc root entrypoints và path links sau cleanup.

**Rollback / recovery:** Revert move/remove phạm vi làm hỏng clean checkout.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

