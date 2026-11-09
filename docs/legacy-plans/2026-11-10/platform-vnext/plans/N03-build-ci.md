Current checkpoint2026-11-09:source983d257 local API/web/admin18+Compose6 and retained HTTPS update PASS. Fresh output-parent/source-commit validation fixed;report-output safety has actual CLI positive/negative evidence,with2unrecoverable auxiliary Lounge HTML indexes explicitly recorded. See [delivery](../audit/N03-04-FRESH-CHECKOUT-ACCEPTANCE.json) and [custody guard](../audit/N03-04-REPORT-OUTPUT-CHECKPOINT.json). Current source hosted Quality is not yet verified;N06-04 Sandbox performance still fails. Historical task statuses stay source-bound.

# N03 — Build images và CI đáng tin

**Owner lane:** Foundation/CI  
**Activation:** active · **Implementation:** TODO  
**Goal:** Build once, verify artifact thật, publish immutable images và giữ quality gate mọi loại PR.

## Phạm vi file dự kiến

- `infra/docker/*`
- `.github/workflows/*`
- `package.json`
- `pnpm-lock.yaml`
- `apps/*/next.config.*`
- `scripts/ci-*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N03-01 — Pin và tái lập toolchain/build graph

**Depends on:** N01-05, N02-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 40

**Deliverables**

- Toolchain compatibility matrix, frozen lock build, workspace target map

**Acceptance / Definition of done**

- Giữ pins được audit; mọi upgrade riêng lý do/test.
- Shared package changes ảnh hưởng mọi consumer; ban đầu build all.
- PR fork không có secrets/publish permission.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm install --frozen-lockfile`
- `pnpm ci:check`
- `pnpm check`

Scenario / evidence:

- Xác minh package graph và phiên bản thực có thể cài trong CI.

**Rollback / recovery:** Revert tooling PR độc lập, không hoán đổi stack.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N03-02 — Harden API image và migrator target

**Depends on:** N03-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 41

**Deliverables**

- vlp-api runtime image; migrations và runtime dependency closure

**Acceptance / Definition of done**

- Multi-stage, non-root, production dependencies; không FROM build giữ toàn workspace.
- API và migrate dùng cùng digest; worker entrypoint chỉ thêm khi N05-05 có code.
- Image smoke khởi động thật với DB test và signals.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm build`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm image:check --target=api`

Scenario / evidence:

- SBOM/secret scan/runtime file inspection; SIGTERM + owner release test.

**Rollback / recovery:** Giữ previous digest; revert Docker target, không schema rollback tự động.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N03-03 — Harden portal web image

**Depends on:** N03-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 42

**Deliverables**

- vlp-web image; Next runtime assets/standalone phù hợp

**Acceptance / Definition of done**

- Runtime chứa đúng assets/server files cần; API origin runtime-config phù hợp.
- Không bake secrets hoặc build-time internal-only URL vào client bundle.
- HTTPS/socket proxy behavior giữ tương thích.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm build`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm image:check --target=web`

Scenario / evidence:

- Chạy portal thực bằng image, kiểm browser runtime và asset cache headers.

**Rollback / recovery:** Rollback portal digest; giữ asset compatibility cho client cũ.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N03-04 — Quality CI, registry publish và release manifest

**Depends on:** N03-02, N03-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 43

**Deliverables**

- PR validation + trusted-main image publish, SBOM/provenance, source/digest manifest

**Acceptance / Definition of done**

- Required aggregate luôn kết thúc đúng; skipped unrelated jobs không để Pending và không fail-open.
- Mọi digest có source SHA/test run; không dùng latest trong deploy.
- Docs/overlay-only commit không publish vòng lặp; security lane hiện hữu được giữ.
- Enforcement preflight ghi rõ required checks/rulesets thực sự khả dụng. Nếu chưa có hoặc chưa xác minh, tắt auto-merge/prod auto-promotion và dùng owner promotion xác minh đúng SHA/checks/digests; không gọi đó là technical branch protection.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm ci:check`
- `pnpm check`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm release-manifest:check`

Scenario / evidence:

- Test source/shared-dep/lockfile/docs/overlay-only PR matrix và workflow failure.

**Rollback / recovery:** Disable publish job bằng config, giữ verification; không xóa released digests.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N03-05 — Thêm admin build vào cùng quality contract

**Depends on:** N03-04, N07-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 44

**Deliverables**

- vlp-admin image, publish target và image tests

**Acceptance / Definition of done**

- Admin secret/query tokens không nằm trong browser bundle.
- Build/CI có admin source closure và route smoke.
- Release set ghi từng artifact và source SHA; không yêu cầu admin image trước khi code tồn tại.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm typecheck`
- `pnpm build`
- `pnpm ci:check`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm image:check --target=admin`

Scenario / evidence:

- Unauthenticated route protection và sanitized config test.

**Rollback / recovery:** Rollback admin-only digest; API contracts vẫn tương thích.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

