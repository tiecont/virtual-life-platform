# N13 — Tăng quy mô theo evidence

**Owner lane:** Runtime/Operations  
**Activation:** conditional · **Implementation:** TODO  
**Goal:** Chỉ thêm multi-owner khi sustainable capacity/latency thực tế không đáp ứng mục tiêu đã xác định sau tối ưu.

## Phạm vi file dự kiến

- `apps/platform-api/src/rooms/*`
- `apps/room-runtime/*`
- `packages/contracts/*`
- `infra/k8s/*`
- `tests/load/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N13-01 — Xác nhận trigger và ADR split runtime

**Depends on:** N08-05, N12-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 200

**Deliverables**

- Bottleneck evidence, required workload target, cost/failure model

**Acceptance / Definition of done**

- Module chỉ activate bằng measured trigger và owner của decision; chưa đo thì không làm vì dự đoán.
- So sánh optimize/scale-up/per-room mailboxes/worker với multi-owner.
- N13 chưa active không chặn web/mobile beta.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm profile:runtime`

Scenario / evidence:

- Capacity profile hardware/source pinned; business need đã ghi.

**Rollback / recovery:** Giữ singleton; disable conditional module nếu trigger không tồn tại.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N13-02 — Room directory, routing và fencing

**Depends on:** N13-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 201

**Deliverables**

- Per-room authority, monotonic epoch lease, gateway routing, handoff protocol

**Acceptance / Definition of done**

- Redis Pub/Sub một mình không chứng minh exclusivity; stale owner cannot write/broadcast valid authority.
- Cross-room/per-account consistency giữ qua partition/retry; durable DB remains source.
- Nếu thêm Redis, nêu outage/fallback/operational budget và no critical-state-only storage.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:distributed-authority`

Scenario / evidence:

- Two owners race, expired lease, partition, failover and stale connections.

**Rollback / recovery:** Route all rooms back to one verified owner via safe drain; preserve protocol compatibility.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N13-03 — Shard/load/rolling failure acceptance

**Depends on:** N13-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 202

**Deliverables**

- Multi-owner capacity+chaos+rollout report and updated admission policy

**Acceptance / Definition of done**

- No duplicate membership/reward/seat across owners; N/N-1 compatibility.
- Horizontal scale policy based on admitted workload not raw transports only.
- Measured improvement outweighs operational cost; no linear-scaling promise.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:distributed-authority`
- `pnpm load:staging --profile=multi-owner`

Scenario / evidence:

- Rolling upgrade/missing shard/crash/Redis-DB outages, bounded chaos stage.

**Rollback / recovery:** Drain/route rollback by verified plan, never overlap uncontrolled owners.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

