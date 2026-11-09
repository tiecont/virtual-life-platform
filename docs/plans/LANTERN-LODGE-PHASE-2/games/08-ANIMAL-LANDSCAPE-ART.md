# Animal characters và gameplay ngang — Lodge integration

> Current scheduling: [web first, native later](10-WEB-FIRST-EXECUTION.md). Preserve this visual direction and quality budgets; Android physical/device checks apply only to deferred N19-04/native lanes, not web feature acceptance.

**Owner requirement 2026-11-06:** Virtual Life dùng chủ đề động vật, gameplay ngang và tạo nhân vật theo từng bộ phận; ưu tiên đồ họa đẹp. Đây là cập nhật plan khi Phase 2 còn dormant, chưa phải implementation hoặc activation.

Đặc tả sản phẩm chính ở `docs/plans/platform-vnext/architecture/06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md`. Phase 1 coordinator sở hữu N06-06..09; Phase 2 đọc handoff/evidence thực và tái sử dụng kết quả. Không tạo catalog/avatar editor, storage hoặc orientation policy thứ hai trong Lodge.

## Áp dụng tại hội quán

- Bàn chơi là trọng tâm của màn hình ngang, avatar động vật quanh bàn có silhouette đọc được, ánh sáng đèn ấm, chất liệu gỗ/vải và props gốc. Public board, hand của chính mình, thời gian và Confirm/Leave không bị hiệu ứng trang trí che khuất.
- Creator/wardrobe dùng cùng appearance/catalog/rig với Deadline và Maid. Loài, tai, đuôi, mắt, mõm, lông/hoa văn, trang phục và phụ kiện giữ lựa chọn khi travel, reconnect và đổi mode. Chỉ server xác nhận cosmetic và quyền equip.
- Sắc Đèn: bài có glyph và chữ ngoài màu, đường chọn/confirm rõ. Mặt Nạ: biểu cảm/emote dùng animation an toàn, không reveal bí mật hoặc cho lợi thế theo loài. Hải Đồ: map 7×7 đọc được trong landscape; chọn/xoay/xác nhận bằng touch/keyboard, không buộc drag.
- Portrait fallback có lời nhắc xoay không chặn controls an toàn. Cutout, hai chiều ngang, bàn phím, Back, giảm chuyển động và tăng chữ phải được kiểm riêng. Không dùng sơ đồ portrait cũ làm gameplay chính.
- Animation chỉ phản ánh outcome đã commit; không trì hoãn report/block/leave hoặc tiết lộ role/hand/target qua pose, layer, alt text, âm thanh hay asset ID. Không thay luật, deadline hoặc RoomAuthority để phục vụ hiệu ứng.
- Art/audio có provenance và review thật; animal theme không cho phép dùng artwork/nhân vật của Party Animals. Style sheet là hướng sản xuất, không chứng nhận asset rights hoặc owner art approval.

## Task/evidence mapping

| Task | Bổ sung bắt buộc |
|---|---|
| N15-01 | Đối chiếu art brief mới, quyền asset và shared-avatar ownership trong scope ADR |
| N15-05 | Thêm upstream N06-09 VERIFIED trước khi nghiệm thu shared match UI; dùng cùng landscape/animal shell |
| N16-03 / N17-03 / N18-03 | Dùng shell/appearance chung, đủ DOM controls và readability của từng trò |
| N19-04 | Android thật: ba mode landscape, creator/equip→travel giữ appearance, rotation/Back/resume, frame-time/memory với cùng asset revision |
| N19-05 | Ghi riêng technical visual QA, owner art review còn thiếu và playtest findings; không gọi synthetic screenshot là người chơi thấy đẹp/hay |

Screenshot/video phải từ build tương tác thật, có SHA/asset revision/device/hash. Giữ đủ tám trạng thái của [UX specification](05-GAME-UX-WIREFRAMES.md), thêm portrait fallback/rotation và occlusion avatar tại bàn. Không dùng evidence preview cũ hoặc Android thay iOS. Scripts vẫn planned cho đến khi có code và actual run; 25 tasks Phase 2 vẫn TODO và phase gate giữ nguyên.
