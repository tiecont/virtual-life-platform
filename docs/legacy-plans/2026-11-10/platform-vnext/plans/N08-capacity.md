# N08 — Observability, load lab và capacity

**Owner lane:** Operations + Runtime  
**Activation:** active · **Implementation:** TODO  
**Goal:** Biết hệ thống đang làm gì và đo sustainable capacity trên workload/hardware thực, không nhầm socket cap với CCU.

## Phạm vi file dự kiến

- `apps/platform-api/src/operations/*`
- `infra/observability/*`
- `tests/load/*`
- `apps/admin-web/*`
- `docs/evidence/index/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N08-01 — Metrics/traces/logs contracts có freshness

**Depends on:** N05-02, N02-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 90

**Deliverables**

- Histogram/counter metrics, bounded labels, safe tracing, health/traffic schemas

**Acceptance / Definition of done**

- Thay lifetime upper-bound p95 bằng percentile theo cửa sổ đúng hoặc label rõ approximation.
- No account/session/private-room identifiers trong labels và no tokens/chat dumps.
- Metric sample timestamp/source/version có trong dashboard contract.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test`
- `pnpm test:integration`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm observability:check`

Scenario / evidence:

- Cardinality, redaction, time-window histogram và missing-source cases.

**Rollback / recovery:** Giữ original endpoint adapter; tắt expensive tracing trước nếu overhead vượt budget.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N08-02 — Collector, dashboards, alerts và backup visibility

**Depends on:** N08-01, N04-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 91

**Deliverables**

- Prometheus/collector cấu hình theo resource budget, alert rules và ops panels

**Acceptance / Definition of done**

- Actual staging scrape + deliberately triggered test sink alert chứng minh plumbing.
- Freshness, disk/DB connection pressure, unavailable owner, queue age và backup/restore age monitored.
- External alert recipient/delivery chỉ thiết lập khi owner đã cho scope; không gọi rule file là alert delivered.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm observability:check`

Scenario / evidence:

- Budget includes Argo/K8s/DB/web/telemetry overhead trên cùng host nếu có; test stale collector.

**Rollback / recovery:** Disable/shed noncritical collector load; keep local logs and essential health.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N08-03 — Load runner và admin launch controls

**Depends on:** N07-01, N08-01, N04-04, N07-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 92

**Deliverables**

- Socket.IO-aware workload runner image, staging Job templates và start/cancel API/UI

**Acceptance / Definition of done**

- Fixed signed/pinned runner image và profiles; no arbitrary URL/command/namespace.
- Quota/NetworkPolicy/activeDeadline/TTL/kill switch; load generator tách khỏi API và target host khi đo capacity.
- Giữ local bench guards; tạo staging harness riêng có allowlist, fake accounts và cleanup.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:load-control`

Scenario / evidence:

- Forbidden target/prod/localhost/private credential injection, cancel idempotency, job crash cleanup.

**Rollback / recovery:** Disable launch permission; cancel bounded owned jobs; retain report.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N08-04 — Đo mixed workload trên môi trường mục tiêu

**Depends on:** N08-02, N08-03, N05-03, N05-05  
**Trạng thái ban đầu:** TODO  
**Priority:** 93

**Deliverables**

- Step/ramp/burst/soak/reconnect profile reports với hardware/network/digest

**Acceptance / Definition of done**

- Mix movement/focus/orders/travel/joins/NAT reconnect/DB+TLS, accepted vs rejected rõ.
- Proposed gate: mỗi step đủ ổn định, >=30min steady capacity, >=2h soak release; không coi120s là leak test.
- Điểm dừng resource/SLO bounded; highest connected khác highest admitted/active; no fabricated CCU.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm load:staging --profile=mixed-capacity`

Scenario / evidence:

- Đo host thực hoặc tương đương có disclosure; không production stress mặc định.

**Rollback / recovery:** Stop run khi threshold; reset fake test data đúng namespace/schema đã tạo.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N08-05 — Capacity recommendation có version và expiry

**Depends on:** N08-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 94

**Deliverables**

- C_sustainable/C_recommended/C_hard report; admin capacity history/approval view

**Acceptance / Definition of done**

- C_recommended mặc định floor0.70*C_sustainable chỉ là policy headroom; C_hard<=measured sustainable.
- Kết quả bind hardware/workload/digests/SLOs; thay shape/protocol/version đáng kể đánh stale.
- Không auto-raise cap từ missing/stale/noisy metrics; đề xuất không phải capacity đã áp dụng.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm capacity:check`

Scenario / evidence:

- Reject invalid/stale measurement and fast-rejection percentile tricks.

**Rollback / recovery:** Revert active recommendation to last valid lower bound; disable new admissions if unsafe.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

