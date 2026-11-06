# 06 — Gameplay ngang, animal characters và chất lượng hình ảnh

**Owner requirement:** 2026-11-06, chủ dự án yêu cầu gameplay màn hình ngang, đẹp mắt, nhân vật tạo theo từng bộ phận và chủ đề animals cho toàn Virtual Life. **Trạng thái:** yêu cầu sản phẩm đã được đưa vào plan; implementation, artwork, animation và nghiệm thu mới chưa hoàn thành. Đây là bổ sung cho baseline, không viết lại bằng chứng N06-01/N06-02 đã VERIFIED.

## 1. Trải nghiệm đích

Virtual Life là một thế giới động vật có nhân vật riêng của người chơi: tạo nhân vật → vào không gian sống → gặp nhau, focus, phục vụ và chơi tại Lantern Lodge. Gameplay dùng bố cục ngang, cảnh chiếm phần chính; HUD gọn, hành động rõ và nhân vật dễ nhận ra. Không biến sản phẩm thành dashboard có một canvas nhỏ. Admin, đăng nhập và privacy/account forms vẫn có bố cục phù hợp với nhiệm vụ của chúng.

Hướng hình ảnh **đề xuất để phát triển tại N06-06**: cozy 2D/2.5D bằng Pixi hiện có, hình khối mềm, silhouette rõ, màu hài hòa, vật liệu gỗ/vải/cây và ánh sáng ấm. Chiều sâu từ layering, bóng tiếp xúc, phối cảnh và chuyển động vừa phải. Chưa mặc định đổi engine hoặc chuyển sang 3D. Chưa gọi concept hay art style cụ thể là được owner duyệt cuối cùng.

Deadline, Maid và Lodge dùng chung ngôn ngữ tạo hình nhân vật/UI nhưng có bản sắc cảnh riêng: nơi focus yên tĩnh, quán phục vụ sinh động, hội quán ánh đèn có bàn chơi rõ. Hoàn thiện một phòng đại diện trước, sau đó đưa cùng mức chất lượng sang hai vòng chơi hiện có; không thêm world để thay công việc polish.

## 2. Landscape là bố cục gameplay chính

- Web desktop và mobile landscape: scene ở trung tâm, HUD sát cạnh nhưng ngoài safe area, dock hành động ngắn; panel avatar/inventory/rules mở theo ngữ cảnh và đóng được. Không có sidebar dài buộc cuộn mới thấy scene hoặc lượt chơi.
- Native: N06-08 triển khai orientation policy cho gameplay và khôi phục khi thoát; kiểm hai chiều ngang, Back, background/resume và resize. Tôn trọng khả năng orientation/window của nền tảng; khi OS không áp lock thì layout vẫn hoạt động. Không suy diễn web có quyền khóa xoay màn hình.
- Portrait và cửa sổ hẹp có lời nhắc xoay không chặn truy cập, cùng bố cục compact dùng được cho keyboard/screen reader và các tác vụ an toàn. Report/block/leave/recovery luôn truy cập được; xoay thiết bị không tự leave, reset avatar hay gửi intent lần nữa.
- Bàn phím ảo, display cutout, gesture inset và tăng cỡ chữ không che nút Save/Cancel/Confirm/Leave. Touch target mục tiêu ít nhất 44 CSS px; có DOM controls tương đương canvas, không drag-only hoặc color-only.
- Ma trận thiết kế dự kiến: 740×360 và 844×390 landscape, 1280×720, 1920×1080; 360×740 portrait fallback và cửa sổ resize. Đây là CSS viewport mẫu, không phải model thiết bị đã hỗ trợ. Ghi thêm viewport/insets thực của Android hiện có.

## 3. Tạo animal avatar theo bộ phận

Phạm vi starter đề xuất: mèo, chó, thỏ, một body rig chung với thông số tương thích loài; species là lựa chọn ngoại hình. N06-06 chốt catalog nhỏ có đủ biến thể nhìn thấy được trước khi sản xuất asset. Không dùng sprite đổi màu đơn thuần để gọi là character creator.

| Nhóm lựa chọn | Chức năng và ràng buộc |
|---|---|
| Loài + thân/đầu | Silhouette loài và biến thể hình dáng trong rig hỗ trợ; không kéo giãn mesh tùy ý hoặc đổi collision/seat/capacity |
| Lông/da + hoa văn | Palette và markings có provenance, không chỉ tint toàn bộ trang phục |
| Mắt/lông mày | Shape, màu và biểu cảm đồng bộ idle/walk/sit/serve |
| Mõm/mũi/miệng | Bộ phận riêng với anchor và giới hạn loài |
| Tai | Hình dáng/vị trí tương thích đầu, không xuyên mũ hoặc biến mất khi quay |
| Đuôi | Tùy chọn loài và chiều lớp trước/sau thân/ghế theo pose |
| Tóc/chỏm lông | Tùy chọn theo rig, có quy tắc với tai và headwear |
| Trang phục + phụ kiện | Áo/quần hoặc outfit, giày, mũ/kính/phụ kiện trong starter scope; giữ entitlement/equip policy hiện hữu |

Creator có preview sống, nhóm bộ phận dễ chọn, xoay/xem các hướng đã hỗ trợ, preset nhanh, đổi từng phần, reset và Save/Cancel. Starter miễn phí đủ tạo nhân vật hoàn chỉnh; chưa thêm shop, trả tiền ngẫu nhiên hay trading. Lựa chọn loài không xác nhận tuổi/giới hoặc cấp quyền gameplay. Không lấy ngoại hình suy ra phe/role bí mật trong mini-games.

## 4. Tích hợp dữ liệu và renderer, giữ compatibility

Điểm xuất phát source: `packages/contracts/src/avatar.ts` hiện có appearance schema v1 (`starter-v1`, palette, outfit), `packages/pixi-scene/src/avatar-art.ts` dùng atlas 32×48 và animation idle/walk/sit/serve; wardrobe theo ADR0042 đọc inventory/equip từ server. Đây là baseline cần mở rộng, chưa là modular animal rig. Audit lại source tại task implementation.

- N06-07 mở rộng contract/catalog versioned và server validation trên identity/profile/wardrobe hiện hữu; không tạo một identity store hoặc RoomAuthority thứ hai. IDs bộ phận phải có trong allowlist và hợp rig/loài/entitlement; từ chối unknown IDs, tùy ý asset URL, combination sai và thao tác equip không có quyền.
- Preview draft cục bộ không phải ngoại hình đã lưu. Chỉ công bố state từ server; chống double-save/retry, response đến trễ sau đổi account, stale catalog và revoke entitlement. Private inventory không nằm trong public room payload hoặc metrics.
- Đánh giá nhu cầu migration sau audit schema hiện hành; nếu cần, thêm migration vào số trống kế tiếp theo ledger. Không sửa SQL cũ. V1 profile/selected outfit vẫn đọc được; chuyển đổi phải có mapping và recovery rõ, không ghi đè lựa chọn cũ bằng fallback renderer.
- Public appearance chỉ gồm cosmetic IDs/version cần hiển thị. N/N−1 content/protocol có test thực: client cũ nhận projection tương thích hoặc thông báo unsupported theo policy; asset thiếu có hình/text fallback an toàn. Không giả định schema union type chứng minh wire compatibility.
- Layer/anchor/occlusion nhất quán khi đổi hướng, ngồi ghế và phục vụ; dùng cùng composer cho editor, world, thumbnail và Lodge. Cosmetic không điều chỉnh hitbox, server movement, quyền nghề hoặc phần thưởng.
- Version assets, atlas packing, cache/load/unload và giới hạn tổ hợp. Tránh xuất atlas cho toàn bộ tích Descartes các lựa chọn; benchmark memory/frame-time trên tổ hợp thực. Giữ DOM/text fallback khi WebGL/assets lỗi.

## 5. Art pipeline và cổng chất lượng

N06-06 cần style sheet có palette, lighting, scale nhân vật–đồ vật, HUD typography, props, biểu cảm và một cảnh đại diện; ghi nguồn/license/tác giả/công cụ và trạng thái review của từng asset. Concept, prototype và final có nhãn riêng. Không lấy artwork/nhân vật thương hiệu của game khác; không giả rights hoặc chữ ký duyệt. Không bắt buộc mua/generate asset trong task cập nhật plan này.

Trước implementation chốt sheet budgets cho texture resolution/memory, bundle/download size, loading, frame-time/FPS và animation theo profile thiết bị. `docs/mobile/android-spike.json` giữ nguyên thresholds đã khóa; mọi bổ sung có revision, lý do và chạy đo riêng, không đổi ngưỡng sau failure để đạt PASS.

**N06-09 chỉ đạt technical visual acceptance khi có:**

1. Ảnh/video từ build tương tác thật: creator từng nhóm bộ phận, cùng avatar trong Deadline/Maid, đủ idle/walk/sit/serve và hướng đã hỗ trợ; không seam, sai layer, clipping nghiêm trọng hoặc asset placeholder không được ghi rõ.
2. Landscape web và Android cài thật qua states loading/empty/full/queue/offline/reconnect/denied, keyboard/safe area, portrait fallback, resize/rotation và reduced motion. Hash artifact kèm source SHA, asset/catalog revision và model/OS/WebView; không chỉ ảnh concept.
3. Thực thi hai vòng chơi hiện có, Save/Cancel avatar và travel/reconnect giữ ngoại hình, identity, safety, authoritative outcome. Lỗi load asset không khóa đường leave/report.
4. Báo cáo asset provenance, memory/frame-time/loading đo thật theo budget đã khóa; lưu cả failed run và giới hạn single-device. CI screenshot diff chỉ hỗ trợ kiểm regression.
5. Rubric review visual có từng mục composition, silhouette, animation, lighting/palette, UI readability và consistency. Ghi rõ reviewer và các vấn đề chưa sửa. Technical PASS không tự thành owner art approval hoặc kết luận “đẹp/hay” từ automation; N06-05 giữ usability 5 target users riêng.

N10-04 chạy 30 phút với **build landscape/animal đã tích hợp**, không lấy local preview cũ làm performance qualification. N14 chuẩn bị cùng contracts/assets, nhưng orientation/VoiceOver/energy và iPhone acceptance vẫn cần resources và evidence iOS riêng.

## 6. Task mapping và thứ tự

| Task | Vertical slice | Dependencies thêm |
|---|---|---|
| N06-06 | Style sheet, bộ phận/rig catalog và landscape storyboard | N06-02; giữ N06-01/02 đã VERIFIED làm lịch sử |
| N06-03 | Shared game shell theo hướng mới | Thêm N06-06; vẫn chờ N10-02 và N05-06 |
| N06-08 | Landscape layout/orientation và accessible fallback thực | N06-03, N06-06, N10-02 |
| N06-07 | Modular animal creator, lưu appearance và render chung | N06-03, N06-06, N02-04, N05-06, N10-03 (native Save cần auth thật) |
| N06-04 | Cảnh và hai vòng Deadline/Maid polished | Thêm N06-07, N06-08 |
| N06-09 | Visual/asset/landscape regression qualification | N06-04, N06-07, N06-08 |
| N06-05 / N10-04 | Usability / physical Android spike | Thêm N06-09 |
| N15-05 / N19-04 | Lodge dùng chung animal/landscape shell / Android ba mode | N15-05 thêm upstream N06-09; N19-04 vẫn đòi N10-04 |

[Manifest](../PLAN-MANIFEST.json) là DAG chính thức. Bốn task mới vẫn TODO, không thêm evidence implementation. Hoàn tất N10-02 đang IN_PROGRESS trước khi chuyển source ownership sang slice mới; N06-06 là task thiết kế ready kế tiếp. Rollback theo flag/catalog version: giữ renderer/profile v1, không xóa selections/receipts, không đổi authority hoặc các public/store gates.
