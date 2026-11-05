# Plan helpers

`node tools/validate-plan.mjs` xác minh unique IDs, dependencies/DAG, module files, state/evidence references và relative links trong gói. `node tools/next-task.mjs` liệt kê tasks TODO có dependencies VERIFIED và module ACTIVE.

Hai helpers chỉ đọc file. Chúng không chạy pnpm, Docker, kubectl, GitHub writes hoặc thay task-state. PASS của helper chỉ chứng minh cấu trúc plan nhất quán; không chứng minh ứng dụng hoặc acceptance thực tế.

Runtime statuses chỉ ở `state/task-state.json`; manifest chứa immutable initial_status. Khi VERIFIED, thêm record evidence thật theo [schema](../contracts/EVIDENCE.schema.json), cập nhật index/state và handoff. N13 cần capacity trigger evidence; N14 cần macOS/iPhone access evidence trước ACTIVE. Platform context android/ios được validate cùng aggregate mobile; N12 release gates dùng từng platform. Helper không biết được thiết bị thực hay installed-client inventory bên ngoài, nên coordinator phải đối chiếu distribution/support records thật và không reset false để né gate. DEFERRED_APPROVED không tự thỏa dependency.


Conditional gates đọc runtime_context: khi mobile đã phân phối hoặc UNKNOWN, N12-01/04/05 cần N12-03 VERIFIED. Context false chỉ hợp lệ trước khi có supported/distributed mobile; first beta upload đặt true. Helper không tự xác minh source/application semantics hoặc evidence freshness từ bên ngoài. Coordinator phải revalidate SHA/digests và re-run affected gates khi source thay đổi.
