# Lodge — owner3D visual update, 2026-11-06

Owner đổi pixel/2D sang animals3D có hoạt ảnh/lông chi tiết, UI đẹp cho web và mobile; cho phép Android Emulator để phát triển. Hướng3D hiện hành ở `docs/plans/platform-vnext/architecture/07-3D-FUR-AND-EMULATOR.md` thay hướng2D trong brief08. Đây là planning đồng bộ của Phase1 coordinator;25tasks Phase2 và activation/handoff gate giữ nguyên.

N15-05 và N16/17/18 UI dùng shared3D composer/appearance/rig/material/camera/landscape shell đã được N06-09 kiểm chứng (gồm upstream N06-11). Không tạo avatar, renderer hoặc auth riêng. Cảnh hội quán/bàn chơi có ánh sáng, chất liệu và animation3D cùng chất lượng Deadline/Maid; anatomy/fur/LOD/sit/serve không xuyên ghế/phụ kiện. Bài/board/hand/role/deadline giữ server-authoritative projection; hidden state không leak qua mesh, animation, asset IDs hoặc accessibility tree.

N19-04 cần APK3D Android thật theo budgets và source/asset/GPU evidence; máy ảo chỉ bổ sung screen/API/lifecycle coverage. N19-05 giữ human pilot/owner art review riêng. Quyền dùng animal theme không cấp license artwork/mesh/groom/animation của game khác; ghi provenance thật và không nhận prototype thô hoặc ảnh concept là runtime acceptance. N14 iOS vẫn conditional.
