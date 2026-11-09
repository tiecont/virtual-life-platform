# Virtual Life Platform — Architecture & Agent Plan vNext 2.2

> Current owner policy (2026-11-09): **web/server/platform first; native mobile deferred**. See [revision 2.4](REVISION-2.4-WEB-FIRST.md). Physical devices/APK/AVD/store work do not block web features. Responsive browser quality and supported-client compatibility gates remain. Earlier Android-first wording below is historical where not explicitly revised.

**Ngày rà soát:** 05/11/2026 · **Múi giờ báo cáo:** Asia/Saigon  
**Repository:** https://github.com/tiecont/virtual-life-platform  
**Snapshot được đọc:** `cef7dc17172f7c6cda930c99648a5e3ad609cc55`  
**Trạng thái tại generation:** thiết kế, chưa implementation. **Hiện hành:** xem state/handoff; bản cập nhật 2.2 là yêu cầu sản phẩm bổ sung, chưa triển khai graphics mới.

## Execution profile mới

CachyOS Linux: web/server/platform được build/test trước; N10/N11/N12-03/N14 native mobile deferred theo owner. Web không chờ APK, emulator, Android vật lý hoặc Mac/iPhone. Đọc [05-CACHYOS-ANDROID-FIRST.md](architecture/05-CACHYOS-ANDROID-FIRST.md) và [thay đổi 2.1](REVISION-2.1.md). Bản gốc có 15 modules / 69 tasks. Owner update 2026-11-06 thêm [animal/landscape visual direction](architecture/06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md) và N06-06..09, tổng 73 tasks. Bốn task mới TODO; trạng thái implementation hiện hành đọc [task state](state/task-state.json), không dùng snapshot lúc tạo gói.

## Kết luận

Giữ nền tảng TypeScript / pnpm / Next.js / React / Pixi / Nest-Fastify / Socket.IO / PostgreSQL đang có. Tổ chức backend thành modular monolith, tách bản build web/API/admin; triển khai bằng ArgoCD theo manifest ngay trong cùng repository. Ưu tiên trải nghiệm chơi có chiều sâu, quyền quyết định ở server, admin vận hành thực tế và mobile dùng chung game client. Chỉ tách room runtime hoặc thêm Redis khi số đo chứng minh cần.

Đây là phần tiếp theo của bộ Virtual City 25 module bạn cung cấp, không phải một dự án mới. Không reset 151 task cũ và không dùng checklist lịch sử để chứng minh chất lượng của thay đổi mới.

## Đọc theo thứ tự

1. [MASTER-AGENT-PLAN.md](MASTER-AGENT-PLAN.md): điều phối, phạm vi, quality gates và cách tiếp tục.
2. [audit/REPOSITORY-REVIEW.md](audit/REPOSITORY-REVIEW.md): những gì đã quan sát, những gì là bằng chứng lịch sử, khoảng trống.
3. [architecture/00-PLATFORM-ARCHITECTURE.md](architecture/00-PLATFORM-ARCHITECTURE.md): kiến trúc toàn platform và quyết định đánh đổi.
4. [architecture/01-REPOSITORY-BOUNDARIES.md](architecture/01-REPOSITORY-BOUNDARIES.md): cấu trúc thư mục, ownership, cleanup an toàn.
5. [architecture/02-CI-CD-ARGOCD.md](architecture/02-CI-CD-ARGOCD.md): image, CI, GitOps, migration và deployment regression.
6. [architecture/03-RUNTIME-ADMIN-CAPACITY.md](architecture/03-RUNTIME-ADMIN-CAPACITY.md): authority, admin, metrics, load test và queue.
7. [architecture/04-UX-MOBILE.md](architecture/04-UX-MOBILE.md): trải nghiệm sản phẩm và quyết định mobile.
8. [EXECUTION-BOARD.md](EXECUTION-BOARD.md), [PLAN-MANIFEST.json](PLAN-MANIFEST.json), [plans/](plans/): công việc cụ thể.
9. [QUALITY-GATES.md](QUALITY-GATES.md), [contracts/CONTRACT-REGISTRY.md](contracts/CONTRACT-REGISTRY.md), [adr/DECISION-REGISTER.md](adr/DECISION-REGISTER.md): điều kiện nghiệm thu và hợp đồng.

## Đưa vào repository

Giải nén rồi copy **nội dung** thư mục `VIRTUAL-LIFE-PLATFORM-NEXT-PLAN/` vào `docs/plans/platform-vnext/`. Merge nội dung [AGENTS-ADDENDUM.md](AGENTS-ADDENDUM.md) vào hướng dẫn hiện hữu; không chép đè root `AGENTS.md`, root `MASTER-AGENT-PLAN.md`, `PLAN-MANIFEST.json`, `docs/agent/task-state.json` hay các ADR cũ. Thêm link đến master vNext từ root master/README bằng một PR riêng.

Kế hoạch cũ đã nói mobile native và Kubernetes ngoài MVP; yêu cầu mới của chủ dự án mở thêm đúng hai phạm vi này. Handoff “offline tasks exhausted” là checkpoint cũ, không chặn công việc vNext được yêu cầu. Quyền truy cập và cho phép release production vẫn phải có ở thời điểm thao tác thật.

## Prompt bắt đầu

> Read `docs/plans/platform-vnext/MASTER-AGENT-PLAN.md` completely, then the current repository AGENTS.md and both historical/current handoffs. Execute the next dependency-ready vNext task. Preserve existing behavior and evidence, implement one reviewable vertical slice, run the applicable verification, update vNext state and exact next action. Treat proposed scripts as work to implement, never as tests already run. Continue through unblocked work within the authorized scope.

## Kiểm tra tính toàn vẹn gói plan

Từ thư mục gói:

~~~sh
node tools/validate-plan.mjs
node tools/next-task.mjs
~~~

Hoặc từ repository sau khi tích hợp:

~~~sh
node docs/plans/platform-vnext/tools/validate-plan.mjs
node docs/plans/platform-vnext/tools/next-task.mjs
~~~

Các script trên kiểm tra kế hoạch và liệt kê task sẵn sàng. Chúng không triển khai hoặc sửa ứng dụng. [state/PROGRESS.md](state/PROGRESS.md) và [state/HANDOFF.md](state/HANDOFF.md) ghi tình trạng ban đầu trung thực.

## Giới hạn của lần rà soát này

Đã đọc cây file và các source trọng yếu qua GitHub, đối chiếu ZIP, kiểm tra ảnh bằng chứng đã commit và trạng thái hosted CI được ghi trong audit. Không chạy lại toàn bộ app/test/load benchmark trên server của bạn. Số CCU, thời gian xử lý, retention và chất lượng mobile phải được đo theo các gate trong gói này. Các ảnh lịch sử không phải phiên chạy UI mới.

## Tài liệu nguồn

Từng chapter có đường dẫn nguồn gốc. [SOURCES.md](SOURCES.md) tập hợp tài liệu kỹ thuật chính thức và quy tắc đọc bằng chứng.
