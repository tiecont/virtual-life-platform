# Các quyết định phải khóa tại PA-002

Proposal là điểm xuất phát, chưa đủ để hai implementation tái hiện cùng kết quả. Không tự đánh contract freeze chỉ vì đã có TypeScript interfaces.

| Gap | Yêu cầu trước engine/API implementation |
|---|---|
| Fixed-point formulas | Đổi các hệ số thập phân thành rational/integer; chốt điểm floor, intermediate bounds/overflow, turn cap/tie-break so sánh %HP chính xác. |
| Match overlap/specials | Canonical scan/order, union của T/L/cross, multiple4/5matches; special anchor/orientation/radius, trigger order, overlap double counting và interaction khi swap special. |
| Cascades/no-moves | PRNG algorithm/seed encoding/cursor, refill traversal và reshuffle; max8 xử lý cái gì trước regeneration, warning event, terminal safety bound cho init/reshuffle. |
| Turn/status timing | Cooldown tick, mana/barrier decay, BURN/ROOT/WARD numbers/stack/cap/cleanse và target routing khi active Pet faint giữa combo; forced replacement, simultaneous defeat. |
| Skills | Allowed fixed identifiers per version, exact targeting/board conversion, cost rollback khi skill+swap invalid; event order/effect caps. Không tin `preSwapSkillId` không thuộc Pet. |
| PvE AI | Legal-command enumeration và stable tie-break, same rules API, boss scripting limits; seed/AI state persisted, không gọi engine khác với human turn. |
| Private/public state | `BattleReduction.nextState` trong proposal dùng public `BattleSnapshot` và bỏ PRNG state: phải tách InternalBattleState/PublicBattleView/OwnView/ReplayArchive. Persist secret RNG, chỉ public visible draws. |
| Hash/entropy privacy | Public stateHash chỉ hash canonical public projection; không expose unsalted commitment của low-entropy private state. Internal/replay hash giữ private hoặc reviewed commitment scheme. Replay không phát seed giữa PvP. |
| Command/event schemas | `requestId` vs `commandId`, battle/version/turn/seq semantics, payload fingerprint conflict, strict error envelope/enum, bounded delta pagination/retention, private event filtering. Server generates timestamp/eventId ngoài pure reducer. |
| Reconnect/restart | Lost COMMIT/ACK, durable current receipt vs historical result, supported ruleset/content retention và abort khi key/version thiếu; no phantom reward. |
| PvE progression | S1 result receipt không mint durable wallet; S2 first-clear vs repeat/day budget key, UTC/timezone/reset, correction/revocation/refund policy, no reward replay after account deletion. |
| Social/cross-game scope | Friend challenge chưa có contract; match consent khác room travel. Ownership/redaction, block/revoke/rate scopes; optional cosmetics bridge phải reviewed, independent OFF. |
| Presentation | 3D Pet model catalog riêng, saved account avatar không bị đổi; shape+glyph gems, keyboard non-drag input, responsive portrait fallback/landscape, loading/error/reduced motion. |
| Budgets/release | Lock source/content/render/workload and budgets trước đo; giữ5000ms/1500ms inherited gates khi applicable, 3s board target chưa đo. Staging/public/native/owner art approvals tách technical pass. |

PA-002 phải xuất fixtures cho canonical JSON/hash, seed sequence, overlap/special ordering, status tick/faint, invalid atomic skill, duplicate payload conflict và private projection. Các con số còn thiếu do domain owner chốt bằng versioned config, không hỏi owner lựa chọn implementation thông thường. Luật mới có `rulesetVersion`; content mới có `contentVersion`; active/replay giữ version cũ tới retention boundary được duyệt.
