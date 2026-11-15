# Danh Mục Thiết Kế Pet Arena v2

114 loài nguyên bản, 19 hệ và 19 vùng PvE. Đây là thiết kế metadata DRAFT,
chưa phải Pet đã cân bằng, đã tạo model hay được duyệt phát hành. Mọi loài có
thể lên cấp 100; cấp dưới đây là cấp gặp trong PvE, không phải giới hạn Pet sở hữu.
Danh sách máy đọc được và thông số: [catalog-v2.json](catalog-v2.json).
Luật chung và schema: [v2.md](v2.md). Trạng thái công việc chỉ nằm trong
`config/development-plan.json`.

Mỗi vùng có sáu phân khu: cửa ngõ, đường mòn, vùng sinh cảnh, phế tích, đỉnh và
thánh điện. Thắng boss mở vùng tiếp theo; server kiểm tra chiến tích và clear
receipt. Capture cần 3 chiến thắng hợp lệ khác nhau, không reset do logout hoặc
hết tuần. Boss có thể thu thập sau clear chiến dịch; thưởng tuần có giới hạn riêng.
Độ hiếm quy định độ khó kiếm và thẩm mỹ, không tự cộng hệ số sát thương.

| Hệ | Map PvE | Cấp Khuyến Nghị | Chiến Tích Mở | Pet Theo Phân Khu, Cấp Gặp Và Vai Trò |
| --- | --- | --- | --- | --- |
| Thường | Meadow Hollows | 1–28 | 0 + clear vùng trước | Puffern (1–8, Tấn công); Mosspad (5–12, Hỗ trợ); Brindleap (9–16, Phòng thủ); Reedruff (13–20, Khống chế); Tandemble (17–24, Tích năng lượng); Hearthmantle (21–28, Phòng thủ, boss) |
| Lửa | Cinder Terraces | 5–32 | 30 + clear vùng trước | Coalwhisk (5–12, Tấn công); Emberloom (9–16, Hỗ trợ); Kilnback (13–20, Phòng thủ); Flarequill (17–24, Khống chế); Scorchveil (21–28, Tích năng lượng); Pyrecrown (25–32, Phòng thủ, boss) |
| Nước | Tideglass Lagoon | 9–36 | 60 + clear vùng trước | Dewskip (9–16, Tấn công); Ripplefin (13–20, Hỗ trợ); Foamcurl (17–24, Phòng thủ); Tideweft (21–28, Khống chế); Abyssail (25–32, Tích năng lượng); Lagoonarch (29–36, Phòng thủ, boss) |
| Cỏ | Canopy Weald | 13–40 | 90 + clear vùng trước | Budwisp (13–20, Tấn công); Vinepurl (17–24, Hỗ trợ); Mossmane (21–28, Phòng thủ); Thornlace (25–32, Khống chế); Bloomvault (29–36, Tích năng lượng); Canopyr (33–40, Phòng thủ, boss) |
| Điện | Stormcoil Fields | 17–44 | 120 + clear vùng trước | Zipspool (17–24, Tấn công); Copperkip (21–28, Hỗ trợ); Arcshell (25–32, Phòng thủ); Pulsecrest (29–36, Khống chế); Thundrel (33–40, Tích năng lượng); Stormdiadem (37–44, Phòng thủ, boss) |
| Băng | Rimebell Basin | 21–48 | 150 + clear vùng trước | Rimebud (21–28, Tấn công); Frostknit (25–32, Hỗ trợ); Glacetail (29–36, Phòng thủ); Hailmorrow (33–40, Khống chế); Cryocrest (37–44, Tích năng lượng); Wintervault (41–48, Phòng thủ, boss) |
| Giác Đấu | Echo Steppe | 25–52 | 180 + clear vùng trước | Pawtempo (25–32, Tấn công); Knucklefern (29–36, Hỗ trợ); Bracetusk (33–40, Phòng thủ); Rhythmant (37–44, Khống chế); Ironstance (41–48, Tích năng lượng); Echochamp (45–52, Phòng thủ, boss) |
| Độc | Violet Mire | 29–56 | 210 + clear vùng trước | Mirepip (29–36, Tấn công); Venomoss (33–40, Hỗ trợ); Sporeveil (37–44, Phòng thủ); Brinebarb (41–48, Khống chế); Toxilume (45–52, Tích năng lượng); Mirematron (49–56, Phòng thủ, boss) |
| Đất | Ochre Labyrinth | 33–60 | 240 + clear vùng trước | Clodkin (33–40, Tấn công); Burrowick (37–44, Hỗ trợ); Dunebraid (41–48, Phòng thủ); Siltmaw (45–52, Khống chế); Terracrest (49–56, Tích năng lượng); Faultwarden (53–60, Phòng thủ, boss) |
| Bay | Skyreed Isles | 37–64 | 270 + clear vùng trước | Breezlet (37–44, Tấn công); Kitespun (41–48, Hỗ trợ); Gusthorn (45–52, Phòng thủ); Cloudlace (49–56, Khống chế); Tempestail (53–60, Tích năng lượng); Skyregent (57–64, Phòng thủ, boss) |
| Tâm Linh | Mirror Orchard | 41–68 | 300 + clear vùng trước | Glimpseed (41–48, Tấn công); Thoughtuft (45–52, Hỗ trợ); Mirribbon (49–56, Phòng thủ); Astraloom (53–60, Khống chế); Mindspire (57–64, Tích năng lượng); Oracleaf (61–68, Phòng thủ, boss) |
| Bọ | Amber Understory | 45–72 | 330 + clear vùng trước | Threadpip (45–52, Tấn công); Waxwinglet (49–56, Hỗ trợ); Carapurl (53–60, Phòng thủ); Silkforge (57–64, Khống chế); Amberclad (61–68, Tích năng lượng); Hivecantor (65–72, Phòng thủ, boss) |
| Đá | Basalt Choir | 49–76 | 360 + clear vùng trước | Peblune (49–56, Tấn công); Shalebell (53–60, Hỗ trợ); Flintspur (57–64, Phòng thủ); Cragweft (61–68, Khống chế); Geodrum (65–72, Tích năng lượng); Monolithorn (69–76, Phòng thủ, boss) |
| Ma | Lantern Necropolis | 53–80 | 390 + clear vùng trước | Wickrift (53–60, Tấn công); Shroudlet (57–64, Hỗ trợ); Bellshade (61–68, Phòng thủ); Echowisp (65–72, Khống chế); Veilrelic (69–76, Tích năng lượng); Lanternwake (73–80, Phòng thủ, boss) |
| Rồng | Wyrmglass Ridge | 57–84 | 420 + clear vùng trước | Scalebud (57–64, Tấn công); Coilcrest (61–68, Hỗ trợ); Spirewing (65–72, Phòng thủ); Runescale (69–76, Khống chế); Crestwyrm (73–80, Tích năng lượng); Wyrmglass (77–84, Phòng thủ, boss) |
| Bóng Tối | Umbra Vale | 61–88 | 450 + clear vùng trước | Dimble (61–68, Tấn công); Dusktuft (65–72, Hỗ trợ); Sablecoil (69–76, Phòng thủ); Nightweft (73–80, Khống chế); Umbramane (77–84, Tích năng lượng); Eclipseward (81–88, Phòng thủ, boss) |
| Thép | Alloy Foundry | 65–92 | 480 + clear vùng trước | Rivetip (65–72, Tấn công); Tinmantle (69–76, Hỗ trợ); Cogcrest (73–80, Phòng thủ); Chromeweft (77–84, Khống chế); Alloyhorn (81–88, Tích năng lượng); Foundryheart (85–92, Phòng thủ, boss) |
| Tiên | Chimegrove | 69–96 | 510 + clear vùng trước | Chimeling (69–76, Tấn công); Petalbell (73–80, Hỗ trợ); Glimmerlace (77–84, Phòng thủ); Wishweft (81–88, Khống chế); Grovehalo (85–92, Tích năng lượng); Chimequeen (89–96, Phòng thủ, boss) |
| Ánh Sáng | Dawn Prism Sanctum | 73–100 | 540 + clear vùng trước | Gleamlet (73–80, Tấn công); Dawnpurl (77–84, Hỗ trợ); Raymantle (81–88, Phòng thủ); Solweft (85–92, Khống chế); Prismhalo (89–96, Tích năng lượng); Dawnarchon (93–100, Phòng thủ, boss) |

Mỗi Pet có silhouette riêng trong JSON, hệ số vai trò, growth curve, skill/card
loadout, form, điều kiện capture và tình trạng asset. Hai dạng thăng tiến hình
ảnh dự kiến ở cấp 30/60 không tạo ba loài giả để tăng số lượng catalog.

Bộ hình ảnh ưu tiên: Emberloom (Lửa), Ripplefin (Nước), Terracrest (Đất),
Cloudlace (Bay), Umbramane (Bóng Tối), Prismhalo (Ánh Sáng), boss Dawnarchon.
Cần portrait, icon, model/rig, idle/summon/normal/rage/skill/combo/hurt/defend/
status/defeat/victory và preview Unity thực trước khi công bố chất lượng hình ảnh.
Các hệ còn lại vẫn có thiết kế đầy đủ nhưng nội dung chưa đủ asset phải ở draft.

Ma trận dùng 1.25× lợi thế, 0.8× kháng, 0× miễn nhiễm và 1× trung tính.
Ánh Sáng có đối trọng Cỏ/Thép/Bóng Tối; không phải hệ hiếm mạnh hơn mọi hệ.
Danh sách tương tác có hướng trong JSON là nguồn thiết kế duy nhất; phải qua
simulation, kiểm tra softlock và playtest thật trước khi trở thành luật phát hành.
Không dùng tên, nhân vật, model, âm thanh hoặc sprite của Pokémon/Pokiwar.

