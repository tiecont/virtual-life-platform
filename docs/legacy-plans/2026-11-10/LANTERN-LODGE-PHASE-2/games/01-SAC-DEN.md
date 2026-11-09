# Game design — Sắc Đèn (Lantern Colors)

**Mode ID:** `lantern-colors` · **2–6 players** · **Target 5–8 minutes** · **MVP all-ages social card game** · **Status: proposed / not implemented**.

## Fantasy / điểm khác biệt
Một cuộc thi thắp sáng đèn lồng: đánh lá theo màu hoặc ký hiệu, giữ nhịp, đoán cách đối thủ điều khiển vòng chơi. Hình dáng bài và hiệu ứng phát sáng là nguyên bản. Có cơ chế **Tia Sáng (Glow)** tạo quyền đổi màu chiến thuật, không sao chép chi tiết vật phẩm/hiệu ứng từ PAWS/UNO.

## Luật v1 đề xuất, cần khóa bằng rule fixtures trước code

| Hạng mục | Quy định |
|---|---|
| Deck | 64 lá: 4 màu (đỏ/hổ phách/xanh lam/lục), mỗi màu số 1–8 (32); mỗi màu 2× `REVERSE`, 2× `SKIP`, 2× `DRAW_ONE` (24); 8× `PRISM` tự chọn màu |
| Setup | Shuffle CSPRNG phía server; phát 5 lá/người; lật lá **số** đầu tiên làm discard top, không kích hoạt effect setup |
| Đánh hợp lệ | Khớp màu đang hiệu lực, khớp số hoặc khớp cùng action-type; PRISM luôn hợp lệ |
| Không có lá hợp lệ | Rút một lá; nếu lá vừa rút hợp lệ có thể chọn đánh ngay trong lượt, ngược lại kết thúc lượt |
| `REVERSE` | Đảo hướng. Với 2 người được tính như bỏ lượt người còn lại; test trường hợp này |
| `SKIP` | Bỏ lượt người kế tiếp |
| `DRAW_ONE` | Người kế tiếp rút 1 và mất lượt; **không cộng dồn/stacking** trong v1 |
| `PRISM` | Chọn một màu hiệu lực, không dựa vào card color của chính lá này |
| Tia Sáng | Đánh lá số cùng **số** với top nhưng **khác màu** nhận 1 Glow (tối đa 2). Khi có 2 Glow, trong lượt của mình người chơi có thể tiêu cả 2 để đánh **một lá số vốn không khớp** màu/số đang hiệu lực (quyền `PIVOT`); lá action/PRISM không được dùng PIVOT. Không dùng cho action/wild |
| Kết thúc | Đánh hết bài và xử lý hiệu ứng lá cuối trong cùng mutation => thắng; nếu chạm giới hạn 6 phút hoặc deck không còn và toàn vòng đều pass => ai ít bài nhất thắng; nếu bằng số bài thì ai nhiều Glow hơn thắng; vẫn bằng thì **đồng thắng**, không dùng vị trí ghế làm lợi thế |
| Turn timeout | 25s; server thực hiện một lần `AUTO_DRAW_OR_PASS`, không tạo phantom play. 2 lượt timeout liên tiếp => đánh dấu AFK và áp dụng chính sách xử lý offline/forfeit đã version hóa; **host không thể tự ý đuổi** hoặc tạo kết quả thắng thay cho server |

Không có tiền cược, mua thẻ ngẫu nhiên hoặc biến reward thành vật phẩm đổi tiền. Tia Sáng không cho đi thêm lượt vô hạn: tối đa một PIVOT mỗi turn, phải giảm Glow từ 2 xuống 0, không cho PIVOT lại trong cùng turn.

## Ví dụ một lượt
Top là xanh số 4. An có vàng số 4: đánh lá vàng số 4, nhận 1 Glow vì đổi màu nhưng cùng số. Bình chỉ có hổ phách `REVERSE` và lục số 6: nếu không có lá hợp lệ, rút 1 theo luật. Sau các lượt, An đạt 2 Glow: ở lượt tiếp theo có thể PIVOT đúng một lá **số** mà bình thường không khớp; server trừ 2 Glow và tính lại top/action.

## State machine và commands
`WAITING_PLAY -> (PLAY_CARD|DRAW) -> (OPTIONAL_PLAY_DRAWN|RESOLVE_ACTION) -> ADVANCE_TURN -> WAITING_PLAY` hoặc `SETTLED`. `DRAW_ONE` ở bước resolve trên người kế tiếp trước khi turn advance. `PIVOT` chỉ hợp lệ trong PLAY_CARD và check current Glow. Deck refill: khi draw stack hết, server lấy discard trừ top, shuffle lại và lưu RNG counter. Nếu không có lá để rút, pass hợp lệ.

Commands: `color.play(cardId, spendGlow?, chosenColor?)`, `color.draw()`, `color.playDrawn(cardId)`, `game.leave()`. Reject forged foreign card, wild thiếu màu, PIVOT lần hai, chồng +1, wrong turn, command cũ/replay, draw-before-play sai phase. Hand projection riêng; public chỉ chứa hand count, top card, color, direction, Glow counter, current player + deadline.

## UX
Bàn ngang: trên là avatar và số lá của đối thủ, giữa là discard/top/action, dưới là 5–n lá riêng có thể sort theo màu/số. Mobile: thanh bài vuốt ngang; không kéo-thả là phương thức duy nhất; tap card -> mô tả/tùy chọn -> Confirm. Nút đổi màu là modal keyboard-accessible, có chữ và ký hiệu bên cạnh màu. Âm thanh và animation tùy chọn. Tại lượt của mình, hệ thống chỉ đánh dấu lá hợp lệ; không tự làm quyết định hộ khi mạng chậm.

## Minimum DoD
- Property tests: không tạo/mất lá; tổng bài =64 ở mọi bước, trừ lá nằm trong cấu trúc draw/discard/hand; luôn có <=1 actor; no negative Glow.
- Test 2-player reverse, empty draw pile, final PRISM, concurrent play+draw, idempotent ACK, disconnect timeout và renderer stale response.
- E2E 2 users thật (một Android vật lý + desktop browser nếu sẵn) cùng tài khoản sandbox riêng, end-to-end 1 match; không claim cross-device coverage rộng từ 1 Android.
- Safety/catalog/asset provenance và performance report có nguồn, SHA và actual results.
