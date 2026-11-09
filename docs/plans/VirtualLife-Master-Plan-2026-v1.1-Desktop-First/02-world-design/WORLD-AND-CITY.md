# Aurora City — world bible v1

## Địa lý trải nghiệm
VirtualLife bắt đầu tại **Aurora City**, một thủ phủ học đường fantasy sáng trong: quảng trường trắng xanh, mái gốm mint, biển hiệu neon pastel nhẹ, tàu điện lướt nền xa, các góc café ấm và đồi academy. Đây là IP gốc, không lấy map/kiến trúc cụ thể từ game tham khảo.

### Districts theo roadmap
| Place ID | Khu | Cảm xúc | Gameplay | Giai đoạn |
|---|---|---|---|---|
| `aurora-plaza` | Aurora Plaza | nắng, cây, đài phun, social hub | spawn, info kiosk, map | vertical slice |
| `lumi-street` | Lumi Street | tiệm bánh/café, bảng hiệu | café, ăn uống, ghế | vertical slice |
| `lumi-cafe` | Café Lumi (indoor) | gỗ sáng, kính, cây xanh | sit/order/emote/table chat | vertical slice |
| `card-lounge` | Starlit Card Lounge | đèn vàng, bàn bài | Lantern mini-game | vertical slice |
| `pet-district` | Pet District | festival Pet, sân tròn | Pet camp, training gate | vertical slice narrow |
| `arena-training` | Pet Arena interior | kính màu, rune, công nghệ nhẹ | match-3 PvE board | vertical slice |
| `academy-walk` | Academy Walk | thư viện, học viện, sân vườn | emotes/quests | phase later |
| `maid-cafe` | Bellflower Maid Café | lịch sự, dễ thương, SFW | serve minigame, seat | phase later |
| `observatory` | Aster Observatory | đêm xanh, sky portal | event/exploration | later |
| `lodge-hill` | Lantern Lodge | wood, lantern, cards | board games + rooms | reuse legacy, gated |

## Day-night / weather (visual only initially)
Dùng client-side ambient clock seeded by server time/region để trình bày sky, NPC loop, billboard, lantern, foliage, breeze, reflection. Tương tác ảnh hưởng luật (giờ mở event, seat capacity, gameplay deadline) **phải** do Rust/Nest policy server time. Không đồng bộ 60Hz cây/cờ/xe chỉ để đẹp.

## World origin & scale
Đơn vị mét và định nghĩa tọa độ/source scene asset chung; navmesh/collision simplified server subset; placement of seat, doors, trigger and portals từ editor có deterministic GUIDs. Origin rebasing cho district lớn nếu cần; bắt đầu instance-contained zone, không thổi thành open world continuum.

## Crowd/NPC
- NPC ambience có path spline/animation local; interactive NPC có server entity ID/state.
- Client far crowds impostors/low bone count, gần mới rig face/high fidelity; không hiển thị nhiều private avatar nếu visibility policy không cho.
- Max population per instance và visible avatar count do benchmark; dynamic queue/admission giúp server không quá tải.

## Indoor transition
Không chỉ nhấn menu game: path tới cửa → light interaction ray/proximity → enter receipt → camera+scene transition, avatar vị trí spawn trong venue → walk to seat → reserve + sit animation → inspect menu/table. Khi đang trong game, world actor vẫn giữ avatar state, nhưng movement/teleport bị chặn hoặc cần forfeit/cancel theo rules.

## Visual map
Xem `07-visuals/VirtualLife-city-map.svg` và prototype HTML; bản đồ schematic, chưa là navmesh/source geometry. `M` → modal map có labels/POIs/filters, fast travel interactable; menu search/list accessible và mobile button.
