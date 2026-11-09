# N12 — Regression, recovery và release

> Revision2.4: web deployment/recovery/release remains active;N12-03 native is DEFERRED_APPROVED. N12-01/04/05 still require platform compatibility when the corresponding supported/distributed context is true or unknown. No mobile device/store gate for web-only development while no native binary is supported/distributed.

**Owner lane:** Coordinator + QA/Operations  
**Activation:** active · **Implementation:** TODO  
**Goal:** Chứng minh platform từ image đến gameplay/ops/recovery; tách technical readiness khỏi phát hành thật.

## Phạm vi file dự kiến

- `tests/deployment/*`
- `tests/e2e/*`
- `docs/runbooks/*`
- `docs/evidence/index/*`
- `config/*`

Path mới là đề xuất; kiểm HEAD và consumers trước khi thay đổi. Chỉ coordinator thay contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

- [CachyOS và Android-first](../architecture/05-CACHYOS-ANDROID-FIRST.md)

## Tasks

### N12-01 — Deployment regression end-to-end

**Depends on:** N04-04, N05-04, N07-05, N09-05  
**Trạng thái ban đầu:** TODO  
**Priority:** 130

**Conditional compatibility gates**

- `android_clients_distributed` true/unknown → N12-03. Required when Android context true or unknown; false only while no supported/distributed Android binary exists.
- `ios_clients_distributed` true/unknown → N14-04. Required when iOS context true or unknown; false only while no supported/distributed iOS binary exists.

**Deliverables**

- 15-scenario matrix theo architecture02 với source/digest/environment artifacts

**Acceptance / Definition of done**

- Cover bootstrap/TLS/session/socket/old-new/migration fail/lock loss/drain/revert/private ops/assets/workflows.
- Không dùng health200 thay gameplay smoke.
- Failures không hidden bằng retry-only report; retain attempts and final outcomes.
- CD-10 native subcases được đánh applicability theo platform. Android supported/distributed yêu cầu N12-03; iOS supported/distributed yêu cầu N14-04. Platform chưa tồn tại là NOT_APPLICABLE kèm lý do, không PASS.

**Verification**

Scripts/commands đã có ở baseline; xác minh lại tại HEAD:

- `pnpm ci:browser`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:deploy`

Scenario / evidence:

- Staging full sync from immutable artifact, actual player/admin/queue flows.

**Rollback / recovery:** Revert release set, collect incident/evidence, keep data integrity.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N12-02 — Backup restore, failure drills và operational handoff

**Depends on:** N08-05, N12-01, N05-05  
**Trạng thái ban đầu:** TODO  
**Priority:** 131

**Deliverables**

- Encrypted off-host backup/restore exercise, alert/incident runbooks, observed RPO/RTO

**Acceptance / Definition of done**

- Restore vào target trống có checksum/schema/business invariants và cleanup.
- RPO/RTO là kết quả thực và target riêng; local2.9s historical không làm production SLA.
- No false live status khi alert destination/rotation/backup cadence chưa configured.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm ops:recovery-check`

Scenario / evidence:

- DB outage/full disk/owner crash/worker poison/failed migration; chosen scopes bounded staging.

**Rollback / recovery:** Execute documented recovery; no overwrite occupied database.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N12-03 — Android/server version compatibility gate

**Depends on:** N11-01, N11-02, N11-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 132

**Deliverables**

- Android supported N/N-1 binary matrix với server candidate và rollback; iOS matrix thuộc N14-04

**Acceptance / Definition of done**

- Install/update/mixed client, expired auth/ticket, old asset manifest và protocol error đúng.
- Breaking backend change không phát hành trước compatible mobile availability/window.
- Android physical install/update/reconnect evidence bắt buộc; iOS chưa supported/distributed là NOT_APPLICABLE kèm lý do, không PASS. N14-04 bắt buộc riêng khi ios_clients_distributed=true hoặc unknown.
- First native release chưa có N-1 thật: ghi NOT_APPLICABLE cho previous released build, chạy current candidate và lưu làm baseline. Từ build sau thử toàn bộ supported window; không tạo số liệu N-1 giả.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:protocol`
- `pnpm mobile:verify`

Scenario / evidence:

- Android signed candidates có thể cài tại máy trước store beta, nên gate này không chờ N11-04. Evidence phải gắn đúng backend candidate/rollback và actual supported binaries.

**Rollback / recovery:** Keep previous supported protocol endpoints/assets; postpone breaking change.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N12-04 — Web beta/production readiness dossier

**Depends on:** N06-05, N12-02, N09-05  
**Trạng thái ban đầu:** TODO  
**Priority:** 133

**Conditional compatibility gates**

- `android_clients_distributed` true/unknown → N12-03. Required when Android context true or unknown; false only while no supported/distributed Android binary exists.
- `ios_clients_distributed` true/unknown → N14-04. Required when iOS context true or unknown; false only while no supported/distributed iOS binary exists.

**Deliverables**

- Concrete release candidate source/digests/cap config/risk/rollback dossier

**Acceptance / Definition of done**

- All relevant gates satisfied with fresh evidence; current hardware capacity measured.
- One-operator operating policy explicit: maintenance/disable higher-risk features when unattended.
- Technically ready not public released; owner sees exact candidate to approve at release step.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm release:readiness`

Scenario / evidence:

- Verify every gate/evidence validity; no need wait for optional scaling N13 or mobile if web release scope separate.

**Rollback / recovery:** Candidate stays staging/closed until release action authorized.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.

### N12-05 — Phát hành có scope và theo dõi sau deploy

**Depends on:** N12-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 134

**Conditional compatibility gates**

- `android_clients_distributed` true/unknown → N12-03. Required when Android context true or unknown; false only while no supported/distributed Android binary exists.
- `ios_clients_distributed` true/unknown → N14-04. Required when iOS context true or unknown; false only while no supported/distributed iOS binary exists.

**Deliverables**

- Approved promotion PR merged when authorized, Argo actual rollout, observation report

**Acceptance / Definition of done**

- Only actual approved environment/candidate; verify smoke/capacity/alerts after promotion.
- No auto scaling API singleton, no hidden public worlds.
- Observe rollback triggers and execute documented Git revert if needed; report actual live status.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:deploy`

Scenario / evidence:

- External release approval applies here, not to earlier implementation; if absent BLOCKED_EXTERNAL and report candidate complete.

**Rollback / recovery:** Git revert to compatible prior digests; runtime disable/admission pause if emergency.

**Required evidence:** source SHA/diff hash, environment/device, command + exit code, acceptance từng mục, artifact refs/hash, limitations và exact next action. Không ghi secrets; không gọi historical results là fresh verification.
