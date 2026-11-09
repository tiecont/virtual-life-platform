# 07 — Animals 3D, lông chi tiết và phát triển bằng Android Emulator

> Scheduling update: [revision 2.4](../REVISION-2.4-WEB-FIRST.md) makes web/server first. Preserve this design/budgets/evidence; native physical/build/AVD scenarios move to deferred N10-06/N10-04/N11/N14. They are not web acceptance prerequisites.

**Owner update 2026-11-06:** đổi hướng pixel/2D sang nhân vật và thế giới **3D có hoạt ảnh**, lông động vật chi tiết, UI đẹp và cảm giác chơi game cho **cả web và mobile**. Owner cho phép tự chạy máy ảo để tiếp tục phát triển. Yêu cầu này thay hướng cozy2D/2.5D trong brief06; không phải duyệt một mẫu art cụ thể hoặc khẳng định renderer mới đã được triển khai.

N06-06 design SVG, N06-03 shell, N06-08 landscape và N10-02 preview giữ VERIFIED trong scope/revision cũ. Chúng không chứng minh chất lượng 3D, lông, animation hoặc game mới. Evidence/SQL/profile cũ không bị reset; baseline Pixi được giữ làm rollback và compatibility trong khi renderer3D được kiểm chứng riêng.

## Hình ảnh và hành trình đích

- Cảnh 3D thực, camera có chiều sâu, nhân vật có volume, ánh sáng và bóng tiếp xúc; không gọi sprite phóng lớn, ảnh render tĩnh, CSS perspective hoặc mô hình ghép khối tạm là final3D.
- Animals có anatomy/silhouette dễ nhận, mắt ướt có chiều sâu, mõm/tai/đuôi/biểu cảm và trang phục có chất liệu. Lông có hướng mọc, độ dài/mật độ/hoa văn, vùng chuyển tiếp mặt–tai–thân, silhouette mềm và đáp ứng ánh sáng. Không thay toàn bộ chi tiết bằng tint màu hoặc một lớp noise.
- Starter cat/dog/rabbit có rig tương thích, idle/breath/blink/walk/turn/sit/serve và chuyển tiếp có root-motion policy. Gắn tay vào đồ phục vụ và thân/đuôi vào ghế bằng anchors; không xuyên áo, ghế hoặc phụ kiện ở các tổ hợp hỗ trợ.
- Creator dùng cùng model/rig/material/catalog với world và thumbnail: chọn từng bộ phận, preview xoay/zoom, preset/reset/Save/Cancel. Close-up phải thấy chi tiết lông; gameplay phải giữ silhouette/readability ở camera thực. Preview không cấp entitlement hoặc ghi profile.
- UI gameplay ngang có scene làm trung tâm, typography có hierarchy, icon/illustration nhất quán, motion phản hồi hành động, panel ngắn theo ngữ cảnh. Gỡ cảm giác trang form kiểm chứng; đưa thông tin kỹ thuật vào admin. Touch/keyboard, portrait recovery, report/block/leave vẫn có DOM controls rõ ràng.
- Deadline: không gian focus ấm, chiều sâu ánh sáng và góc ngồi. Maid: quầy/phục vụ có hoạt ảnh, props và phản hồi tương tác. Lodge: bàn chơi/nhân vật ánh đèn có chiều sâu, hand/board/timer luôn rõ. Hoàn thiện một phòng và một nhân vật chất lượng trước khi nhân rộng.

## Kiến trúc và pipeline cần kiểm chứng

Giữ React DOM/Next/Vite/Capacitor, identity, authoritative room/travel và DB hiện hữu. Renderer3D là adapter qua port đã audit, không đưa Three/engine vào contracts hoặc server. Server vẫn sở hữu tọa độ/seat/intent; ánh xạ floor/camera3D không đổi hitbox/physics/rules hoặc tạo owner thứ hai. Không chuyển cả repo sang engine/ORM mới chỉ vì đổi art direction.

N06-10 audit source và lập ADR/spike brief. **Three.js WebGL2 + glTF2** là ứng viên ban đầu để so sánh với closure/budgets hiện hữu; chưa là quyết định engine đã benchmark. [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) yêu cầu WebGL2; cần feature detection/context-loss recovery/DOM fallback trên target WebView, không tuyên bố mọi điện thoại hỗ trợ. [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) hỗ trợ model/animation và các extension compression; loader/decoder chỉ tải asset allowlist/version/hash, không arbitrary URL trong appearance.

Pipeline đề xuất: authoring mesh/sculpt/groom → retopology/UV → skin weights/blendshapes → PBR textures/normal/roughness + groom cards → glTF/GLB export → validate bones/material/animation/texture/color-space → compress/cache có revision → shared composer. Dùng provenance riêng cho mesh, groom, texture, animation và environment; không tự nhận license asset bên thứ ba hoặc dùng nhân vật game khác.

Lông phải có LOD: close-up creator dùng groom cards/anisotropic shading/normal detail; gameplay giảm mật độ/cards và texture sampling, xa dùng silhouette/normal/material phù hợp. Shell/fins là ứng viên so sánh nếu có đo overdraw thực. Không yêu cầu hàng triệu simulated strands trên Android; chất lượng giảm có kiểm soát và cùng appearance, không âm thầm quay về pixel hoặc xóa lựa chọn. Số triangles/bones/cards/draw calls/texture memory, shadow/postprocessing và compressed download phải được khóa **trước đo** ở N06-10. Không tăng ngưỡng `docs/mobile/android-spike.json` sau failure. Những con số đề xuất không thành kết quả đạt.

N06-11 triển khai một technical vertical slice: nhân vật rigged có lông + một góc phòng + tương tác/camera thật qua rendererport, quality tiers, disposal/cache/context recovery. Assets tạm phải có nhãn, không đóng N06-09 bằng prototype thô. Chỉ promote renderer vào N06-07/04 sau browser + Android packaged WebView evidence; ưu tiên chứng minh hình ảnh và frame-time trước khi thay tất cả world.

## Máy ảo và giới hạn bằng chứng

N10-05 tạo Android Emulator AVD riêng, SDK/system-image/version được pin, KVM và GPU thực được ghi. Trên host này đã đọc được KVM API12 (Ryzen7 4800HS,22GiB RAM,25GiB trống tại preflight); chưa có emulator binary/image tại lúc ghi. Có KVM không chứng minh emulator đã boot hoặc app đã chạy.

AVD đặt trong private artifacts, user data riêng và có RAM/CPU/disk budget. Chỉ điều khiển serial emulator được tạo cho task; không thay lựa chọn USB mặc định trong physical smoke và không chạm dữ liệu/keys thiết bị chủ. Kiểm boot, installed APK hash, bundled WebView/canvas, navigation/rotation/keyboard/Back/resume thực; lưu thất bại và tắt process thuộc task sau kiểm chứng. Host không đủ tài nguyên thì ghi blocker, không dọn dữ liệu owner hoặc tự đổi BIOS/kernel/global settings.

[Android acceleration](https://developer.android.com/studio/run/emulator-acceleration) phân biệt CPU/KVM và GPU. GPU software fallback của emulator phải được ghi, không dùng FPS emulator làm physical GPU/thermal/battery proof. N10-04 vẫn cần Android thật30phút/20enterleave/10background cùng build3D tích hợp. Linux Android Emulator không cung cấp iOS Simulator; Mac/Xcode/iPhone/N14 vẫn thiếu. Android Emulator cũng không thành Play-distribution/support-floor hoặc iOS evidence.

## DAG và Definition of done

| Task | Outcome | Dependencies |
|---|---|---|
| N10-05 | Android Emulator có lifecycle/scripts và actual APK checks | N10-02; không thay N10-04 |
| N06-10 | Brief3D/fur/rig/UI, pipeline/provenance, audit rendererport và locked budgets | N06-06,N06-08; giữ design cũ lịch sử |
| N06-11 | Shared renderer3D + rig/fur/room technical slice, real browser/AVD/physical qualification đúng scope | N06-10,N10-05,N06-08 |
| N06-07 | Creator3D từng bộ phận, authoritative Save và v1 projection | thêm N06-11; vẫn N10-03 native auth |
| N06-04 | Deadline/Maid3D hoàn chỉnh và UI gameplay được polish | N06-07,N06-08 giữ nguyên |
| N06-09 | Visual/animation/fur/performance qualification web + mobile3D | thêm N06-11, không tái dùng pixel proof |
| N06-05,N10-04,N15-05,N19-04 | Usability/physical/Lodge trên cùng build3D | giữ task-specific dependencies và human/platform gates |

N06-09 rubric bắt buộc thêm: anatomy/silhouette; groom direction/length/seams/LOD shimmer; PBR/color-space/eyes; animation transitions/foot sliding/cloth clipping; room lighting/shadows/camera; HUD visual hierarchy/readability; creator→world fidelity. Ảnh/video phải từ runtime3D tương tác thật, đủ close-up/gameplay/mobile-low/high, có source/asset/renderer revision. Owner nhận xét chất lượng là evidence riêng; automatic test PASS không đồng nghĩa owner đã thấy đẹp.

Các tên command3D/emulator trong module plans là **planned** cho đến khi implementation tồn tại và được chạy thực. Không công khai deployment/store hoặc mua media/cloud tài nguyên từ quyền phát triển này.
