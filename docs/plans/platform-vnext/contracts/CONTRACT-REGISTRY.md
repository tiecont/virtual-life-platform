# Contract registry — thiết kế để implement và test

Các contract dưới đây là **đề xuất vNext**, chưa phải endpoints đang chạy. Agent phải đọc `packages/contracts` hiện tại, chọn additive evolution và giữ adapters. Không tạo parallel API trái với existing semantics chỉ vì tài liệu minh họa tên mới.

## 1. Nhóm hợp đồng

| Contract | Owner | Dữ liệu tối thiểu | Invariants / tests | Tasks |
|---|---|---|---|---|
| Command envelope | Runtime/contracts | protocolVersion, requestId, clientSeq, room/visit reference, payload | Actor/role/age lấy từ server context; payload strict-size/type; replay scoped | N05-01/06 |
| Room snapshot/delta | Room owner | ownerEpoch, roomVersion/seq, serverTime, contentVersion, authorized projection | Gap/epoch đổi => snapshot; recipient privacy; bounded payload/buffer | N05-02/03/04 |
| Critical operation result | Domain module | requestId, accepted/rejected, stable code, resource version | Durable effect trước ACK; same key+same payload returns same result | N05-01 |
| Native session | Identity | deviceSessionId, access expiry, rotation/revoke state | Refresh secret in secure native storage; browser policy giữ nguyên | N10-03 |
| Socket ticket | Identity/runtime | opaque one-time value; server stores subject/session/audience/protocol/expiry binding | Atomic use; expired/replayed/revoked denied; token không vào URL/log | N10-03 |
| Platform admission | Admission | account-scoped ticketId, state, policyVersion, joinedAt, offer expiry, slot lease | One account one counted slot; atomic grant; disjoint active/grace/reserved | N09 |
| Room/booking waitlist | Room/events | destination/slot and bounded hold | Không tự chiếm global slot mới; room full khác platform full | N09 |
| Capacity report | Operations | hardwareHash, source/digests, profileHash, outcomes, SLOs, C_sustainable, validity | Measurement provenance; reject stale/unqualified report | N08-05 |
| Runtime policy | Operations | version, target/hard cap, maintenance, allowed world toggles | optimistic concurrency; Git entitlements bound edits; audit | N07-03/N09-04 |
| Metrics view | Operations | source, sampledAt, window, value, freshness/status | No sample !=0; bounded allowlisted queries; no PII labels | N07-04/N08 |
| Load run | Operations/test runner | profileId, environmentId, budget, source/digest, state, startedAt, deadline | No arbitrary URL/shell/image; stage-only by default; cancel idempotent | N08-03 |
| Release set | CI/CD | sourceSHA, artifact digests, schema/protocol bounds, evidenceRefs | Build once/promote same digests; selected artifacts real; no mutable latest | N03/N04 |

## 2. Admission state machine

~~~mermaid
stateDiagram-v2
  [*] --> WAITING
  WAITING --> OFFERED: slot reserved
  OFFERED --> ACTIVE: atomic claim
  OFFERED --> WAITING: first timeout requeues at tail
  OFFERED --> EXPIRED: second timeout or ticket TTL
  WAITING --> EXPIRED: ticket TTL
  WAITING --> CANCELLED: user cancels
  ACTIVE --> GRACE: disconnect
  GRACE --> ACTIVE: reconnect before expiry
  GRACE --> RELEASED: grace expires
  ACTIVE --> RELEASED: leave or revoke
  OFFERED --> CANCELLED: cancel and release reservation
  RELEASED --> [*]
  CANCELLED --> [*]
  EXPIRED --> [*]
~~~

State `OFFERED` tiêu thụ reserved slot; `ACTIVE` và `GRACE` tiêu thụ cùng một lease ở hai trạng thái loại trừ nhau. `WAITING` không giữ gameplay slot. Canonical enums là WAITING, OFFERED, ACTIVE, GRACE, CANCELLED, EXPIRED, RELEASED. Offer token hết hạn luôn vô hiệu hóa ngay và nhả reservation nguyên tử. Lần missed offer đầu tiên ticket tự về cuối hàng với sequence mới; lần thứ hai hoặc quá ticket TTL chuyển EXPIRED và cần người dùng join lại. Không giữ đầu hàng vô hạn. System-caused revoke/restart không tính thành missed offer của user; controller resync/requeue sau reconciliation an toàn. TTLs và policy version được khóa trước concurrency tests.

`occupied = ACTIVE + GRACE + unexpired OFFERED`, luôn `<=C_hard`. Chỉ cấp offer mới khi `occupied<C_target<=C_hard`. Hạ target dưới occupied tạo `DRAINING_LIMIT`, không kick. Hạ hard bound phải pending cho tới khi occupied phù hợp. Upgrade/travel giữ lease platform cũ, chỉ tạo hold room đích.

Transaction grant phải vừa kiểm quota/policy vừa insert/update lease + offer, với unique active account constraint và locking phù hợp. Counter cached không là authority. Job reclaim idempotent theo DB time; reconciliation không được double free khi late claim/reconnect.

## 3. Protocol evolution

- Fields additive mặc định; mọi breaking schema/semantics cần protocol/capability version và migration.
- So sánh N/N-1 cho cả HTTP và Socket.IO. Server trả upgrade-required an toàn khi ngoài window; không silently parse sai.
- Client time chỉ hỗ trợ interpolation; durations/rewards/expiry dựa server/DB time.
- ClientSeq, serverSeq và idempotency requestId có vai trò khác nhau; không dùng một counter thay cả ba.
- Token/session/permission revalidation xảy ra ở mọi mutation, không chỉ handshake.
- Cosmetic updates có thể coalesce/drop theo policy; critical commands không được bỏ im lặng vì backpressure.
- Fanout chỉ gửi authorized projection; block/revoke invalidation ưu tiên correctness.
- Idempotency records của business effects có retention đủ để retry hợp lý, payload hash conflict và transactional uniqueness.

## 4. Contract acceptance tối thiểu

1. Duplicate submit trước/sau disconnect chỉ tạo một effect.
2. Same key/different payload bị reject, không trả thành công nhầm.
3. Client cũ nhận version/error rõ; không bị treo.
4. Gap snapshot/owner epoch đổi resync đúng, old owner events bị bỏ.
5. Native ticket replay/expired/audience khác bị chặn; browser CSRF không yếu đi.
6. Hai instances/transactions cùng grant slot cuối: chỉ một thành công.
7. Giảm target lúc occupancy cao: đúng DRAINING_LIMIT, existing lease vẫn hợp lệ.
8. Grace expiry đua reconnect: kết quả nguyên tử, không duplicate lease/seat.
9. Metrics missing/stale không thành zero; private labels/trace fields không leak.
10. Load job reject unapproved target/image/profile và stop khi deadline/resource guard.

## 5. API naming và sample data

Endpoint names cuối cùng là output của task, được commit vào packages/contracts và OpenAPI/event spec sau code audit. Không cung cấp token mẫu có thể dùng thật. Examples/fixtures chỉ dùng generated fake accounts trong disposable test environment, có cleanup và provenance.



## 6. Platform release applicability

Native session contract dùng chung nhưng Android secure-storage implementation gate N10-03, iOS Keychain gate N14-02. Android/server matrix là N12-03, iOS/server matrix là N14-04. Release evidence giữ platform/build/signing track/protocol/content revisions và support window; không dựa duy nhất aggregate mobile flag. Candidate đầu chưa có previous published build thì ghi rõ NOT_APPLICABLE và lưu baseline.
