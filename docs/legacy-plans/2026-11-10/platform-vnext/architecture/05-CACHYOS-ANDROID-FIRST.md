# 05 — Phát triển trên CachyOS với một điện thoại Android

> Scheduling update: [revision 2.4](../REVISION-2.4-WEB-FIRST.md) makes web/server first. Preserve this design/budgets/evidence; native physical/build/AVD scenarios move to deferred N10-06/N10-04/N11/N14. They are not web acceptance prerequisites.

**Revision:** 2.1-android-first · **Ngày cập nhật:** 05/11/2026. Chủ dự án cho biết đang dùng CachyOS Linux và có một Android vật lý. CPU/RAM/GPU của máy tính, model/OS/WebView của điện thoại và store accounts chưa được kiểm. Đây là execution profile để áp dụng kế hoạch; không phải báo cáo đã cài hoặc chạy ứng dụng trên máy người dùng.

## 1. Quyết định

Giữ kiến trúc TypeScript, React DOM/Pixi, Vite/Capacitor và server-authoritative. Thực thi web/backend/admin/CI/GitOps và Android trước. iOS là mục tiêu tiếp theo với module N14 conditional; thiếu Mac/iPhone không chặn các task Android. Không đổi sang React Native, Godot hoặc Unity chỉ vì máy phát triển là Linux.

Android Studio cung cấp bản Linux với system requirements cụ thể. CachyOS cần được kiểm ở N00-03/N10-01 về kiến trúc CPU, glibc, RAM/GPU và SDK; không mặc định workstation đã đáp ứng chỉ từ tên distro. [Android Studio](https://developer.android.com/studio/install). Capacitor yêu cầu Android Studio/SDK cho Android; iOS build cần macOS và Xcode, có thể qua môi trường cloud/remote. [Capacitor environment](https://capacitorjs.com/docs/getting-started/environment-setup).

| Công việc | Làm ngay với profile đã nêu? | Giới hạn nghiệm thu |
|---|---|---|
| Monorepo, CI, images, backend, admin, UX web | Có, sau khi đáp ứng toolchain/dependencies | Production capacity/deploy cần server và access thực tế |
| Android APK/AAB build, debug, native auth, lifecycle | Có trên Linux, SDK/JDK/Gradle được pin | Phải có install/test result trên điện thoại thực |
| Android baseline performance | Có trên điện thoại hiện có | Chỉ chứng minh model/OS/WebView/workload đã đo |
| Multiple players, races, queue, server load | Browser contexts + protocol clients/load runner | Một load generator nghẽn không chứng minh giới hạn server |
| Android nhiều screen/API levels | Emulator local/CI nếu resources phù hợp | Không thay OEM GPU/battery/background measurements |
| iOS shared code/design/contracts | Có trên Linux | Chưa chứng minh iOS native correctness |
| iOS archive/sign/simulator | Qua macOS/Xcode local hoặc remote/CI | Không chạy iOS Simulator trực tiếp trên Linux |
| iOS physical QA/TestFlight | Khi có iPhone/testing access và provisioning phù hợp | Cloud build PASS không thay physical-iPhone gate |

## 2. Setup tối thiểu, kiểm đúng lúc

1. **Repo toolchain:** đọc Node/pnpm pins tại HEAD, dùng version manager và frozen lockfile. Giữ Gradle wrapper, Android SDK/build-tools, Java runtime và Capacitor/plugin versions đồng bộ với CI. Không tự đổi dependency pins theo bản package vừa cập nhật trên máy.
2. **Android Studio bản Linux:** dùng nguồn chính thức, SDK Manager và Java runtime tương thích với Android Gradle Plugin đã chọn. Android Studio cung cấp JDK; shell/CI vẫn phải chọn đúng Java version, không vô tình lấy JDK khác trong PATH. [Capacitor environment](https://capacitorjs.com/docs/getting-started/environment-setup).
3. **Điện thoại:** bật Developer options/USB debugging, xác nhận máy tính tin cậy và chạy `adb devices`. Nếu bị permissions, thiết lập udev/access theo distro hiện tại; không copy lệnh Ubuntu/apt vào CachyOS. Android docs mô tả USB/Wi-Fi debugging và `adb devices`. [Hardware device](https://developer.android.com/studio/run/device).
4. **Emulator là bổ sung:** nếu CPU/RAM/virtualization đủ, kiểm `emulator -accel-check` theo SDK path. Linux dùng KVM cho VM acceleration; không yêu cầu phải có emulator mới bắt đầu dùng Android thật. [Acceleration](https://developer.android.com/studio/run/emulator-acceleration).
5. **Local network:** điện thoại có network namespace riêng, nên localhost của app không tự là máy Linux. Dùng staging HTTPS hoặc đường dev network/ADB forwarding được cấu hình rõ; ghi endpoint/ports trong dev runbook. Không mở wildcard Origin, bỏ CSRF hoặc bật insecure network policy cho release build.
6. **Services:** PostgreSQL/API/web chỉ chạy những gì task cần. Máy ít RAM ưu tiên điện thoại thật, browser và một backend; chuyển build/large browser matrix sang CI khi cần. Chưa có cấu hình máy nên chưa cam kết chạy mọi container/emulator đồng thời.

Các lệnh dưới chỉ kiểm môi trường, chưa build mobile app:

~~~sh
node --version
pnpm --version
java -version
adb version
adb devices
~~~

Ghi kết quả thực vào N00-03/N10-01. Các tên `pnpm mobile:*` trong manifest là scripts dự kiến phải implement, không giả định chúng đã tồn tại trong repo.

## 3. Một Android: test cái gì và bằng cách nào

| Lớp kiểm thử | Thiết bị/công cụ | Scenario bắt buộc |
|---|---|---|
| Gameplay và native lifecycle | Điện thoại hiện có | Room thật, auth/refresh/ticket, back/keyboard/safe area/TalkBack, 30 phút chơi, 20 enter/leave, 10 background/resume, kill/restart, mất mạng |
| Hai người chơi | Điện thoại + browser account riêng, hoặc hai isolated browser contexts | Tranh ghế, order/reward retry, block/revoke, travel/queue; không dùng chung một session để giả hai users |
| API/authority/concurrency | Integration harness và clients đúng Socket.IO/contracts của repo | Races, duplicate commands, lost ACK, reconnect storm và last slot |
| Screen/API coverage | Android Emulator local/CI | Screen size, text scaling, OS/API boundary, keyboard/navigation; không lấy FPS emulator làm phone FPS |
| Client versions | Install/update tuần tự trên điện thoại + emulator/integration cho mixed versions | N/N-1 thật khi có; first release ghi previous-release case NOT_APPLICABLE và lưu baseline |
| Usability | Nhiều người mục tiêu thử tuần tự/web/thiết bị riêng | Giữ gate N06-05; một điện thoại sở hữu không đồng nghĩa chỉ cần một người tự thử |
| Capacity server | Load generator tách staging target khi qualification | Workload gameplay thật và topology đo được; PC local test chỉ là baseline, không công bố production CCU |

Mỗi kết quả ghi model, Android version, WebView, app/build/source, room size, network, expected/actual và limitations. Không gọi máy hiện có là support-floor khi chưa biết model. Không có thêm điện thoại vẫn bắt đầu được; trước broad Android release, đối chiếu support claim với emulator matrix và beta feedback/thiết bị bổ sung mượn hoặc dịch vụ phù hợp. Google khuyến nghị real-device testing và emulator cho API/screen khác. [Hardware-device guidance](https://developer.android.com/studio/run/device).

## 4. APK, AAB và Google Play là các mốc khác nhau

N11-01 tạo APK ký để cài trực tiếp và AAB candidate để phân phối qua Play. Build/sign local không cần Play account. AAB không phải file cài bằng `adb install`; dùng APK hoặc `bundletool` sinh/install APK set để thử delivery. Kiểm update trong cùng signing track; APK local ký bằng key khác với Play App Signing không tự cập nhật đè lên bản Play. [Signing](https://developer.android.com/studio/publish/app-signing), [bundletool](https://developer.android.com/tools/bundletool).

N11-04 mới cần Play Console access để chứng minh internal/closed track; tự cài APK không được ghi thành Play beta. Theo chính sách đang tra cứu, personal account tạo sau 13/11/2023 cần closed test ít nhất 12 testers opt-in liên tục 14 ngày trước khi xin production access. Điều kiện account cụ thể phải kiểm lại lúc phát hành; internal testing khác closed testing. Đây là nhu cầu người thử, không có nghĩa chủ dự án phải mua 12 điện thoại. [Google Play testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Không cần store account để hoàn thành shared-client extraction, device spike, native auth hoặc signed local build. Account/tester/actual upload gates không được kéo ngược thành dependency cho toàn bộ platform.

## 5. iOS làm sau nhưng không bỏ khỏi kiến trúc

N14 giữ App Store trong phạm vi. Mặc định module chưa active và task TODO. Khi có macOS/Xcode build access và đường thử iPhone thật, coordinator ghi resource evidence từ N10-01/N00 rồi activate. Có thể dùng macOS runner hoặc máy Mac từ xa; GitHub Actions có hosted macOS runners. Kiểm current runner/Xcode compatibility và quota/cost khi chọn, không tự mua dịch vụ. [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Apple Xcode requirements](https://developer.apple.com/xcode/system-requirements).

Thứ tự N14: resources → native adapters/signing → physical iPhone → compatibility → TestFlight/store dossier. Máy iPhone có thể là máy mượn hoặc của tester; dịch vụ device testing chỉ đủ khi hỗ trợ các thao tác/telemetry cần kiểm. iOS simulator/cloud compile không tự chứng minh energy/thermal/real network behavior. Không cần mua Mac/iPhone để bắt đầu Android; tới iOS phải có quyền tiếp cận các khả năng đó.

Keychain, WKWebView, app lifecycle và native UX được kiểm riêng tại N14. Shared DOM/Pixi/contracts giúp tái sử dụng code nhưng không miễn kiểm thử mỗi platform. Nếu iOS spike fail, tối ưu có giới hạn và đánh giá architecture riêng bằng evidence; không ghi mobile-wide PASS từ Android.

## 6. Compatibility theo platform

`state/task-state.json` giữ ba context fields:

| Field | Ý nghĩa |
|---|---|
| `android_clients_distributed` | Android đã được trao cho tester/user hoặc còn được hỗ trợ |
| `ios_clients_distributed` | iOS đã được trao cho tester/user hoặc còn được hỗ trợ |
| `mobile_clients_distributed` | Aggregate: true nếu một platform true; false nếu cả hai false; null nếu còn unknown và chưa platform nào true |

Cả hai platform false tại baseline; đây không phải xác nhận đã kiểm repository ở thời điểm tương lai. Dev installation do người phát triển kiểm soát để chạy gate khác với binary đã trao cho tester/user. Ngay lần phân phối đầu, cập nhật flag và supported-build inventory/evidence; không chờ task beta VERIFIED. Không reset false trong lúc còn client được hỗ trợ.

N12-01/04/05 yêu cầu N12-03 nếu Android true/unknown và N14-04 nếu iOS true/unknown. Platform chưa phân phối/hỗ trợ ghi NOT_APPLICABLE, không PASS. Module N14 inactive không được dùng để bỏ iOS gate nếu thực tế đã có iOS clients. Before every backend release, cập nhật evidence đúng candidate/protocol/assets/rollback; trạng thái VERIFIED lịch sử không đủ.

## 7. Các bước triển khai ưu tiên

N00 baseline/environment → N01/N02 cleanup/boundaries → N06 UX sớm và N10-01 Android feasibility. Hạ tầng/authority/admin/metrics/queue chạy theo DAG đã có. N10-02/03/04 tạo shared bundle, native auth và Android physical slice; N11 hardening/signing + N12-03 compatibility trước Play beta. N14 là nhánh sau độc lập với N13 scaling.

Không hạ quality gates để hợp thiết bị. Đổi phạm vi gate cho đúng platform đang làm, ghi coverage thực và giữ external prerequisites ở đúng nhánh. Việc cập nhật gói plan không hoàn thành bất kỳ implementation task nào.
