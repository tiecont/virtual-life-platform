# Đề xuất ADR cần phê duyệt khi implementation

| Dự kiến | Quyết định mặc định | Khi nào cần xem lại |
|---|---|---|
| LL-ADR-01 | One `lantern-lodge` world, một room = một bàn MVP; giữ RoomAuthority hiện hữu | Khi có số đo chứng minh nhiều bàn/room không tạo rối capacity/UX |
| LL-ADR-02 | `boardgame-core` pure reducers, GameSession server authoritative | Nếu business event cần distributed owner thì bắt buộc thiết kế fencing |
| LL-ADR-03 | Sealed private state, projection riêng account; spectator OFF | Khi đủ capacity + redaction proof và chính sách spectator |
| LL-ADR-04 | PostgreSQL journal, idempotency và account active claim | Sau restore/reconnect/load tests mới cân nhắc tối ưu persistence |
| LL-ADR-05 | Sắc Đèn trước, Mặt Nạ sau, Hải Đồ cuối | Chỉ đổi thứ tự nếu có ADR và evidence kiểm thử nhánh liên quan |
| LL-ADR-06 | Không công khai trước independent safety/rights/operator/release signoff | Chỉ chủ dự án và người phụ trách có quyền phê duyệt thực |

**Đây là đề xuất; không phải ADR đã được repo chấp nhận hoặc đã implement.** Mỗi quyết định quan trọng khi bắt đầu code phải ghi ADR mới trong repo, liên kết task/evidence và test hồi quy.
