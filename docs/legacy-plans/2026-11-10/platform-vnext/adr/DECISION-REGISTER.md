# Decision register — vNext

N00-04 records the consolidated implementation baseline and lane ownership in repository `docs/adr/0101-vnext-baseline-and-ownership.md` (2026-11-05). It accepts architecture direction for preparation under owner discretion, not implementation completion or public/store approval. Runtime contracts and each task's acceptance remain separate. Existing ADR0001–0100 are preserved.

Status `PROPOSED_BASELINE` nghĩa là lựa chọn kỹ thuật của bộ kế hoạch, chưa phải thay đổi code đã triển khai hoặc chứng nhận owner duyệt production. Dùng ID NEXT-ADR để tránh đụng ADR0001–0100 hiện có; khi tích hợp, coordinator cấp repository ADR number thật.

| ID | Quyết định | Lý do / tradeoff | Trigger xem lại | Task |
|---|---|---|---|---|
| NEXT-ADR-001 | Giữ modular monolith TypeScript, một DB | Tận dụng code, transactions và nghiệp vụ rõ; cần enforce boundaries | Proven independent scaling/ownership need | N02 |
| NEXT-ADR-002 | Ba runtime images web/API/admin | Deploy và dependency footprint riêng; shared packages không thành service | New independent lifecycle | N03 |
| NEXT-ADR-003 | Same-repo Kustomize + Argo native sync | Một source desired state, không custom cross-repo reconciler | Nhiều cluster/tenant hoặc chart requirements | N04 |
| NEXT-ADR-004 | API singleton Recreate + drain | Phù hợp advisory lock hiện tại; có gián đoạn ngắn | Multi-owner gates đạt và có need | N05/N13 |
| NEXT-ADR-005 | Expand/contract + tested N-1 compatibility | Migration và rollback cần correctness, current exact-count guard phải chuyển có test | Unsupported schema/published mobile protocol | N02/N12 |
| NEXT-ADR-006 | Socket.IO/WSS + HTTPS | Phù hợp gameplay room hiện có; giữ adapter và reliability logic | Action gameplay có measured transport need | N05 |
| NEXT-ADR-007 | Worker entrypoint dùng API image | Tách durable jobs khỏi latency; không tăng artifact stack vô cớ | Dependency/security/runtime khác hẳn | N05 |
| NEXT-ADR-008 | Game-client React DOM/Pixi + Capacitor | Dùng chung web/game UX; cần physical-device proof | Spike fail hoặc sản phẩm chuyển hướng | N10 |
| NEXT-ADR-009 | Một operator principal, auth tách player | Đúng nhu cầu một account; vẫn cần capabilities/audit/MFA | Người sở hữu yêu cầu thêm operators | N07 |
| NEXT-ADR-010 | PostgreSQL global admission queue | Durable FIFO/atomic slot, một store semantics | Measured queue throughput cần Redis | N09 |
| NEXT-ADR-011 | Fresh metrics/qualified capacity, headroom70% | Không nhầm socket count/fast rejection với playable load | Hardware/workload/SLO thay đổi | N08 |
| NEXT-ADR-012 | Archive raw evidence, keep hash index | Tree nhỏ mà vẫn traceable; consumers và restore cần migration | Audit/retention/storage requirements | N01 |
| NEXT-ADR-013 | GitOps deployment vs DB runtime policy | Mỗi nhóm config một source; no imperative Argo drift from admin | Cross-region policy distribution need | N02/N07 |
| NEXT-ADR-014 | One polished social/focus/service slice first | UI/UX kiểm bằng sử dụng thật; không mở rộng scope làm mỏng trải nghiệm | Usability/consented product evidence | N06 |
| NEXT-ADR-015 | Android trước trên CachyOS, iOS conditional riêng | Một Android đủ đo baseline, macOS/iPhone access chưa có; giữ shared client và mục tiêu App Store | Có iOS resources hoặc device evidence đổi lựa chọn | N10/N11/N12/N14 |
| NEXT-ADR-016 | Owner requirement 2026-11-06: landscape gameplay, animal theme và modular character creator; kỹ thuật rig/catalog/rendering còn phải triển khai | Ưu tiên scene/nhân vật đẹp, dùng chung identity và renderer hiện hữu; compatibility và performance có gates riêng | N06-06 chốt style/rig/budgets, physical evidence hoặc owner đổi hướng | N06-06..09, N10-04, N14, N15-05 |

## Quy tắc thay đổi quyết định

N02-04 implements the bounded local portion of NEXT-ADR-005 in repository `docs/adr/0105-image-bound-schema-prefix-compatibility.md`: exact default, image-bound checksum prefix and an actual synthetic expand/image rollback proof. Image/scenario evidence in `docs/architecture/N02-04-SCHEMA-COMPATIBILITY.json` does not approve a future production migration, arbitrary old binary, deployment or N12 release gate.

Một ADR mới phải nêu current fact, constraint, options, choice, business invariant, migration/rollback, test evidence và consequence. Không rewrite lịch sử hoặc ghi “approved” khi chỉ là recommendation.

Các metric targets trong plan là giả thuyết cần kiểm. Không đổi threshold sau khi run chỉ để chuyển fail thành pass; nếu workload/SLO cần đổi, ghi revision và chạy lại.
