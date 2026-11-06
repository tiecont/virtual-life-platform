# 04 — Trải nghiệm người chơi và kiến trúc mobile

**Bổ sung owner 2026-11-06:** Gameplay chính chuyển sang landscape, toàn Virtual Life theo chủ đề animals và có creator từng bộ phận. [Animal/landscape visual direction](06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md) là yêu cầu mới cho N06-03 trở đi; các đề xuất bottom navigation/portrait ở chapter này chỉ là baseline lịch sử hoặc fallback, không còn là gameplay chính. Evidence đã có giữ nguyên phạm vi revision cũ.

**Trạng thái:** kiến trúc đề xuất để thực thi dần; chưa phải sản phẩm mobile đã kiểm chứng. **Mốc source rà soát:** `cef7dc17172f7c6cda930c99648a5e3ad609cc55`, ngày 05/11/2026.

## 1. Quyết định nền tảng

Giữ **React DOM + Pixi** cho trải nghiệm chơi 2D và chọn **Capacitor** làm hướng mặc định cho Android/iOS đầu tiên. Profile hiện tại là CachyOS + một Android thật: chốt Android bằng vertical slice N10-04 trên máy hiện có; iOS được quyết định riêng sau physical gate N14-03. Thiếu Mac/iPhone không chặn Android. Xem [execution profile](05-CACHYOS-ANDROID-FIRST.md). Đích sản phẩm là một city dễ vào, dễ hiểu, có hoạt động đáng quay lại; ưu tiên chất lượng Deadline và Maid trước khi mở rộng thêm world.

Shared client nằm trong `packages/game-client`, được Next portal mount trên web và được Vite build thành bundle cục bộ trong `apps/mobile`. Không thêm deployment/image `game-web` ở giai đoạn này. Server vẫn sở hữu identity, admission, movement hợp lệ, seat, order, focus và reward; đổi container mobile không đổi ranh giới authority.

Capacitor nhận built web assets có `index.html` và copy bundle vào native project; điều này phù hợp với một client tĩnh dùng chung. Nó không đóng gói Next server runtime vào điện thoại. [Nguồn Capacitor](https://capacitorjs.com/docs/getting-started)

## 2. Điểm xuất phát từ repo

Ở snapshot đã đọc, portal dùng Next/React DOM, scene dùng Pixi, realtime dùng Socket.IO. Renderer được load động, có reduced motion, suspend và cleanup. Room UI đã có native controls cho di chuyển/chọn ghế, skip link, trạng thái kết nối và safety. Đây là phần cần giữ khi thiết kế lại. [Portal package](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/package.json), [room UI](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/app/components/WorldRoomPanel.tsx), [renderer](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/packages/pixi-scene/src/renderer.ts).

Home hiện trình bày `LOCAL FOUNDATION`, database/schema status và giải thích PostgreSQL trước map. Route dùng server fetch và `force-dynamic`; Next config có API rewrite. Vì vậy mobile cần boundary client rõ, còn player home cần đổi trọng tâm sang hoạt động. Các chi tiết database, schema, health component và rollout thuộc admin/development. [Home](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/app/page.tsx), [Next config](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/portal-web/next.config.ts).

Hai ảnh evidence lịch sử trong repo đã được xem để đánh giá bố cục: portal desktop và travel mobile. Chúng thể hiện UI nhiều text/form và thao tác cuộn; không phải ảnh từ một phiên chạy mới. Synthetic labels trong ảnh cũ không chứng minh HEAD còn thiếu world thật. Current handoff ghi actual adapters và journey local đã kiểm chứng; tài liệu benchmark/accessibility cũng nêu rõ giới hạn emulation. Lượt rà soát này không chạy lại ứng dụng, đo retention hoặc chứng nhận production. [Handoff](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/HANDOFF.md), [phạm vi accessibility](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/architecture/ACCESSIBILITY-AUDIT.md).

## 3. Trải nghiệm chủ đạo: vào nhanh, làm được việc, muốn gặp lại

**Mục tiêu nháp: first meaningful action dưới 60 giây** đối với người mới trên profile mạng/thiết bị đã chọn, không tính thời gian chờ admission khi hệ thống đầy. “Có ý nghĩa” là bắt đầu focus ở một chỗ đã được server xác nhận, hoặc thực hiện bước đầu của một đơn phục vụ; không tính mở trang hay bấm một nút trang trí. Chưa có số đo chứng minh đạt mục tiêu này.

Home có ba ý định dễ hiểu: “Tập trung cùng nhau”, “Ghé quán”, “Gặp bạn”. Người quay lại có lựa chọn tiếp tục hoạt động khi server xác nhận trạng thái còn hợp lệ. Map phục vụ khám phá, không bắt người dùng đi qua nhiều form cho cùng một ý định. Chỉ xác nhận thêm khi travel ảnh hưởng hoạt động hiện tại hoặc có lựa chọn riêng tư quan trọng.

**Deadline:** chọn phòng phù hợp → thấy avatar/chỗ ngồi → chọn ghế → bắt đầu phiên focus → theo dõi tiến độ gọn → nghỉ hoặc kết thúc → nhận tổng kết đúng dữ liệu server. Hoạt động nhóm có đồng thuận, nhắc lịch tùy chọn. **Maid:** vào quán → chọn vai trò khách hoặc ca phục vụ tự nguyện → tạo/nhận một order đơn giản → thấy từng bước chuẩn bị/phục vụ → hoàn tất một lần → tiếp tục hoặc rời ca rõ ràng. Hai world dùng chung identity, navigation và safety, nhưng giữ nhịp chơi riêng.

Thiết kế một phòng thật đẹp và dễ chơi trước: palette thống nhất, silhouette avatar rõ, vật thể có dấu hiệu tương tác, animation ngắn có mục đích. Pixel art phù hợp với source nhưng phải có art direction, không chỉ lặp các khối sơ đồ. Desktop dùng viewport chính và dock gọn; mobile dùng bottom navigation ít mục, bottom sheet theo ngữ cảnh, tính safe area và bàn phím. Chat, wardrobe, event, roster không cùng chiếm màn hình.

Phản hồi ý định phải tức thời: highlight ghế hoặc mục tiêu ngay khi chạm, rồi animate theo kết quả server. Seat, order và reward chỉ hiển thị thành công sau xác nhận. Khi mất mạng, UI nói rõ hành động chưa được xác nhận và có đường phục hồi; không spinner vô hạn hoặc báo thưởng giả.

## 4. Cấu trúc shared client

| Thành phần | Trách nhiệm và boundary |
|---|---|
| `apps/portal-web` | Next routes, portal/public pages, mount `game-client`; giữ server-only code tại đây |
| `apps/mobile` | Vite entry, Capacitor iOS/Android, native configuration/signing; bundle game assets cục bộ |
| `packages/game-client` | React DOM screens/HUD, room controller, Pixi composition; không import Next/Node |
| `packages/client-sdk` | Typed HTTPS/socket client, protocol negotiation, snapshot recovery, session interface; không quyết định business authority |
| Platform adapters | Navigation, lifecycle, network, deep links, notifications và native-session bridge; implementation nằm trong app tương ứng |
| Pixi/world packages hiện có | Renderer, scene data, asset revisions và presentation theo world |
| `packages/contracts` | Schema runtime và HTTP/event contracts version hóa, dùng chung client/server |

Luồng dùng chung: `portal-web → game-client → client-sdk → HTTPS/WSS`; `mobile → game-client → client-sdk → HTTPS/WSS`, với native functions đi qua platform adapter. Không sao chép room logic cho mobile. Interface adapter nhỏ; chỉ tạo abstraction khi có consumer thật.

Tách `WorldRoomPanel` theo controller/recovery, renderer lifecycle và presentation từng bước trong vertical slice. Thay `next/link`, server environment và implicit same-origin API bằng navigation/API adapters; không rewrite toàn bộ state management. Source boundary check phải chặn server secrets, Node imports và Next-only APIs đi vào mobile bundle.

## 5. Mobile authentication và lifecycle

Socket hiện giới hạn chính xác `WEB_ORIGIN`, yêu cầu signed session cookie và CSRF. Native/local WebView có origin và cookie behavior khác. **Giữ nguyên browser cookie + CSRF guards**; không mở wildcard origin hoặc bỏ CSRF để mobile kết nối được. [Source socket auth](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/identity/socket.ts).

Native contract đề xuất:

1. Native authentication cấp session gắn account/device; refresh credential được bảo vệ bằng Keychain/Keystore qua adapter đã review. Không để refresh credential trong localStorage hoặc trả nó cho game JavaScript.
2. HTTPS dùng access token ngắn hạn; token có audience/scope, expiry và liên kết session còn hiệu lực. Logout/revoke phải vô hiệu hóa quyền tương ứng phía server, không chỉ xóa UI.
3. Authenticated HTTPS đổi lấy **socket ticket một lần**, TTL ngắn, gắn session/audience/protocol. Server consume ticket nguyên tử; replay, expired ticket và account mismatch đều bị từ chối.
4. Ticket đi trong handshake được bảo vệ bởi TLS, không query URL hoặc log. Native handshake có policy riêng; Origin không được coi là bằng chứng identity. Browser path vẫn giữ điều kiện cũ.
5. Sau handshake, mỗi command tiếp tục kiểm session, membership, quyền world và rate limit. Native credential không cấp thêm quyền gameplay.

Cụ thể hóa TTL, rotation, stolen-token handling và bridge allowlist trong security review trước triển khai. Client không sở hữu server secret. Deep link chỉ chọn destination dự kiến; admission vẫn do server xác minh.

Background: pause renderer/animation, giảm network work; presence/seat grace theo policy server. Focus timer dựa trên trusted timestamps, không phụ thuộc JavaScript chạy nền. Foreground: renew session nếu cần, lấy snapshot, giải quyết stale operation rồi mới cho hành động. Offline vẫn hiển thị shell/asset đã cache và trạng thái rõ; không commit order, reward hoặc admission tại máy. Capacitor có lifecycle/deep-link hooks để nối adapter này. [App API](https://capacitorjs.com/docs/apis/app)

## 6. Protocol và content tương thích N/N−1

Native binary cập nhật chậm hơn server. Quy ước ban đầu: server release N hỗ trợ client N và N−1 trong cửa sổ hỗ trợ đã công bố; số release là chính sách, không thay semantic protocol version. Phải ghi rõ ngày kết thúc hỗ trợ và `minimumSupportedClient`, không tùy ý cắt app đã phát hành.

Handshake khai báo `clientBuild`, `protocolVersion`, `worldVersion`, `sceneVersion` và capabilities. Server trả supported capabilities, content revision và thông báo update khi cần. Contract changes ưu tiên additive; server mới không gửi field/event bắt buộc mà client cũ không hiểu. CI phải chạy client N−1 với server N, kể cả reconnect, auth và travel.

Scene/assets dùng revision hoặc content hash; nội dung đã chọn phải nhất quán trong lifetime room. Giữ revision cũ trong cửa sổ tương thích. Không âm thầm đổi seat IDs, collision hoặc action semantics giữa phiên. Nếu bắt buộc nâng version, drain/đưa người chơi tới trạng thái an toàn rồi yêu cầu reload/update. Rollback backend phải thử với mobile binary đang lưu hành; rollback image không rollback ứng dụng trên điện thoại.

## 7. Khi nào đổi công nghệ

| Lựa chọn | Phù hợp khi | Trigger để chọn/đổi |
|---|---|---|
| React DOM/Pixi + Capacitor | Gameplay 2D hiện tại, cần web/mobile dùng chung | Mặc định; chỉ chốt sau physical-device spike đạt UX/lifecycle/performance gates |
| React Native/Expo | Native social/account/feed/forms chiếm phần lớn sản phẩm | Native interaction khó đáp ứng bằng client hiện tại, đội có năng lực RN và spike chứng minh lợi ích đủ bù hai rendering boundaries |
| Godot | Scene/editor/animation/physics trở thành bottleneck chính | Một prototype cùng gameplay vượt budget mà Pixi không đạt sau tối ưu có giới hạn; chấp nhận port client và asset pipeline |
| Unity | Định hướng 3D/avatar/game production pipeline phức tạp | Yêu cầu sản phẩm và đội ngũ cụ thể cần hệ sinh thái này; có prototype chứng minh lợi ích |

React Native dùng native views; không tự tái sử dụng DOM/CSS/Pixi renderer. Expo DOM components giúp chạy web trong WebView, có boundary giữa JS engines và giới hạn RSC; đây vẫn là hybrid, không phải chuyển game renderer sang native. [React Native](https://reactnative.dev/docs/intro-react-native-components), [Expo DOM](https://docs.expo.dev/guides/dom-components/).

Godot web export có các ràng buộc WASM/WebGL2 và nền tảng cần kiểm theo phiên bản. Unity hiện hỗ trợ một số mobile browsers; không loại nó bằng nhận định cũ “không chạy mobile web”. Với repo này, chi phí chuyển client và độ phù hợp mới là lý do chưa chọn engine khác. [Godot](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [Unity](https://docs.unity.com/en-us/engine/6000.5/manual/platform-specific/webgl/intro/browsercompatibility).

## 8. Spike đo trên thiết bị thật

Bắt đầu bằng Android vật lý hiện có; ghi model/OS/WebView trước khi chọn budgets, không mặc định đó là support floor. N10-04 chứng minh device baseline. Mở rộng coverage Android theo support claim qua emulator và beta/thiết bị bổ sung khi cần. iPhone physical matrix thuộc N14-03 sau khi có access. Ghi source SHA, app build, room size và network profile; emulator bổ sung API/screen coverage, không thay đo nhiệt/pin/GPU thiết bị thật.

Các ngưỡng dưới đây là **mục tiêu minh họa, chưa phải benchmark đạt**. Chốt trước khi đo, điều chỉnh có giải thích sau baseline; không hạ ngưỡng âm thầm để đổi FAIL thành PASS.

| Nhóm | Scenario và mục tiêu ban đầu |
|---|---|
| First action | Luồng mới tới hoạt động meaningful dưới 60 giây; báo riêng queue/network delay |
| Load | p75 interactive room ≤5 giây trên profile mạng công bố; đo nhiều lần cold/warm riêng |
| Render | Hoạt cảnh tiêu chuẩn hướng ≥30 FPS ở support-floor device, 60 FPS ở máy phù hợp; báo frame-time p95 và long stalls |
| Memory | 20 vòng vào/rời room; không nhân canvas/listener/socket. Đo JS heap và native footprint riêng; đặt budget theo thiết bị sau baseline |
| Battery/nhiệt | Phiên 30 phút, báo energy use/thermal state và workload; so với baseline cùng máy, không suy từ FPS hoặc heap |
| Network | Wi-Fi↔cellular, RTT/jitter/loss mô phỏng, offline/resume; không duplicate membership, order hoặc reward |
| Lifecycle | 10 background/resume, screen lock và process kill; focus phục hồi theo server time, hành động chỉ mở sau resync |

Phân tích bottleneck trước khi đổi stack: asset quá lớn, layout/DOM re-render, network và game rendering là các vấn đề khác nhau. Tối ưu có timebox rồi mới làm prototype so sánh. Thiếu iPhone/macOS không chặn N10/N11 Android: N14 giữ CONDITIONAL_NOT_ACTIVE trước khi được kích hoạt. Khi task iOS đã bắt đầu mà thiếu access thì ghi BLOCKED_EXTERNAL cho task iOS tương ứng; Android/emulation PASS không thay nó.

## 9. Acceptance scenarios và evidence

- Người mới chọn avatar, vào Deadline, chọn chỗ và bắt đầu focus; chưa đăng ký không bị ép đi qua màn quản trị identity phức tạp.
- Hai người cùng chọn ghế; UI phản hồi rõ, chỉ một người được server cấp quyền.
- Một khách và người phục vụ hoàn thành order Maid; retry không double-complete/reward; rời ca có kết quả dễ hiểu.
- Deadline → Maid → trở lại city giữ identity, social policy và trạng thái đúng; destination đầy thì không mất source ngoài ý muốn.
- Mất mạng trước/sau ack, revoke session, ticket replay, app kill và background/resume đều phục hồi hoặc từ chối rõ ràng.
- Canvas lỗi vẫn có controls semantic; keyboard/VoiceOver/TalkBack thao tác được; dialog/bottom sheet khôi phục focus; reduced motion, text resize, safe area và keyboard không che CTA.
- Client N−1 sử dụng server N và assets tương thích; unsupported client được hướng dẫn update, không nhận lỗi không giải thích.
- Report/block/withdraw/account deletion chạy qua API thật, có bằng chứng và không chỉ ẩn nút ở frontend.

Mỗi scenario lưu build/SHA, device/profile, expected/actual, logs đã lọc dữ liệu nhạy cảm và kết quả. Human usability test tối thiểu 5 người mục tiêu để tìm friction; mục tiêu nháp ≥4/5 hoàn thành task chính không hướng dẫn. Mẫu này không chứng minh retention. D1/D7, completion rate và lý do rời app được đo riêng sau khi có instrumentation/privacy phù hợp.

## 10. Store release và thứ tự thực thi

Mobile có hai release lane độc lập: Android APK/AAB ký và Play testing ở N11; iOS archive/IPA ký và TestFlight ở N14 conditional. Local signed APK install không cần Play account, và không thay bằng chứng Play testing. iOS cần toolchain Xcode tương ứng; pin runtime, native plugins và SDK khi thực thi. ArgoCD quản backend/web; không phân phối mobile binary. [Capacitor iOS](https://capacitorjs.com/docs/ios)

Store candidate phải có nội dung/gameplay đủ giá trị, navigation/keyboard/lifecycle hoàn chỉnh, crash reporting lọc PII, privacy disclosures, account deletion và UGC moderation/report/block có vận hành. Apple quy định safeguards cho UGC, yêu cầu trải nghiệm vượt một website được đóng gói lại và deletion trong app khi có account creation. Google yêu cầu deletion path trong app và web resource cho account creation, cùng moderation/report/block theo loại UGC. Các gate này không bảo đảm store phê duyệt. [Apple](https://developer.apple.com/app-store/review/guidelines/), [Google deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [Google UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

Withdraw consent khác xóa tài khoản: rút đồng thuận phải dừng tương tác và disclosure liên quan; deletion xử lý dữ liệu theo retention policy đã công bố. Giữ dating/random matching khỏi initial mobile release; đánh giá riêng thiết kế, moderation, privacy và store policy trước khi mở. Không dùng tuổi 18+ hoặc một feature flag thay cho review đó.

N06 design/prototype và N10-01 feasibility scope chạy song song sớm sau baseline cần thiết. N10-02 tạo shared-client extraction cùng bundle scene tối thiểu; N06-03/04 tiếp tục polished slice trên client dùng chung. Native auth và physical-device gate N10-03/04 chạy trước mobile hardening/store candidate. Dependency cụ thể lấy từ PLAN-MANIFEST.json, không suy ra thứ tự cứng theo số module. Kết quả mỗi đợt phải nói rõ phần đã kiểm chứng, thiết bị nào đã thử và phần còn thiếu; không ghi “mobile hoàn tất” từ một bản build thành công.


## 11. Scope evidence theo platform

N12-03 chỉ gate Android; N14-04 gate iOS. Backend release dùng context flags theo platform đã phân phối/hỗ trợ. Chưa có previous mobile release thật thì previous-release case ghi NOT_APPLICABLE với lý do, lưu first candidate baseline; không bịa N−1. VoiceOver và Keychain native implementation được kiểm tại N14; TalkBack và Keystore-backed storage tại N10/N11. Một Android PASS không chứng nhận iOS. Chi tiết ở [profile CachyOS](05-CACHYOS-ANDROID-FIRST.md).
