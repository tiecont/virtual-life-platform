# Revision 2.1 — CachyOS và Android trước

## Lý do

Chủ dự án dùng CachyOS Linux và có một Android thật. Gói 2.0 buộc N10-04 và N12-03 có Android+iPhone, nên chặn Android quá sớm. Revision này sửa dependency/acceptance thực sự, giữ mục tiêu iOS trong nhánh riêng.

## Thay đổi

- N10 physical spike/secure storage và N11 artifacts/UX/Play beta scope Android.
- N12-03 gate Android; N14 mới gồm 5 task cho iOS resources, build/adapters, iPhone physical spike, compatibility và TestFlight.
- N12-01/04/05 có conditional gates theo `android_clients_distributed` và `ios_clients_distributed`. Aggregate field được validator kiểm nhất quán. iOS chưa phân phối không chặn Android/backend.
- Giữ first-release N−1 applicability đúng; signed local install kiểm trước store distribution, không tạo dependency cycle.
- Bổ sung [execution profile](architecture/05-CACHYOS-ANDROID-FIRST.md), setup checklist, một-device test matrix, multi-player/load strategy và Play testing prerequisites.
- Manifest/board/module plans/quality gates/ADR/state/handoff cập nhật cùng scope. N13/N14 conditional; tất cả 69 implementation tasks TODO.

## Áp dụng

Nếu chưa tích hợp 2.0, dùng nội dung gói này ở `docs/plans/platform-vnext/` theo README. Nếu đã thực thi task từ 2.0, merge manifest/docs/gate changes và giữ nguyên task status/evidence/branch đang có; không ghi đè state hiện hành bằng all-TODO state của gói mẫu. Revalidate affected task acceptance và current supported-mobile inventory.

Android beta scope không chứng nhận iOS hay mọi Android model. Local APK-ready, Play internal/closed beta, production access và public published là các trạng thái khác nhau.

## Validation

Xem [PACK-VALIDATION.json](audit/PACK-VALIDATION.json). Các checks chỉ xác minh plan/scheduler, không chạy app trên CachyOS, điện thoại, server hay store.
