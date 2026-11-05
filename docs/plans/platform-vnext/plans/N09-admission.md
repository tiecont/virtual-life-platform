# N09 — Admission và hàng chờ toàn platform

**Owner lane:** Runtime + Experience  
**Activation:** active · **Implementation:** TODO  
**Goal:** Bảo vệ server và cho người chơi chờ công bằng, tách global slot với room/booking capacity.

## Phạm vi file dự kiến

- `apps/platform-api/src/modules/admission/*`
- `apps/platform-api/src/rooms/*`
- `apps/platform-api/src/travel/*`
- `apps/admin-web/*`
- `packages/game-client/*`
- `packages/contracts/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Tasks

### N09-01 — Contract queue/lease và capacity state machine

**Depends on:** N05-01, N08-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 100

**Deliverables**

- Queue/offer/slot schema, state machine, policy versions

**Acceptance / Definition of done**

- Disjoint active+reconnect_grace+reserved<=C_hard; new grant only occupancy<C_target<=C_hard.
- One account one slot/ticket; travel reuses global slot, target room hold riêng.
- Cap target hạ dưới occupancy => DRAINING_LIMIT no kick; hard decrease pending until occupancy fits.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:admission-contract`

Scenario / evidence:

- Model duplicate tabs/reconnect/offer expiry/returning user/room full.

**Rollback / recovery:** Contract additive adapter, queue feature stays disabled until full implementation.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N09-02 — PostgreSQL queue và atomic grant

**Depends on:** N09-01, N05-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 101

**Deliverables**

- Queue tickets, allocation transaction, TTL janitor, idempotent claim/release

**Acceptance / Definition of done**

- FIFO+aging with deterministic tie-break; offer expires và slot trả đúng once.
- Concurrent claim/session duplicate/worker retry không oversubscribe.
- DB/owner failure fail closed; reconnect grace có bound, hết hạn phải requeue.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm test:integration`
- `pnpm test:security`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:admission`

Scenario / evidence:

- >=2xcap concurrent claims in disposable environment; kill between reserve/claim/release.

**Rollback / recovery:** Stop new grants, let held slots expire safely; keep existing sessions, no destructive reset.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N09-03 — Queue UX web/mobile và reconnect states

**Depends on:** N09-02, N06-03  
**Trạng thái ban đầu:** TODO  
**Priority:** 102

**Deliverables**

- Waiting UI rank/ETA range/leave/ready countdown, accessible updates

**Acceptance / Definition of done**

- Không fake exact ETA; show own ticket, no other-user identity.
- Lightweight polling/SSE with jitter/backoff budget, waiting users không giữ game socket vô hạn.
- Background/resume/reconnect/hard expired states có action rõ.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:queue-ux`

Scenario / evidence:

- Multiple tabs, network loss, ready offer missed, cancel and return.

**Rollback / recovery:** Fallback friendly full/try-later screen with server gates retained.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N09-04 — Admin cap policy và queue controls

**Depends on:** N09-02, N07-03, N08-05  
**Trạng thái ban đầu:** TODO  
**Priority:** 103

**Deliverables**

- Versioned caps, queue pause/maintenance, DRAINING_LIMIT view và audit

**Acceptance / Definition of done**

- Default target=recommended; target<=hard; hard reduction pending, no hidden kick.
- Raising bound needs fresh capacity evidence; operator step-up/reason recorded.
- Room/reservation waitlists cannot be mistaken for platform queue.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:admission`
- `pnpm test:admin`

Scenario / evidence:

- Target lowered under occupancy, grace reconnect, emergency pause, stale evidence deny.

**Rollback / recovery:** Audited rollback to previous safer policy, preserve tickets/leases.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N09-05 — Fault/concurrency/load acceptance

**Depends on:** N09-03, N09-04, N05-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 104

**Deliverables**

- Admission invariant/fairness/failure report and queue recovery runbook

**Acceptance / Definition of done**

- Race/expired offer/restart/duplicate claim never exceeds hard bound.
- No queue starvation under stated policy; max ticket count/TTL protects DB/API.
- Fresh mixed profile includes waiting users + admitted players; compare to N08 capacity before release.

**Verification**

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:admission`
- `pnpm test:queue-ux`
- `pnpm load:staging --profile=queue-storm`

Scenario / evidence:

- Realistic shared NAT, jittered reconnect and DB outage/recovery.

**Rollback / recovery:** Disable admission controller grants; maintenance mode, reconcile leases against owner before reopen.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

