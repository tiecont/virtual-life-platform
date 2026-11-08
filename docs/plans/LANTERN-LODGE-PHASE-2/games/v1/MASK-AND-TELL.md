# Game design — Mặt Nạ (Mask & Tell)

**Mode ID:** `mask-and-tell` · **3–6 players** · **Target 6–10 minutes** · **Social deduction / bluff** · **Status: proposed / not implemented**.

## Fantasy / điểm khác biệt
Một đêm hội hóa trang: người chơi đặt 1–2 lá bài úp và **tuyên bố** mình đang đánh đúng biểu tượng được yêu cầu. Đối thủ chọn Tin hay Lật. Thua cuộc mất **Uy Tín**; không dùng súng, roulette/rủi ro tử vong hay trò cược. Luật/đồ họa, tên kỹ năng là tài sản mới của VLP.

## Luật v1 đề xuất

| Hạng mục | Quy định |
|---|---|
| Deck | 72 lá: 3 biểu tượng (Mặt Trăng/Ngôi Sao/Bông Hoa), mỗi biểu tượng 24. Không có wild hoặc item nhìn bài trong MVP |
| Setup | 3–6 người, mỗi người 5 lá, 3 điểm Uy Tín ban đầu, 0 điểm Thông Thạo; server chọn biểu tượng mục tiêu |
| Nộp bài | Đến lượt đặt 1–2 lá úp, mặc định tuyên bố tất cả đúng mục tiêu; không show lá cho người khác |
| Cửa sổ nghi ngờ | Người kế tiếp có tối đa 20s để **Lật** claim vừa nộp hoặc **Tin** và tiếp tục đặt 1–2 lá của mình |
| Thách thức | Lật đúng khi có ít nhất 1 lá không khớp mục tiêu: người nộp mất 1 Uy Tín, người thách +1 Thông Thạo. Lật sai: người thách mất 1 Uy Tín, người nộp +1 Thông Thạo |
| Không ai thách | Tối đa 4 claims liên tiếp. **Claim thứ tư vẫn mở cửa sổ Tin/Lật**; nếu được Tin (hoặc quá hạn), người nộp nhận 1 Thông Thạo rồi round kết thúc. Nếu bị Lật, giải quyết thách thức và kết thúc round, không cộng thưởng claim thứ tư. Các lá chưa bị thách thức không được công khai |
| Hết round | Ghi điểm, giữ Uy Tín không thấp hơn 0; bỏ pile và phần hand còn lại về discard, server shuffle/chuẩn bị lại đến 5 lá, chọn target mới. 6 rounds tối đa |
| Kết thúc | Tổng điểm = 2× Uy Tín còn lại + Thông Thạo; người cao nhất thắng, đồng hạng công khai. Không elimination ngẫu nhiên |
| Timeout/quit | Đang nộp bài: pass/forfeit theo rule server, mất tối đa 1 Uy Tín mỗi round. Đang chọn Tin/Lật: default **Tin nhưng không tự nộp bài**, chuyển sang phase nộp bài có deadline mới; nếu thiếu participants thì ABORT không thưởng |

Số lá/deck/round/score là thiết kế để playtest, **không phải luật chính thức của Bluffalo Club**. Chỉ gọi `CLAIMED_SYMBOL` hiển thị công khai; không cho player tự gửi danh sách “bài đúng” để server tin. Sau `challenge`, server reveal chỉ tập card của claim cuối, không vô tình reveal hand/pile khác. Hết round phải giải quyết đúng số lá về discard, không nhân bản bài.

## Phần tâm lý cần giữ
Thông tin công khai: biểu tượng mục tiêu, người vừa nộp, số lá (1–2), tổng claim trong round, điểm, Uy Tín, deadline. Bí mật: identity lá trong hand, từng claim không bị thách, RNG state. Người chơi có quyền bluff và bị challenge; không có quyền gửi chat tùy ý nếu policy hiện tại chưa duyệt, dùng quick emote để tạo không khí.

## State / commands
`ROUND_START -> SUBMIT_CLAIM -> CHALLENGE_DECISION -> (RESOLVE_CHALLENGE|NEXT_SUBMIT) -> ROUND_END -> ... -> SETTLED`. `mask.submit(cardIds[])`, `mask.challenge()`, `mask.trust()`, `game.leave()`; `mask.trust()` chuyển sang lượt nộp kế tiếp (hoặc kết thúc round sau claim thứ tư), **không tự chơi hộ**. Phải kiểm tập card unique, thuộc hand và đúng count; ACK trễ sau turn switch là stale; challenge tại deadline có chính sách cutoff theo server time.

## UX
Bàn 3–6 avatar; giữa là mặt nạ mục tiêu và các lá úp (không phải hình bài gốc), trên góc hiển thị timeline “Bạn phải Tin hoặc Lật”. Người nộp chọn tối đa 2 lá private, xác nhận bằng nút lớn. Người thách có hai lựa chọn có mô tả rủi ro; animation chỉ reveal đúng claim đã bị lật. Người bị thách không được xem thao tác của đối thủ trước khi server commit. Mobile có lựa chọn không drag; hỗ trợ keyboard/focus/giảm chuyển động.

## Minimum DoD
- Property tests shuffle/copy conservation (72 lá), only correct challenger can act, never public-hand leak, penalty bounded, score deterministic, max4 claims / six rounds.
- Integration race: simultaneous trust/challenge, disconnect exactly at deadline, last card claim, wrong actor, guessed ID, replay after result, block/travel during phase.
- Privacy: serialized public/projection admin/log/telemetry không chứa private hand/unchallenged cards; spectator chỉ thấy public pile count.
- Human playtest: ít nhất một pilot nội bộ nhiều người thử **độ dễ hiểu** của Tin/Lật và điểm, không suy rằng game thú vị chỉ từ tests.

## Frozen proposal-v1 review notes (ADR0136)

Audience:casual social groups comfortable with consented bluff and reading a short decision;family-friendly design hypothesis,not a legal/store age rating. Bluff within rules does not itself justify moderation against a real account. No wagering,weapon/death mechanics or unrestricted messaging is enabled.

Worked example:the target is Moon.A submits Moon+Flower as one sealed claim.B chooses Challenge.Server reveals only those two cards,finds Flower,and applies A credibility3→2 and B mastery0→1.The round ends;other hands and unchallenged claims remain private.If a fourth claim is Trusted instead,its submitter gains1mastery and the round ends without revealing that claim.Trust never submits B's cards automatically.

Phase/timeouts:proposed SUBMIT_CLAIM25s (added by ADR0136);CHALLENGE_DECISION20s. At now>=deadline the server applies the frozen timeout transition once.Decision timeout means Trust then a fresh submission phase/deadline;submission timeout/pass loses at most1credibility per round. Fewer than3eligible participants after grace aborts with no reward. N17-01 must freeze target/starting-actor selection,deal/refill order,all pass/round/score edge cases and penalty behavior before executable rules. Six rounds and at most4claims per round remain proposal bounds,not measured balance.
