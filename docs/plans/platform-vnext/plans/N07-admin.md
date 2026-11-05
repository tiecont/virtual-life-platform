# N07 — Một tài khoản admin và điều hành platform

**Owner lane:** Admin + Runtime  
**Activation:** active · **Implementation:** TODO  
**Goal:** Dashboard có thể quản trị nghiệp vụ và nhìn trạng thái live nhưng không mang quyền cluster/DB ra browser.

## Phạm vi file dự kiến

- `apps/admin-web/*`
- `apps/platform-api/src/operations/*`
- `apps/platform-api/src/identity/*`
- `packages/contracts/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N07-01 — Operator identity, MFA và audit

**Depends on:** N02-03, N05-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 70

**Deliverables**

- Singleton operator bootstrap, separate session, passkey/MFA/step-up và audit model

**Acceptance / Definition of done**

- Đúng một operator human account; không public admin signup hoặc hidden second admin.
- Player session không trở thành admin; moderator/game role không nâng quyền.
- Recovery cho cùng identity; revoke/CSRF/rate limits/idle expiry tested.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test:security`
- `pnpm test:integration`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:admin`

Scenario / evidence:

- Authz deny matrix, replay, step-up expiry, redacted immutable audit.

**Rollback / recovery:** Disable admin ingress; revoke operator sessions; giữ audit append-only.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N07-02 — Admin shell và backend proxy boundaries

**Depends on:** N07-01, N06-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 71

**Deliverables**

- apps/admin-web, navigation/design, authenticated BFF/proxy

**Acceptance / Definition of done**

- Không telemetry/Argo/Kube token trong browser bundle.
- Metrics proxy only allowlisted queries/ranges, read-only credentials, cache và query budget.
- Operator UI có error/stale/unauthorized states.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:admin`

Scenario / evidence:

- Unauth access, direct API bypass và token exposure inspections.

**Rollback / recovery:** Private ingress off hoặc previous admin image.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N07-03 — Events/accounts/runtime controls

**Depends on:** N07-01, N02-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 72

**Deliverables**

- Event calendar draft/publish/cancel; account suspend/revoke; flags/maintenance/audit UI

**Acceptance / Definition of done**

- All writes server-validated, versioned, reason+before/after audit; no arbitrary SQL/shell.
- Account views minimize private data; deletion/export workflow có status và retention policy.
- Admin runtime switch không vượt Git release entitlement; single operator có thể thao tác scope cho phép.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test:integration`
- `pnpm test:security`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:admin`

Scenario / evidence:

- Concurrency edits/optimistic conflict, expired auth, double-click và revoked user sockets.

**Rollback / recovery:** Compensating config/event version qua audited command; không xóa audit/reward history.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N07-04 — Overview, live system map và traffic

**Depends on:** N07-02, N08-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 73

**Deliverables**

- Operational dashboard: metrics, topology, versions, queue state và freshness

**Acceptance / Definition of done**

- Configured edges và observed traffic phân biệt; traffic0 khác datasource unreachable.
- Metrics gồmHTTP/WS/player/admitted counts, DB health/pool/waits, event-loop, latency/error, worker backlog.
- Missing/stale metrics hiển thị UNKNOWN, không tự fill0/healthy.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:admin`

Scenario / evidence:

- Feed synthetic fresh/stale/error/zero traffic fixtures rồi actual scrape staging.

**Rollback / recovery:** Read-only page fallback; không ảnh hưởng gameplay khi datasource timeout.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N07-05 — Triển khai admin riêng với access boundary

**Depends on:** N03-05, N04-04, N07-03, N07-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 74

**Deliverables**

- Private admin deployment, audit evidence và release/backup status view

**Acceptance / Definition of done**

- Ingress/TLS/session headers và role checks thật đều đạt.
- Argo/GitHub release view read-only; infrastructure writes qua GitOps workflow.
- Một operator account được kiểm chứng; service creds không dùng như interactive login.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:deploy`
- `pnpm test:admin`

Scenario / evidence:

- Public edge denial, player auth denial, operator positive flow, logout and revoke.

**Rollback / recovery:** Rollback admin image/ingress; keep API admin guards deny-by-default.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

