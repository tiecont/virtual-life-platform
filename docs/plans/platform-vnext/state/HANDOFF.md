# Owner product direction update — 2026-11-06

Owner yêu cầu gameplay ngang, thế giới animals, tạo nhân vật theo từng bộ phận và ưu tiên đồ họa. [Đặc tả](../architecture/06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md) bổ sung N06-06..09 TODO; tổng73tasks, trạng thái cũ và44evidence records giữ nguyên. Đây là planning update, không phải visual/gameplay verification. N15-05 Phase2 thêm upstream N06-09; Phase2 vẫn đợi checkpoint/handoff thật.

N10-02 đang IN_PROGRESS: debug APK thực đã build/install tại source375125a, nhưng smoke preview sau hai scenario PASS phát hiện native Back từ fallback chưa về scene (`artifacts/mobile-preview-phone-f683ed11`); chưa VERIFIED. Các log/harness thất bại được giữ private. Không lấy thay đổi plan này làm acceptance cho native build.

**Next exact action:** hoàn tất N10-02: đưa native Back listener ra lifetime của room và gắn tại mobile Shell, giữ app-state listener theo room; commit slice, build APK mới, inspect asset/signature, update install trên Android đã authorized và rerun implemented mobile:preview:smoke. Chỉ VERIFIED sau evidence actual đủ; rồi N06-06 là task thiết kế dependency-ready ưu tiên80 trước N06-03 mới. N10-04 30min, native auth và N14 vẫn là gates riêng. Giữ file dirty package.json/scripts/mobile-preview-smoke.py của việc đang làm.

## Earlier handoff — historical

# Android USB connected; continue N10-02 native preparation

Owner replugged and approved RSA. Verified isolated ADB now sees one actual USB device in state device: Xiaomi23129RAA4G,Android15/API35,WebView156.0.8078.47. N10-02 USB/resource blocker cleared; task resumes IN_PROGRESS. This is not build/install/app/native/spike acceptance. Application source/44SQL and prior43evidence records unchanged; no private serial or ADB key committed.

[Connection evidence](../audit/N10-02-USB-CHECKS.json). The existing shared-client qualification remains at87ecc81/merged1bfd58a:87governance357unit,118browser executions,3local bundle cases and6web/API TLS scenarios. N09-02 remains VERIFIED with its source-bound PostgreSQL evidence.

## Next exact action

Continue N10-02 on the now-authorized Xiaomi23129RAA4G Android15/API35 phone. Use the verified isolated ADB under artifacts/vnext/n10-02/usb-connection/tools/root/usr/bin/adb. Prepare/lock JDK21 and SDK36/build-tools, run pnpm mobile:sync:android and actual Gradle assembleDebug, then install/run the local bundled preview on this device and record source/build/navigation/lifecycle evidence before VERIFIED. Do not repeat USB/RSA approval while this authorization remains valid. Native auth/N06-03/N14 gates remain separate.

## Remaining gates

JDK/SDK/native build/install/run are still pending. N04-02 actual App/hosted candidate and N07-04 actual staging scrape remain BLOCKED_EXTERNAL. N14 remains conditional/fiveTODO without Mac/Xcode/iPhone. Distribution flagsfalse/release NOT_REQUESTED and historical151Mxx unchanged. Raw logs private local; connection probe is finished, no background agent work promised.
