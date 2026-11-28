# Blueprint sản xuất Limited S

Tài liệu được duy trì cho **VL-121 / VL-105 / VL-149 / VL-171 / VL-172**.
Trạng thái: **DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC**. Đây là đặc tả chuẩn bị
sản xuất, chưa phải bộ thiết kế đã duyệt, asset hoàn chỉnh hay gameplay đã chạy.
Backlog duy nhất vẫn là [development-plan.json](../../../config/development-plan.json).
Không thay thế sáu Standard S thuộc VL-160 bằng sáu Limited S.

**Glaciemora, Voltaris, Noctalith, Sylvaris và Leviara đang chờ thiết kế của chủ
sở hữu (`OWNER_DESIGN_PENDING`). Không thiết kế, sinh ảnh, dựng model, rig,
animation hoặc phát triển riêng năm nhân vật này trong phạm vi blueprint.**
Các bảng bên dưới chỉ chép lại định danh/hợp đồng hiện có và quy định đầu vào
cho một lần sản xuất được giao sau này. Không dùng tên, màu, lore, poster hay
prompt cũ để tự suy ra ngoại hình được duyệt. Icarus là pilot riêng; tài liệu
này cũng không tạo hoặc sửa asset Icarus.

## 1. Nguồn chuẩn và ranh giới triển khai

| Nguồn được duy trì | Nội dung phải lấy từ nguồn |
| --- | --- |
| [Catalog manifest](../v3.1/data/catalog_manifest.json), [240 Pets](../v3.1/data/pets_initial_240.json) | ID, element, race, body plan, rig archetype, skillRefs, card, roster; bản candidate chưa publish |
| [16 skills](../v3.1/data/skills_16.json), [board effects](../v3.1/data/board_effects.json) | Opcode, chi phí, cooldown, giới hạn ô và thời điểm biến đổi; không phải code thực thi |
| [Limited animation profiles](../v3.1/data/limited_animation_profiles.json) | 16 action/Pet, normal/rage cue, signature opcode và yêu cầu companion |
| [Asset manifest](../v3.1/data/pet_asset_manifest_240.json) | Đường dẫn dự kiến, LOD0/1/2; các entry vẫn MISSING, productionReady=false |
| [V3.1](../v3.1.md), [art direction](../art-direction.md) | Bàn 10×10 dự kiến, authority, visibility, provenance và kiểm tra; budget creature v2 không thay budget Limited |
| [Rust v1](../../../crates/aetheria-pet-arena/README.md), [reducer](../../../crates/aetheria-pet-arena/src/combat.rs) | Gameplay hiện có: 8 Pet, 6 stage, bàn 6×6/4 element, Start/Swap/Skill/Pass, snapshot/replay riêng |
| [Unity view](../../../apps/unity-client/Assets/Aetheria/Features/Native/Domain/PetArenaView.cs), [Unity README](../../../apps/unity-client/README.md) | Projection v1 kiểm đúng 36 ô, 8 Pet/6 stage; Unity 6000.3.14f1, URP 17.3.0 |
| [Lore/prompt hiện có](pet-lore-design-240.json) | Đề xuất biên tập; không phải canon truyện đã duyệt, reference ngoại hình hay quyền tạo asset |

Gameplay v1 không có sáu opcode Limited được triển khai bằng việc viết tài liệu
này. Không nhét 100 ô hoặc ID v3 vào decoder v1; không sửa frozen digest/replay
v1. V3.1 yêu cầu các contract version riêng `pet-arena-pve-v3`, `pet.intent.v3`,
`pet.view.v3`, `pet-arena.completed.v3`; alias thiết kế `pet-arena-v3` không phải
runtime selector đang hoạt động. Rust quyết định kết quả mới; Nest giữ control
plane/journal và RoomAuthority legacy. Unity không ghi SQL, RNG, HP, reward hay
tile mutation từ Animator, Timeline hoặc callback VFX. New gameplay default-off.

Đối chiếu nguồn khi soạn: checkout lore `55b3fab`, local main `38e4dc1`, pipeline
`734c5dd`, nhánh Icarus reference `4d29fde`, worktree review `9c25838`.
Main được đọc bằng `git show`; các worktree khác chỉ được đọc, không đồng bộ hay
sửa. Đây là mốc nguồn, không phải xác nhận trạng thái merge/CI của các nhánh.
Khi áp dụng blueprint trên revision mới, đối chiếu lại các contract phía trên.

Kit local `aetheria-soulbound-cinematic-kit/docs/08-3D-RENDERING-AND-VFX-PIPELINE.md`
cung cấp budget khởi điểm bên dưới. Kit ghi Limited ở VL-160 là thông tin cũ;
backlog hiện hành gán Limited cho VL-149/171/172. Kit không phải phụ thuộc CI.
Overlay `LimitedPetVisualDraftSchema` schema 2, ruleset `pet-arena-v3.1-limited`
và CLI `--limited-v31` đã thấy ở nhánh pipeline; **checkout blueprint chưa có
CLI này**. Tích hợp source pipeline qua quy trình PR trước khi dùng; không giả
định CLI v2 kiểm được Limited.

## 2. Định danh, skill và opcode phải giữ nguyên

Sáu entry đều rank S, source `limited_event_gacha`, `mapId=null`, tối đa 4 slot.
Mỗi Pet giữ ba skill chung `basic_strike`, `rage_strike_100`, `generic_guard`
và một signature trong bảng. Đây là metadata candidate, không hứa lịch banner,
quyền sở hữu, gacha thật hay mở khóa đã triển khai.

| Pet ID | Race / bodyPlan / rigArchetype | Signature skill / card | Opcode |
| --- | --- | --- | --- |
| `pet-v3-fire-icarus` | celestial / humanoid / rig_humanoid | `signature_icarus` / `signature_card_icarus` | `FIRE_ZONE` |
| `pet-v3-ice-glaciemora` | mythborn / quadruped / rig_q4 | `signature_glaciemora` / `signature_card_glaciemora` | `FROST_LINE` |
| `pet-v3-electric-voltaris` | avian / avian / rig_avian | `signature_voltaris` / `signature_card_voltaris` | `CHAIN_MARK` |
| `pet-v3-ghost-noctalith` | dragonkin / serpentine / rig_serpent | `signature_noctalith` / `signature_card_noctalith` | `CURSE_SIGIL` |
| `pet-v3-grass-sylvaris` | flora / humanoid / rig_humanoid | `signature_sylvaris` / `signature_card_sylvaris` | `GROWTH_GLYPH` |
| `pet-v3-water-leviara` | aquatic / serpentine / rig_serpent | `signature_leviara` / `signature_card_leviara` | `TIDE_CURRENT` |

| Skill chung đang tham chiếu | Opcode | Mana / Rage / cooldown lượt / level mở |
| --- | --- | --- |
| `basic_strike` | `MATCH_SWORD_ATTACK` | 0 / 0 / 0 / 1 |
| `rage_strike_100` | `CHARGED_RAGE_ATTACK` | 0 / 100 / 0 / 1 |
| `generic_guard` | `ADD_SHIELD` | 20 / 0 / 2 / 15 |

Catalog skill chung còn có `generic_elemental_skill` (`ELEMENTAL_HIT`),
`generic_heal` (`HEAL`), `generic_disrupt` (`APPLY_STATUS`), `generic_empower`
(`BUFF_ATTACK`), `generic_cleanse` (`CLEANSE`), `generic_protect` (`ADD_SHIELD`),
`generic_siphon` (`RESOURCE_DRAIN`). Không tự thêm chúng vào bốn slot mặc định.
Animation sau này chọn theo loadout đã được server cho phép, không theo lore.

| Signature | Mana | Normal: dấu trên bàn, không xóa/di chuyển/refill | Ultimate candidate, chỉ theo committed impact |
| --- | --- | --- | --- |
| `FIRE_ZONE` | 60 | `fire_zone_4x4`: 16 ô/2 lượt | Solar Flamefall: clear có giới hạn trên ô đã đánh dấu |
| `FROST_LINE` | 65 | `ice_row_10`: một hàng 10 ô/2 lượt | Glacier Chorus: shatter ô đánh dấu, rơi theo reducer |
| `CHAIN_MARK` | 60 | `lightning_chain_8`: tối đa 8 ô/1 lượt | Tempest Covenant: một chain có giới hạn, refill một lần |
| `CURSE_SIGIL` | 70 | `ghost_curse_5`: tối đa 5 ô curse/2 lượt; skill còn nêu 2 lock overlay | Eclipse Reliquary: clear curse trong một event đã kiểm |
| `GROWTH_GLYPH` | 55 | `wood_growth_3`: 3 ô/2 lượt; heal ở lần match hợp lệ tiếp theo | Verdant Rebirth: phản ứng growth giới hạn, debris được đánh dấu |
| `TIDE_CURRENT` | 60 | `water_current_path`: tối đa 8 ô/1 lượt cho swap tiếp theo, không displacement tức thì | Abyssal Serenade: một typed wave removal/refill từ server |

Mọi signature ở trên có Rage normal=0, cooldown=4, unlockLevel=1; ultimate có
Rage=100/Mana=0. Fusion card là thao tác khác, tốn Mana=200/Rage=150, cần owned
Pet và unlock; không lấy chi phí fusion thay normal hoặc Rage100. Các giới hạn
candidate chung: Mana cap300, Rage cap200, tối đa 16 cascade; không fuse hai
signature. Kiểm chi tiết ở [fusion rules](../v3.1/data/fusion_rules.json).

Chưa quyết định hộ reducer: quan hệ giữa 2 lock overlay của Noctalith với 5 ô
curse, tập tile đủ điều kiện cho growth/debris và timing expiry chính xác cần
được contract/runtime task chốt bằng test. Không dùng diễn hoạt để lấp chỗ chưa
rõ. `normal_sword_hit` là tên semantic, không bắt Icarus cầm kiếm hay buộc Pet
khác có tay người. Chuỗi cue giữ nguyên `<slug>_basic`, `<slug>_rage`; skill cue
signature là `limited_<slug>_signature` theo skills, không thay bằng tên clip tự đặt.

## 3. Gói truyện và design sheet cần tiếp nhận

Các số lượng sau là **đề xuất tiêu chuẩn bàn giao**, không phải số ảnh/truyện đã
tạo. Áp dụng cho từng Pet sau khi có đầu vào hợp lệ; riêng năm Pet pending chưa
được điền nội dung, tạo prompt mới hoặc sản xuất. Không áp style ngoại hình
Icarus lên quadruped, avian hay serpentine.

| Hạng mục/Pet | Số lượng và độ chi tiết | Kích thước/định dạng bàn giao |
| --- | --- | --- |
| Hồ sơ truyện | 1 bản VI: logline 40–60 từ, synopsis 250–400 từ, truyện chính 800–1.200 từ; 3 quan hệ, 3 mốc thời gian, động cơ/xung đột/lựa chọn/hệ quả; tách canon khỏi đề xuất | Text UTF-8 sửa được; count không dùng để thay đánh giá văn học |
| Bảng thoại tùy scope âm thanh | 6 câu ngắn: summon, bond, normal, rage, signature, victory; ghi người nói/ngữ cảnh, chưa TTS hay cast voice | VI gốc; EN sau khi nội dung được chốt; mã cue không đổi |
| Design sheet | **8 sheet/Pet**, nội dung bên dưới | Mỗi sheet 4096×4096 PNG sRGB + nguồn có layer; xuất từng view riêng, không upscale ảnh nhỏ để đạt số pixel |
| Storyboard cinematic | 2 board × 6 panel: intro và signature; ghi thời gian dự kiến, actor, camera, impact, board visibility và reduced-motion tương ứng | Mỗi board 4096×2304; 12 panel, ít nhất 1024×576/panel trước dàn trang; đủ đọc chữ ở 100% |
| Ảnh UI sau model | 1 portrait và 1 battle icon có vùng an toàn, silhouette và symbol element đọc được | 1024×1024 và 256×256 PNG alpha; kiểm tại kích thước thật |

Tám sheet có mục đích riêng, không tính tám góc chụp một mesh chưa đạt thành bộ
thiết kế hoàn chỉnh:

1. **S01 — nhận diện:** một full-body 3/4 trung tính, một silhouette đen, thước
   chiều cao/rộng, palette body/material/element tách riêng; không VFX che người.
2. **S02 — turnaround:** năm view riêng front, 3/4 front, side, 3/4 back, back;
   các view chính diện/ngang/sau orthographic cùng tỷ lệ và ground line,
   hai góc 3/4 đối chiếu cùng anatomy. Appendage đầy đủ trong khung.
   Mỗi view phải có bản riêng tối thiểu 2048 px
   theo chiều cao nhân vật; sheet tổng không được làm mất chi tiết.
3. **S03 — đầu/biểu cảm:** front và profile cận mặt, sáu biểu cảm hoặc sáu trạng
   thái cơ thể nếu anatomy không có mặt người; ghi feature phải giữ, không ép
   mắt/môi/tóc người lên mọi Pet.
4. **S04 — cấu tạo:** tối thiểu bốn callout tại điểm gắn/khớp/lớp che khuất;
   exploded view khi cần; đánh nhãn observed/inferred/proposed cho phần không thấy.
5. **S05 — vật liệu:** tối thiểu sáu swatch/callout có tên vật liệu, roughness,
   metallic, normal detail, opacity/emission và phần nhuộm; hiển thị neutral light.
6. **S06 — rig/deform:** sơ đồ root, deform chain, IK/controller, điểm bám và ít
   nhất sáu pose stress phù hợp body plan; tên controller không tính là bone runtime.
7. **S07 — action:** tám key pose có anticipation/contact/recovery được đánh dấu,
   liên kết tới action ID; bảng 16 action đầy đủ vẫn là yêu cầu riêng bên dưới.
8. **S08 — VFX/board:** normal marker, ultimate impact, thời điểm hồi board,
   feedback status/target và phiên bản reduced motion; chỉ minh họa phạm vi từ
   contract, không thêm mechanic hay tự thiết kế hình thức cho năm Pet pending.

Tổng khi cả sáu được giao sản xuất sau này: 6 hồ sơ truyện, 48 design sheet,
12 storyboard board/72 panel, 6 portrait + 6 icon. Con số này là kế hoạch khối
lượng, **hiện không có bộ ảnh mới nào được bàn giao bởi blueprint**. Độ phân
giải concept không phải độ phân giải texture game. Một ảnh chủ sở hữu đủ rõ có
thể bắt đầu intake; thiếu mặt khuất không bắt buộc xin thêm ảnh nếu được phép
đề xuất. Trong phạm vi hiện tại, năm owner design pending vẫn để trống.

Lore ở `pet-lore-design-240.json` và kit là `EDITORIAL_PROPOSAL_ONLY`. Địa danh,
quan hệ và đạo cụ trong truyện không tạo map assignment, skill, trang bị, nhiệm
vụ, quyền sở hữu hay kết quả chiến đấu. Trước khi biên tập thành canon, đối chiếu
owner design, giữ bảng thay đổi và giải quyết mâu thuẫn trong nguồn được duy trì;
không coi prompt cũ là chấp thuận ngầm. `mapId=null` không đổi theo bối cảnh truyện.

## 4. Rig, LOD, UV và PBR

Budget Limited từ kit là mục tiêu authoring chờ đo trong Unity; không phải
benchmark phần cứng đã đạt. Blender 4.x LTS; ghi patch version thực dùng. Meter
scale, Unity Y-up, forward axis được ghi trong importer; apply transform một
lần, tránh scale 0.01/100 hoặc mirrored tangent. Root phục vụ presentation,
không đẩy vị trí authoritative. Giữ đường dẫn/GUID đang có khi tiếp nhận asset.

| Hạng mục | LOD0 hero | LOD1 arena | LOD2 xa/low GPU |
| --- | --- | --- | --- |
| Triangles sau triangulation/export, gồm phụ kiện được render | 26.000–29.500 | 14.000–16.500 | 6.500–8.000 |
| Bones runtime | 68–82, Icarus chính xác 74 theo VL-171 | 48–56 | 28–34 |
| Material slots trên model | ≤3 | ≤2 | ≤1 atlas |
| Texture mỗi map/set | 2048×2048 | 1024×1024 | 512×512 |
| Skin weights — đề xuất import | ≤4 influence/vertex, normalize | ≤4 | ≤4 |

Các budget bone theo từng Pet trong kit: Icarus 74; Glaciemora 68; Voltaris 82;
Noctalith 78; Sylvaris 70; Leviara 76. Ngoài Icarus đã ghi trong acceptance
VL-171, các số còn lại chỉ là **baseline kỹ thuật chờ owner design**, chưa xác
nhận skeleton/topology. Không dựng skeleton cho năm Pet pending. Khi thiết kế
trả về có mâu thuẫn anatomy/rig (đặc biệt shorthand griffin so với `rig_avian`),
ghi vấn đề intake; không tự đổi canonical bodyPlan hay bóp anatomy để vừa budget.

Controller authoring và IK không xuất vào game nếu không cần deform. Đếm cả
root/leaf bone thực xuất trong báo cáo để tránh ẩn chi phí. LOD giảm bone cần
remap weight và bake motion riêng; không xóa bone đang có binding. Kiểm twist,
volume, sliding/contact, vai/hông/chân hoặc spine/appendage tương ứng anatomy,
và tóc/vải/appendage xuyên nhau trong mọi action. LOD chuyển không làm mất
root/socket, chân chạm đất, silhouette hoặc cue quan trọng. LODGroup threshold
và fade cần đo tại camera thật; chưa có ngưỡng khoảng cách được chứng nhận.

PBR vẫn cần dù look cuối là cel/anime. Đề xuất thống nhất texture export:

Với Icarus, chủ sở hữu đã chọn nguồn high-poly Meshy 7.1 + Meshy 7 PBR
4K/8K; giữ nguyên nguồn chi tiết và các map thực nhận. Budget 2K trong bảng
là mục tiêu texture runtime sau bake/streaming, không phải yêu cầu hạ chất
lượng nguồn authoring. Kiểm kích thước từng map vì normal có thể khác albedo;
không gọi cả bộ 8K chỉ từ tham số job. Năm Limited pending chưa được chọn
model/generator hoặc sinh nguồn chỉ vì pipeline Icarus có lựa chọn này.

| Map | Dữ liệu và color space | Quy tắc URP |
| --- | --- | --- |
| Albedo/BaseColor | sRGB; màu nền, không bake đèn/key shadow/AO nặng | Màu phải đọc được dưới neutral light, không phủ emission lên khuyết điểm |
| Normal | tangent-space, linear, texture type Normal Map | Kiểm chiều green/tangent trên model thật; tránh seam do mirror chưa ghi |
| ORM | linear; R=AO, G=roughness, B=metallic | Custom shader phải unpack đúng; URP Lit chuẩn cần chuyển thành metallic + smoothness=1−roughness và occlusion riêng, không cắm thẳng ORM |
| EmissiveMask | linear grayscale/mask; emission color tách riêng | Nếu texture chứa màu emission thì đánh sRGB theo dữ liệu; kiểm HDR không mất chi tiết hoặc gây nhấp nháy |

UV phải có texel density được ghi, seam có chủ đích, không overlap ngoài phần
mirror đã khai báo; bake cage không xuyên, kiểm padding/mip bleed ở từng LOD.
Đề xuất tối thiểu 16 px dilation ở 2K và scale tương ứng; số này cần kiểm lại
với mip/camera, không phải bảo đảm hết seam. High-poly sculpt được vượt budget;
export game và phụ kiện thì không. Các channel không dùng vẫn khai báo rõ,
không tạo map trắng rồi gọi là đã texture đủ.

Ước lượng tham khảo: BC7 8 bpp, 2K có full mip ≈5,33 MiB/map; bốn map ≈21,33
MiB/set, tối đa ba set ≈64 MiB/Pet ở LOD0. Đây là phép tính texture lý thuyết,
không phải VRAM đã đo; normal compression, atlas, streaming, render target,
mesh, shader và VFX làm tổng thay đổi. Material count không đồng nghĩa draw call
count: kiểm shadow/depth/outline/transparent pass và variant thực dùng bằng
Frame Debugger/profiler. Chưa có ngân sách frame time/shader variant toàn scene
được ký; VL-105 phải đặt và đo riêng trên ba golden scene.

Forward+, cel lighting, bloom/refraction trong kit là lookdev candidate; không
tự bật tất cả feature hoặc chuyển render pipeline project. Có fallback opaque/
masked đơn giản và giảm particle cho low quality; giảm motion bỏ camera shake,
sweeping zoom và flash lặp. Không dùng “flash ≤30 fps” của kit như tiêu chí an
toàn nhấp nháy. Màu/shape/symbol phải giữ target và warning đọc được khi tắt VFX.

## 5. Animation, cinematic và authority

Mỗi Pet có **16 binding action** chính xác dưới đây: tổng 96 binding cho sáu
Pet khi được sản xuất. Binding là yêu cầu semantic, không tự chứng minh có 96
file animation đã author. Có thể trích segment từ take dài nếu thời gian, curve,
root, transition và identity được kiểm; không đổi tên một clip để giả nhiều action.

| Action ID | Tiêu chí quan sát bắt buộc |
| --- | --- |
| `idle` | Loop có chuyển động cơ thể, seam đầu/cuối sạch |
| `world_walk_or_hover` | Locomotion phù hợp anatomy; contacts hoặc hover có chủ đích |
| `world_follow` | Follow/stop/turn theo vị trí server, không teleport/root authority |
| `emote` | Biểu cảm riêng, trở về idle sạch |
| `summon` | Xuất hiện và settle; intro có thể cấp segment này |
| `normal_sword_hit` | Anticipation/impact/recovery normal; `<slug>_basic` |
| `rage_sword_100` | Chuyển động khác normal; `<slug>_rage`; không tự trừ Rage |
| `signature_skill_windup` | Chuẩn bị signature, không mutate tile |
| `signature_skill_cast` | Cast và marker từ authoritative result |
| `ultimate_cut_in` | Optional/skippable camera; không che bàn/đổi deadline |
| `ultimate_impact` | Đồng bộ visual với committed event, không tính damage |
| `damage_reaction` | Reaction theo actor/result, tránh replay hit trùng |
| `defend` | Thể hiện guard/shield đã xác nhận |
| `status_affected` | Feedback status và expiry từ snapshot |
| `victory` | Chỉ khi kết quả authoritative win; không phát thưởng |
| `defeat` | Kết thúc/pose đúng, xử lý cancel và reconnect |

Kit có năm sequence authoring: idle 6–10s, intro 12–18s, normal 3–5s, rage 5–7s,
signature 8–12s. Chúng là showcase/take dài; không phải latency bắt gameplay
chờ. Intro map tới summon; signature cần segment windup/cast/cut-in/impact;
locomotion, follow, emote, reaction/status/guard/victory/defeat còn phải author.
Mục tiêu nhịp combat từ art direction: normal 0,45–0,8s, rage 0,8–1,3s,
skill 0,6–1,2s; cinematic dài có skip/reduced-motion. Đo thời gian thực, không
tự time-stretch mọi take rồi coi motion đạt chất lượng.

Integration v3 sau này phải nhận event có match/event ID ổn định, actor/target,
action kind, resolved resources/status và visual cue được allowlist. Dedupe event,
áp snapshot ngay, schedule presentation có giới hạn; skip/interruption/disconnect
không phát thêm intent. Reconnect dựng pose từ snapshot, không reissue gameplay
để phát lại cinematic. Out-of-order, wrong version và cue không biết phải fail
closed/fallback có chủ đích. Đây là acceptance cho adapter tương lai, không phải
tuyên bố decoder v1 đã phát/nhận những event này.

## 6. Intake và cổng nghiệm thu

Mỗi lần nhận thiết kế, ghi vào art specification hiện có của đúng Pet, không
tạo backlog hoặc manifest song song. Dùng các trường của character brief skill:
characterId, designRevision, taskIds, roster, primaryReference path/SHA-256,
additionalReferences, appearance/mustPreserve/hiddenViewProposals/assumptions,
technicalContractPaths, requiredActionProfilePath, requestedDeliverables và
benchmark. Nguồn reference phải ghi tác giả/xuất xứ/quyền sử dụng và phạm vi cho
phép; ghi rõ `null/PENDING` khi thiếu, không tự điền owner approval.

| Intake | Trạng thái cần giữ |
| --- | --- |
| Icarus | V3 reference đã được ghi trong lore: `selected_design_01.png`, SHA-256 `6bb497272dde6d6fa74a1eb4fccf88a60ae147ed529bd894f23e86441623c7fc`; kiểm file/hash lại ở lần sản xuất. Không lấy screenshot/kit cũ thay reference mới. Blueprint chưa review lại ảnh hoặc model |
| Glaciemora, Voltaris, Noctalith, Sylvaris, Leviara | `OWNER_DESIGN_PENDING`; primary appearance reference/design revision/hidden-view decisions chưa được cấp cho lần sản xuất này; giữ null, không dùng prompt proposal làm đầu vào được duyệt |
| Style benchmark chung | `UNVALIDATED_TARGET`; chỉ pilot đạt visual + full bindings + deformation + Unity thật mới thành `VALIDATED_OFFLINE_BENCHMARK` |

Chủ sở hữu cần cung cấp cho năm Pet: thiết kế/reference chính và chi tiết bắt
buộc giữ hoặc được phép suy diễn; nguồn/quyền sử dụng; revision muốn sản xuất.
Nếu reference mâu thuẫn canonical identity/rig, ghi riêng lựa chọn appearance
và đề xuất đổi contract để xử lý trước phần phụ thuộc; không sửa catalog âm thầm.

| Gate | Bằng chứng phải có trước khi PASS | Kết luận hiện tại của blueprint |
| --- | --- | --- |
| G0 brief/reference | File/hash có thật, priority reference rõ, conflicts/inference ghi rõ | Năm Pet pending; không có approval mới |
| G1 design views | Turnaround, close-up và vật liệu nhất quán, silhouette/identity đúng | Chưa tạo/review bộ mới |
| G2–G3 base/detail | Mesh sửa được, anatomy/construction/face/appendage so neutral renders | Không kiểm model trong task này |
| G4 game asset | Đo tris/material/LOD, UV/bake/PBR đúng, export không mất chi tiết | NOT_TESTED |
| G5 rig/skin | Weight/bone budget và stress pose; không penetration rõ trong action | NOT_TESTED |
| G6 animation | 16 action có thật, loops/contacts/transitions và geometry motion được review | NOT_TESTED |
| G7 Unity | Licensed Editor import, prefab/controller/shader/VFX/binding đúng; motion thật và reduced motion | NOT_TESTED |
| G8 delivery | Reopen source, reimport exports, verify hashes và xem footage thực | Chỉ bàn giao tài liệu, không asset |

Kiểm visual bằng neutral front/side/back và hai góc 3/4, turntable, cận mặt và
vùng attachment, action representative VFX off/on. Khung phải chứa chân/đầu/
appendage; chuyển động camera/particle không thay bằng chứng mesh deform.
Đề xuất footage review 1920×1080/30 fps, tối thiểu một lượt mỗi action và hai
chu kỳ mỗi loop; một bản full và một reduced motion, `ffprobe` xác nhận encoded
duration/frame rate/audio nếu có. Tránh render pose stale từ Editor: tick render
loop đúng hoặc bake sample, quan sát hình thật. Screenshot không thay video.

Không gộp các trạng thái thành một PASS: visual dùng `NOT_REVIEWED`,
`ART_REVISION_REQUIRED`, `ART_PASS_SELF_REVIEWED` hoặc `ARTIST_HANDOFF_REQUIRED`;
technical hash/schema, Unity, performance, rights và owner approval ghi riêng.
Review tự làm ghi `SINGLE_AGENT_SELF_REVIEW`. Lỗi focal nghiêm trọng không được
bù bằng nhiều triangle hoặc CI xanh. Sửa tối đa ba lần có thay đổi kỹ thuật rõ
trên cùng lỗi mỗi run theo skill, rồi handoff local nếu chưa đạt; không nhân bản
pilot thất bại. Không cần thuê/liên hệ/upload để viết hoặc giữ gói handoff.

Delivery sau này gồm `.blend` reopen được và texture kèm/packed, FBX/GLB thực,
LOD0/1/2, textures và import settings, rig/actions, Unity materials/shaders,
prefab/controller, VFX/audio bindings, Timeline/Cinemachine nếu scope yêu cầu,
preview full/reduced, portrait/icon. Dùng asset root/GUID hiện hữu và overlay
pipeline đã tích hợp; không ghi đè frozen MISSING manifest để giả hoàn tất.
Overlay phải pin catalog hash và source/export/import/runtime hash thực,
design revision, reference hash, author/provenance. BOUND_DRAFT chỉ chứng minh
binding và bytes, không chứng minh định dạng, chất lượng, chuyển động hay quyền.

Log/probe/comparison/render trung gian và gói handoff nằm trong ignored
`artifacts/`; chỉ nguồn/thiết kế/asset/preview có chủ đích mới được maintain trong
Git. Đo frame time CPU/GPU, p95, memory/VRAM, shader/load hitch tại scene, quality,
resolution và máy/GPU cụ thể; không dùng MP4 Editor thay Windows player
qualification. Rights, phần cứng, signing và public release vẫn là các cổng riêng.

## 7. Kiểm tra tài liệu và bước nối tiếp

Các lệnh hiện có trên checkout blueprint:

```sh
pnpm plan:status
python3 scripts/validate-pet-lore-design.py
python3 scripts/validate-pet-v31.py
node scripts/pet-design-check.mjs
git diff --check
```

Sau khi tích hợp pipeline, build packages rồi dùng `pet-asset-check.mjs
--limited-v31 <bindings.json> --require-complete` cho character được chọn. Đọc
missing list/acceptance fields, không coi exit0 của missing preflight là full
acceptance. Khi có asset mới, chạy đúng Unity import/EditMode/PlayMode/render và
targeted contract/runtime tests; thay đổi source cần hosted CI tại commit thật
trước merge. Blueprint không chạy thay các check asset/runtime còn thiếu.

Bước tiếp theo cho nhánh tài liệu: review nội dung và checks tại commit được
ghi trong VL-121, rồi tích hợp bằng PR xanh khi được giao; không merge trong
phạm vi này. Bước tiếp theo của sản xuất: hoàn tất pilot Icarus riêng, nhận năm
owner design và chốt intake trước khi author từng Pet. VL-149/VL-172 vẫn mở;
schema/pipeline reuse có thể chuẩn bị mà không tự thiết kế năm Pet pending.
