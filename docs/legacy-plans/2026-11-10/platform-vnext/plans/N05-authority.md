# N05 — Authoritative runtime và protocol

**Owner lane:** Runtime  
**Activation:** active · **Implementation:** TODO  
**Goal:** Nâng chất lượng authority sẵn có, giảm bottleneck có số đo và chuẩn bị deployment/native compatibility.

## Phạm vi file dự kiến

- `apps/platform-api/src/rooms/*`
- `apps/platform-api/src/identity/*`
- `apps/platform-api/src/travel/*`
- `apps/platform-api/src/main.ts`
- `apps/platform-api/src/entrypoints/*`
- `packages/contracts/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N05-01 — Khóa invariants và contract envelope

**Depends on:** N02-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 50

**Deliverables**

- Authority invariant table, protocol schemas, concurrency regression

**Acceptance / Definition of done**

- Seat/order/reward/travel không double apply; session revoke/blocks lập tức có hiệu lực.
- requestId gắn actor/action/payload; duplicate payload khác phải conflict.
- ACK durable business effect chỉ sau commit; room movement có epoch/seq rõ.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test`
- `pnpm test:integration`
- `pnpm test:security`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:protocol`

Scenario / evidence:

- Replay/out-of-order/double-click/stale membership/malicious move/seat race.

**Rollback / recovery:** Giữ current protocol adapter và rollback changes từng slice.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N05-02 — Instrument queue wait, fanout và event-loop

**Depends on:** N05-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 51

**Deliverables**

- Latency histograms by bounded command type/outcome; profiling report

**Acceptance / Definition of done**

- Tách wait/compute/DB/fanout/network và successful/rejected outcomes.
- Không raw account/room IDs vào metrics labels.
- Đo actual room.delta payload hiện còn snapshot, không giả delta tiết kiệm.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm bench:rooms`
- `pnpm test`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm profile:runtime`

Scenario / evidence:

- Chạy local isolated profile, chưa gọi đó là capacity production.

**Rollback / recovery:** Tắt instrumentation không thiết yếu nếu overhead vượt budget, giữ basic metrics.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N05-03 — Tối ưu theo profiling và giữ consistency

**Depends on:** N05-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 52

**Deliverables**

- Comparison report; indexed projections/batching/true deltas hoặc mailbox nếu justified

**Acceptance / Definition of done**

- Chỉ thay global serialization khi bottleneck đã được đo; nếu chưa cần thì ghi quyết định giữ cùng evidence.
- Per-room mailbox phải giữ per-account travel coordinator và lock ordering.
- Block/revoke invalidates cached recipients; performance không đổi privacy.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test:integration`
- `pnpm test:security`
- `pnpm bench:rooms`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:protocol`
- `pnpm profile:runtime`

Scenario / evidence:

- Compare workload/hardware/source pinned, include failure/correctness results.

**Rollback / recovery:** Feature flag hoặc revert optimization về verified global-owner path.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N05-04 — Drain, owner loss và reconnect recovery

**Depends on:** N05-01, N02-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 53

**Deliverables**

- Bounded drain lifecycle, readiness/live split, reconnect contract

**Acceptance / Definition of done**

- Stop new admissions, preserve/settle critical commits, release authority then stop.
- PG lock connection loss fences commands; old owner không tiếp tục broadcast authority.
- Crash/restart nói rõ ephemeral state mất; không có phantom successful order/reward/visit.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test:integration`
- `pnpm infra:check`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:runtime-faults`

Scenario / evidence:

- SIGTERM, hard kill, DB outage, lock loss, old socket and changed epoch resync.

**Rollback / recovery:** Revert runtime lifecycle change; singleton/reconnect remains explicit.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N05-05 — Tách durable worker bootstrap

**Depends on:** N02-02, N05-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 54

**Deliverables**

- Worker entrypoint, transactional outbox jobs, retry/dead-letter controls

**Acceptance / Definition of done**

- Không createApp/RoomAuthority/socket ownership trong worker.
- Room-bound maintenance giữ owner; durable notifications/retention/schedules có idempotency.
- At-least-once jobs retry an toàn và không duplicate rewards.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test:integration`
- `pnpm build`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm worker:check`

Scenario / evidence:

- Kill worker sau effect/trước ack; resume, bounded attempts, poison-message handling.

**Rollback / recovery:** Stop worker, quay lại verified dispatcher path nếu compatible; không chạy song song hai unsafe consumers.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N05-06 — Protocol/content compatibility cho client N và N-1

**Depends on:** N05-01, N02-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 55

**Deliverables**

- Version negotiation, feature capabilities, stable errors và resync behavior

**Acceptance / Definition of done**

- Old mobile/web client tương thích hoặc nhận upgrade-required rõ, không xử lý schema sai.
- Không phá legacy/current contracts khi thêm fields; content hash/schema version độc lập.
- Socket.IO retry không được hiểu là exactly-once.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm typecheck`
- `pnpm test:integration`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:protocol`

Scenario / evidence:

- Run N/N-1 client fixtures với new server, gap/epoch mismatch và token revoke.

**Rollback / recovery:** Giữ adapter/N-1 window; rollback protocol chỉ khi client support matrix cho phép.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

