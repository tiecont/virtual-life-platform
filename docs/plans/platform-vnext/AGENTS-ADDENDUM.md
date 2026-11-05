# Phần bổ sung cho AGENTS.md hiện hữu

Merge phần dưới vào root AGENTS.md sau khi gói nằm tại `docs/plans/platform-vnext/`; giữ nguyên các hướng dẫn đang có còn phù hợp.

## Virtual Life Platform vNext

Với công việc tiếp theo về CI/deployments/cleanup/UI-UX/server-authority/mobile/admin, đọc `docs/plans/platform-vnext/MASTER-AGENT-PLAN.md`, manifest, state và module plan liên quan. Task Nxx tiếp nối M00–M24; không reset ledger cũ.

Yêu cầu mới cho phép lên kế hoạch Kubernetes/ArgoCD và native mobile. Handoff cũ “offline work exhausted” không có nghĩa không được làm scope mới. Không chuyển quyền thiết kế/thực thi code thành quyền public deployment, store submission hay thay đổi dữ liệu production.

Giữ một room-owner cho đến khi gate multi-owner đã đạt. Chạy worker với entrypoint riêng không dựng RoomAuthority. Chỉ pin image digest đã kiểm thử; native client phải có auth và protocol compatibility riêng.

Execution profile là CachyOS + một Android thật: N10/N11/N12-03 cho Android; iOS N14 conditional. Không coi thiếu Mac/iPhone là blocker của Android/web. Khi phân phối mobile, cập nhật platform context và support inventory ngay; backend release gate chạy theo platform đã supported/distributed. Android evidence không thay iOS evidence.

Cập nhật `docs/plans/platform-vnext/state/` sau mỗi task. Không ghi raw logs/screenshots dung lượng lớn vào source tree. Evidence phải có SHA/diff hash, môi trường, lệnh và kết quả thật. Không đánh VERIFIED vì file tồn tại.
