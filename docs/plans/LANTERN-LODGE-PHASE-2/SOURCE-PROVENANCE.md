# Nguồn, phạm vi kiểm tra, giới hạn

- Đầu vào chính: `VIRTUAL-LIFE-PLATFORM-AGENT-PLAN-v2.2-LANTERN-LODGE-3-GAMES.zip` mà người dùng cung cấp. Chỉ trích đúng 5 module N15–N19 /25 task và 7 file luật/QA/UX + kiến trúc.
- Repo tại thời điểm thiết kế gói v2.2: `tiecont/virtual-life-platform` main `cef7dc17172f7c6cda930c99648a5e3ad609cc55` (2026-11-05). Không suy là HEAD khi bạn bắt đầu phase mới.
- Không chỉnh repo, không chạy install/build/tests của ứng dụng trong lúc tạo tài liệu này. Chỉ validate **cấu trúc plan, dependency scheduler và tình huống giả lập**. Các test game/server load vẫn là công việc tương lai.
- Link tới repo cần truy cập theo quyền repository hiện hữu. Snapshot có thể không phản ánh thay đổi do agent Phase 1 đang thực hiện.
- Hình ảnh/cơ chế thẻ chơi trong Party Animals là tham chiếu thể loại; phase game cần tự thiết kế và kiểm quyền nội dung, không copy assets, tên game hoặc UI nhận diện.
- Gói không chứa secrets, real account tokens, game assets bên ngoài, runtime certificates hay host credentials.
