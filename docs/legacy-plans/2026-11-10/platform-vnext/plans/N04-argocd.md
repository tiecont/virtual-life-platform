# N04 — Kubernetes và ArgoCD cùng repository

**Owner lane:** Foundation/CI  
**Activation:** active · **Implementation:** TODO  
**Goal:** Git desired state trên cùng repo; singleton rollout đúng và promotion traceable; không custom reconciler.

## Phạm vi file dự kiến

- `infra/k8s/*`
- `infra/argocd/*`
- `.github/workflows/*`
- `docs/runbooks/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N04-01 — Kustomize base/overlays và cluster preflight

**Depends on:** N03-04, N02-03, N02-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 60

**Deliverables**

- Manifests staging/prod, resource budget, prerequisites inventory

**Acceptance / Definition of done**

- Replicas API=1; Recreate, probes, shutdown grace và private network defaults.
- Database/PVC/secrets có lifecycle riêng, không nằm trong prune destructive mặc định.
- Manifests render/schema validate được; architecture node/ingress/pull secrets xác minh.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm infra:check`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm k8s:validate`

Scenario / evidence:

- Kustomize render + schema validation/local cluster dry-run; live cluster credentials là blocker riêng.

**Rollback / recovery:** Revert manifest PR; không xóa persistent resources.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N04-02 — Promotion digest trong cùng repo không loop

**Depends on:** N04-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 61

**Deliverables**

- Release/promotion workflow và immutable tested release set

**Acceptance / Definition of done**

- Image publish không tự làm cluster update; overlay digest commit mới kích hoạt desired state.
- GitHub App/bot quyền hẹp; required CI thực chạy trên bot PR.
- Staging/prod promote cùng digest, không rebuild khác artifact.
- Local bot-event fixtures không chứng minh hosted CI trên bot PR đã chạy. Phải có run/commit thật trước khi bật automatic promotion; enforcement unavailable dùng fallback owner review, không tự mua gói hoặc public repo.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm ci:check`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm release-manifest:check`
- `pnpm k8s:validate`

Scenario / evidence:

- Exercise bot PR hoặc local event fixtures; không dùng skip-ci che required gate.

**Rollback / recovery:** Revert promotion commit tới previous compatible release set.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N04-03 — Full sync lifecycle và singleton drain

**Depends on:** N04-02, N05-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 62

**Deliverables**

- Argo Applications, migration hooks, PostSync smoke, rollback runbook

**Acceptance / Definition of done**

- Secrets/DB prerequisites tồn tại trước PreSync; hook idempotent/locked/bounded.
- Không selective-sync bypass migration gate; PostSync failure không tự coi rollback đã diễn ra.
- UI/players thấy reconnect/maintenance đúng khi Recreate gián đoạn ngắn.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:deploy`

Scenario / evidence:

- Test full sync success/failure/duplicate hook/old owner shutdown bằng local hoặc staging cluster.

**Rollback / recovery:** Git revert digest compatible; schema forward fix nếu không tương thích.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N04-04 — Chạy staging deployment thật và ghi release evidence

**Depends on:** N04-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 63

**Deliverables**

- Observed Argo revision/digests, TLS/WS browser smoke và failure logs

**Acceptance / Definition of done**

- No Kubernetes access => BLOCKED_EXTERNAL cho task này, không fabricate deploy success.
- Healthy pods + gameplay flow + private ops edge + migration actual đều đạt.
- Có first-bootstrap, image-pull failure và rollback rehearsal phù hợp.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:deploy`

Scenario / evidence:

- Actual authorized staging, không production/public release; capture sanitized Argo events/status.

**Rollback / recovery:** Revert desired release set; preserve DB and evidence.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

