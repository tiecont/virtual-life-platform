# Virtual City — Agent Plan Pack

**Trạng thái:** Bộ đặc tả/kế hoạch, chưa phải source code đã hoàn thành hoặc đã triển khai.  
**Mục đích:** Giao **một file tổng** cho coding agent và để agent tự đọc các file module, kiểm thử, lưu checkpoint và tiếp tục qua nhiều phiên.

## Bắt đầu

1. Copy **toàn bộ nội dung** gói này vào root repository *hoặc* thư mục kế hoạch được chỉ định; nếu repo đang có `AGENTS.md`, **merge hướng dẫn** và không ghi đè nguyên trạng.
2. Giữ cấu trúc thư mục và relative links. Đảm bảo hai kế hoạch cũ trong `reference/` có sẵn; đây là **reference snapshot** và không chứng minh source code đang tồn tại.
3. Với Codex hoặc coding agent có quyền truy cập repository, gửi đúng prompt:

   **`Read MASTER-AGENT-PLAN.md completely, follow its execution protocol and implement the next unblocked task. Continue through the plan, verify and checkpoint every milestone; do not claim success without evidence.`**

4. Nếu muốn giới hạn agent chỉ thực hiện một phase, dùng: `Read MASTER-AGENT-PLAN.md. Execute only Wave W1 and its required dependencies, then report acceptance evidence.`
5. Người sở hữu cung cấp đường dẫn repository thực tế của Deadline/Maid (nếu hai dự án nằm ngoài workspace), secrets và quyền triển khai **chỉ khi thực sự cần**.

> Ghi chú: Một prompt có thể **khởi động và định hướng toàn bộ quy trình**, nhưng không bảo đảm agent luôn chạy liên tục qua giới hạn phiên, quyền truy cập hay rào cản triển khai. Khi dừng, agent phải lưu checkpoint để phiên sau tiếp tục.

## Entry points

- [`MASTER-AGENT-PLAN.md`](MASTER-AGENT-PLAN.md) — **file tổng, single source of truth về điều phối**
- [`AGENTS.md`](AGENTS.md) — hướng dẫn ngắn để coding agent luôn nhận đúng quy trình
- [`plans/`](plans/) — các kế hoạch độc lập có dependency và DoD
- [`reference/`](reference/) — bản gốc hai kế hoạch Deadline Cafe và Maid Cafe Social, giữ nguyên nội dung
- [`docs/agent/`](docs/agent/) — checkpoint và evidence mẫu; điền theo kết quả thực chạy
- [`contracts/`](contracts/) — hợp đồng API/event mẫu để agent hoàn thiện và kiểm thử

## Quy tắc ưu tiên đặc tả

1. Bảo vệ dữ liệu, luật áp dụng, yêu cầu rõ ràng của chủ dự án và bảo mật vận hành.
2. `MASTER-AGENT-PLAN.md` và các quyết định ADR đã được chấp nhận.
3. Các `plans/*.md` và interface/contract được version hóa.
4. Các plan cũ `reference/*.md` đối với **nghiệp vụ chi tiết còn tương thích**.
5. Code đang chạy và migrations đã phát hành: phải audit và migrate an toàn, không xóa để khớp plan.

Khi xung đột, **ghi ADR và compatibility plan** trước khi sửa. Không âm thầm phá vỡ two existing apps.
