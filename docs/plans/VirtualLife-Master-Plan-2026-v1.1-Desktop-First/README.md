# VirtualLife — Desktop-First Master Development Plan v1.1

**Một game social-fantasy anime 3D chạy native**, trong đó nhân vật người thú có biểu cảm và chuyển động giàu cảm xúc, tự do dạo quanh một thành phố học đường sáng sủa, vào café/maid café/arcade/card lounge/Pet Arena và chơi hoạt động thật tại bàn/arena. **VirtualLife** là tên app, wordmark và launcher.

## Product surface
| Surface | Vai trò | Tech chọn | Cam kết rollout |
|---|---|---|---|
| **Windows Desktop (PRIMARY)** | World 3D / multiplayer / game; 60 FPS target theo hardware | Unity 6.3 LTS + URP, C#, custom anime shaders | Vertical slice + closed beta trước |
| **Official Website** | Launch site, trailer, accounts, downloads, update/news, status | Next.js + React, CDN optimized media | Bắt buộc cho official release |
| **Rust Game Runtime** | World state / movement / NPC interactable / seating / teleports / battle & card rules | Rust Tokio/Axum/tonic + Postgres | Một writer/domain; canonical receipts |
| **NestJS Platform** | Account, social, shop/ledger, content, moderation, durable jobs | NestJS TypeScript | Không giữ game sim authority |
| **macOS / Linux / Android / iOS** | Clients mở rộng với tier/hardware rõ | Unity build profiles, native store constraints | Go/no-go riêng, không hứa release cùng Windows |
| **Browser 3D** | Tối đa web-lite/demo/interactive preview nhỏ | Giữ Three.js nếu có bằng chứng | Không nằm trên critical path của game hoàn chỉnh |

## Thay đổi so với v1.0
- V1.0 web-world trước, Unity native mobile sau G4. **V1.1 đảo critical path**: Unity **desktop-first** từ G1/G2; G4 là **Windows playable closed-beta**, G5 chỉ còn ports tùy chọn.
- Website bây giờ là **official publishing surface**, không phải browser open-world. Existing web renderer N06-04 / N06-09 phải được handoff/hồi quy nhưng không cần nâng thành AAA web scene.
- Thêm docs: desktop render/shader/perf, native network, art/export, patch/launcher, website, native interaction, policy release và tests; có mock website offline.
- **Giữ task IDs VL-001..076** (semantics được cập nhật vì tất cả VL status ban đầu TODO); thêm VL-077..110 làm lane desktop/portal/release rõ ràng. **Không** sửa bất kỳ status N/PA/HL VERIFIED trong archive.

## Nguồn & giới hạn
- Được xây trên gói v1.0 và archive các plan đã cung cấp ngày 2026-11-09; **không** phải audit repo HEAD hoặc kết quả benchmark.
- Tham khảo chất lượng 3D game anime nổi tiếng ở cấp aspiration; không dùng trực tiếp các IP, shader, nhân vật, UI, soundtrack hay asset của họ.
- Thông số FPS/VRAM/RTT trong plan là **target để kiểm thử**, chưa phải số liệu đo từ implementation hiện có.
- Key-art/ logo được kế thừa từ v1.0 là **concept/proposed brand**, không phải tài sản sản xuất đã phê duyệt về nhãn hiệu.

## Cách dùng gói
1. `START-HERE.md` rồi ADR desktop-first.
2. Xem `04-delivery/AGENT-EXECUTION-ORDER.md`, reserve source files trước khi cho agents làm song song.
3. `python3 tools/validate_plan.py` và `python3 tools/next_task.py` để kiểm tra DAG.
4. Có code, CI, profiling **thật** trước khi đánh bất kỳ task nào VERIFIED.

**Không có mã nguồn Unity/Rust/Nest production trong ZIP này.** Đây là master plan, samples/prototypes và task orchestration để triển khai thành sản phẩm.
