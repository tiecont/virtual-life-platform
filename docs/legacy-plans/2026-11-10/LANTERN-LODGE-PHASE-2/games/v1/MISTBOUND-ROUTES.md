# Game design — Hải Đồ Sương Mù (Mistbound Routes)

**Mode ID:** `mistbound-routes` · **4–8 players** · **Target 10–15 minutes (to be measured)** · **Hidden-role cooperative route puzzle** · **Status: proposed / not implemented**.

## Fantasy / điểm khác biệt
Hội thám hiểm dựng đường trên bản đồ mù sương dẫn từ Hải Đăng trung tâm đến một trong ba Cổng Hải Triều. Một cổng chứa **Mảnh Sao** cần tìm. Có người thuộc phe **Thủy Thủ** muốn tìm ra, và phe **Sương Mù** muốn cả nhóm đi lạc. Cùng chơi, cùng tranh luận, nhưng mọi thẻ đường và vai trò đều được server quản lý. Tên world, phe, tile art và quy tắc là nguyên bản, không lấy từ Fishy Business.

## Luật v1 đề xuất

| Hạng mục | Quy định |
|---|---|
| Board | Lưới vuông 7×7; Hải Đăng ở giữa; ba cổng tại các biên có connector hướng vào lưới; mỗi ô đặt phải liền kề một thành phần đường đã nối với Hải Đăng; target cổng chỉ thắng khi hai đầu nối đối xứng |
| Role | 4–5 người: 1 Sương Mù; 6–8 người: 2 Sương Mù; còn lại Thủy Thủ. Chỉ người chơi biết vai trò chính mình; Sương Mù biết cổng thật để có động cơ phá; quyền biết này chỉ được gửi trong private projection cho đúng người mang vai trò đó |
| Target | Server chọn ngẫu nhiên một trong ba cổng chứa Mảnh Sao, mã hóa trong state; không tiết lộ qua public map/metrics |
| Tile deck | Bộ tile gốc có hai, ba hoặc bốn nhánh kết nối N/E/S/W; mỗi player giữ 3 tile riêng; cấu hình chính xác được đóng băng trong file `ruleset-v1.json` trước runtime |
| Lượt | Người đang active chọn 1 trong: đặt và xoay 1 tile hợp lệ; dùng 1 la bàn chung để loại trừ một cổng sai; hoặc bỏ 1 tile rút mới (tốn lượt) |
| Compass | Tổng 2 lượt quét trên toàn ván; `scan` trả về **một cổng sai** có quy tắc chọn deterministic server; không cho client chọn mục tiêu tùy ý rồi lợi dụng xem secret |
| Victory crew | Một đường đi liên tục (BFS trên connections hai chiều) nối Hải Đăng tới cổng thật trước khi hết lượt |
| Victory mist | Không tìm được cổng thật trước `maxTurns = playerCount × 3` **khi ván vẫn có đủ người chơi hợp lệ**; nếu mất người dưới mức tối thiểu sau reconnect grace, kết thúc `ABORTED_NO_REWARD` chứ không trao thắng cho phe Sương Mù vì hành vi bỏ cuộc |
| Deadlines | Mỗi turn tối đa 25s, public debate giữa vòng theo feature budget; timeout server thực hiện pass/skip, không dựng một tile giả từ tay người mất kết nối |

**Fairness gate quan trọng:** trước khi chấp nhận một map/seed, generator hoặc test fixtures phải chứng minh board/target/layout có ít nhất một tuyến giải pháp hợp lệ về mặt hình học và lượng tile/turn, không rơi vào tình huống chắc chắn thua từ đầu. Việc RNG thật và tính giải được của mọi shuffle có thể yêu cầu generator có ràng buộc thay vì shuffle mù.

## Legal placement

1. Player đang có turn, match vẫn ACTIVE và còn lượt.
2. `tileId` nằm trong hand riêng, chưa tiêu. `rotation` là 0/1/2/3.
3. Vị trí trong 7×7, chưa chiếm và không ghi đè start/cổng.
4. Có ít nhất một connector nối hai chiều với network Hải Đăng hiện hữu.
5. Các cạnh giáp tile đã đặt không tạo connection một phía sai luật; validate đồng nhất N/E/S/W.
6. Áp dụng tile, tính lại connected graph, xác nhận mục tiêu và số turn trong cùng transaction. Không lấy BFS từ kết quả client.

Phe Sương Mù vẫn có quyền thực hiện các nước đi hợp lệ nhưng bất lợi (vòng đường dài, dùng compass sai thời điểm, bỏ tile tốt). Không cho phá dữ liệu bằng move bất hợp lệ hoặc sửa role/target. Khi không còn move hợp lệ, có hành động bỏ tile/rút thay; nếu cả deck bế tắc, giải quyết bằng phase timeout đã định nghĩa, không treo match.

## State / commands / secrets

`ROLE_DEAL -> TILE_TURN -> (PLACE|SCAN|DISCARD_DRAW|TIMEOUT) -> CHECK_WIN -> NEXT_TURN | FINISHED`. `route.place(tileId, x, y, rotation)`, `route.scan()`, `route.redraw(tileId)`, `game.leave()`. Public: map/tile đã đặt/cổng/chỉ báo kết nối/count deck + hand sizes, lượt còn, role *chỉ sau game kết thúc nếu policy cho phép*. Private: player hand, role; mist-side goal knowledge. Never send target to spectators. Need property tests connector symmetry and BFS equivalence; no trusted client path existence.

## UX
Desktop board 7×7 trung tâm, panel người chơi bên trái, tay tile và nút xoay bên phải, nút quét la bàn/draw rõ ràng. Android: tile theo hàng cuộn, tap tile → preview shadow tại ô hợp lệ → xoay bằng nút cố định → confirm. Viền connectors luôn có hướng bằng hình học, không phụ thuộc màu. Những ô không hợp lệ không được accept; UI hiện giải thích “chưa nối với Hải Đăng” trước khi gửi để tiện lợi nhưng server vẫn kiểm lại.

## Minimum DoD
- Generator tests theo nhiều seed chứng minh finite solvability assumptions và no hidden target leakage; không chọn bộ test may mắn rồi kết luận cân bằng.
- Concurrent place trên cùng ô: một ACCEPT, còn lại conflict/idempotent; reconnect/leave/owner restart không cho role khác xuất hiện.
- Game result settlement exactly once, reveal từng role/target theo policy, stats privacy và fair-score report.
- Pilot đo tỉ lệ thắng đội, thời lượng, bế tắc, người chơi hiểu luật, hành vi phá hoại trong gameplay vs harassment ngoài game; cân bằng lại theo dữ liệu, không hard-code tỉ lệ thắng phỏng đoán.

## Frozen proposal-v1 review notes (ADR0136)

Audience:casual groups comfortable with spatial connections and consented hidden-role play;family-friendly design hypothesis,not a legal/store age rating. Accessibility uses direction glyphs and explicit select/rotate/confirm;species and cosmetics do not change legal moves.

Worked example (illustration,not a generator fixture):given a start at(3,3)with a north connector and a north gate at(3,0)with an inward south connector,a north/south tile at(3,2)joins the start.A second north/south tile at(3,1)joins the first and gate.If that gate is the secret target,the connected path wins in the same committed transition. A tile lacking the reciprocal connector is rejected without revealing whether that gate is real.This illustration does not prove a whole deck/seed is solvable.

Phase/timeouts:TILE_TURN25s;now>=deadline yields one server pass/skip without fabricating a tile.MaxTurns=playerCount×3;only a still-eligible complete match may award the mist-side turn-limit victory.Fewer than4eligible participants after reconnect grace aborts without reward. N18-01 must freeze the exact tile inventory/rotations,start/gate positions/connectors,deterministic wrong-gate scan ordering and fairness/solvability assumptions before runtime. The2shared scans,3private tiles/player and1mist role for4–5players/2for6–8remain proposal inputs.
