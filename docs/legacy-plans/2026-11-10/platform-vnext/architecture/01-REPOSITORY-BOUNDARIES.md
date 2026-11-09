# Repository, boundaries và cleanup

## 1. Hiện trạng và mục tiêu

Repo tại SHA audit có 4.365 tracked files, tổng kích thước blobs 157.991.008 bytes. `docs/agent/evidence/` chiếm 3.586 files / 151.876.136 bytes, khoảng 96,1% tổng bytes. Đây không phải số đo Git history hoặc filesystem disk usage. `.dockerignore` hiện đã loại docs khỏi build context; vấn đề evidence chủ yếu là checkout, review và tìm kiếm, còn image có vấn đề riêng về source/dev dependencies.

Nền hiện tại có hai apps, 11 package directories và 38 SQL migrations. Tôn trọng code sống, consumers, checksum journals và dependency graph. Không xóa thư mục chỉ vì tên “docs”, “tests”, “reference” hay file `.tar`.

## 2. Bố cục đích

Bảng này là thiết kế đích, không phải yêu cầu scaffold tất cả thư mục rỗng.

| Path | Trách nhiệm |
|---|---|
| `apps/portal-web/` | Next portal, routes, shared game-client mounting |
| `apps/admin-web/` | Operator UI/BFF, auth boundary riêng |
| `apps/mobile/` | Vite + Capacitor Android/iOS shell, native adapters |
| `apps/platform-api/src/modules/` | Identity, social/safety, worlds, rooms, travel, focus, hospitality, events, progression, admission, operations |
| `apps/platform-api/src/entrypoints/` | API, migration và worker composition roots riêng |
| `apps/platform-api/src/db/` | Migrations/journal; một owner cho migration changes |
| `packages/contracts/` | API/socket/domain schemas, versioning, no app imports |
| `packages/client-sdk/` | Client protocol/state/API adapters, no server secrets |
| `packages/game-client/` | Shared React DOM/Pixi game UX, no Next server deps |
| `packages/ui/` | Tokens và primitives dùng chung có nhu cầu thật |
| `packages/world-sdk/` | Public ports/capabilities; không biết DB repositories |
| `packages/pixi-scene/` | Rendering, asset loading, lifecycle, accessible hooks |
| `packages/*-world/` | Giữ world packages hiện tại, không buộc rename đồng loạt |
| `packages/config/` | Shared build config hiện có |
| `infra/docker/` | Build targets cho web/API/admin và .dockerignore tối giản |
| `infra/k8s/base/` | Common app workload/service/manifests |
| `infra/k8s/overlays/staging/`, `production/` | Environment desired state, immutable image digests |
| `infra/argocd/` | Application/bootstrap declarations |
| `infra/compose/` | Dev/local regression, không cạnh tranh với CD production |
| `infra/observability/` | Metrics rules, dashboards và collectors theo gate |
| `tests/` | Contract, integration, E2E, load, deployment, security regression |
| `scripts/` | Build/validation/tooling có ownership rõ |
| `docs/architecture/`, `docs/adr/`, `docs/runbooks/` | Tài liệu đang hiệu lực |
| `docs/plans/platform-vnext/` | Gói kế hoạch và task-state vNext |
| `docs/evidence/index/` | Summaries, hashes, object refs; raw evidence ở artifact storage |
| `integrations/legacy-snapshots/` | Pin fixture nguồn legacy đang được regression dùng |

Không thêm folder top-level `domains/` song song với `apps/platform-api/src/` rồi copy code. Migration sang `src/modules/` làm theo domain, dùng compatibility exports tạm nếu cần; giữ import graph chạy được sau mỗi PR. Nếu move không làm ownership dễ hiểu hơn, giữ path và enforce boundary là đủ.

## 3. Import rules

- Contracts không import apps, domain implementation hoặc renderer.
- World SDK có thể import contracts, không import app/database.
- World packages chỉ dùng SDK/public engine ports, không import source của world khác.
- Client SDK không import Node-only/server packages.
- Game client không import Next server modules, filesystem, DB hoặc server environment.
- Apps là composition roots. API module gọi module khác qua public interface, không bypass repository/private internals.
- Dependency cross-app bị cấm. Admin dùng contracts/API, không import API source.
- Worker bootstrap không dựng RoomAuthority hoặc mount sockets.

Giữ `scripts/check-boundaries.mjs` và regression hiện có; mở rộng theo paths thực sự đã tạo. Pin package/runtime hiện tại trước khi refactor; upgrade dependency là PR riêng với lý do rõ.

## 4. Cleanup matrix

| Nhóm file | Hành động | Gate trước khi bỏ khỏi current tree |
|---|---|---|
| Source/test/migration/contracts/config đang dùng | Giữ và tổ chức theo ownership | Import/build/contracts tương đương |
| Raw logs, screenshots, exit markers lặp | Archive immutable, thay bằng index nhỏ | Hash inventory, private access, restore sample + full manifest coverage |
| JSON evidence được verifier đọc | Giữ summary hoặc đổi loader sang indexed evidence | Consumer regression qua đường mới; không đổi expected để che lỗi |
| Checkpoint docs cũ | Giữ lịch sử có date/SHA; current summary rõ | Link redirect/update, không trộn trạng thái cũ/mới |
| Legacy .tar/manifests | Giữ cho test hoặc chuyển artifact có pin | `legacy:check`, `legacy:prepare`, baseline tests chạy không phụ thuộc thư mục máy cũ |
| Generated runtime builds/cache | Ignore và tạo từ scripts | Clean checkout build thành công |
| Production assets/provenance | Giữ source hoặc content-addressed storage | Reproducible build, ownership/license và byte checksum |
| True dead code | Xóa từng nhóm nhỏ | Không còn import/runtime discovery/config reference; tests liên quan |
| Lockfiles/SQL journal/ADR | Giữ | Không “dọn đẹp” bằng xóa lịch sử quyết định hoặc migration |

Artifact retention ngắn của CI chỉ dùng cho run tạm. Long-term acceptance records cần nơi private bền vững đã chọn (ví dụ object storage hiện có); encrypted archive ngoài host cần thiết nếu là bản giữ duy nhất. Không upload raw evidence có token/PII; sanitize hoặc giữ restricted theo retention trước archive.

## 5. Lộ trình cleanup 5 PR

1. Inventory tree và consumers; ghi classification + source SHA + hash.
2. Tạo evidence-index schema/loader, archive thử và test restore.
3. Chuyển validators/release/ops-watch sang index; CI vẫn có mọi gate cũ.
4. Bỏ raw outputs đã archive khỏi current tree, update ignore/link; không rewrite Git history.
5. Consolidate current docs và move modules từng domain; check clean checkout.

Xóa file trong commit mới không làm Git history tự nhẹ đi. History rewrite/gc ảnh hưởng clone và lịch sử nên không thuộc cleanup mặc định; chỉ xem xét nếu người sở hữu thực sự yêu cầu sau khi có archive.

## 6. Source-of-truth của tài liệu

Current architecture/acceptance summary phải có `asOfCommit`, `verifiedBy`, `evidenceRefs`, `knownGaps`. Tài liệu lịch sử giữ heading “Historical checkpoint at …”. Root README dẫn tới current index; agent không phải suy đoán giữa hàng trăm ADR và handoff.

Root old plan vẫn tồn tại để giữ traceability. Sau khi vNext tích hợp, root master thêm link scope đang active; `docs/agent/task-state.json` cũ không bị đổi trạng thái vì task Nxx chưa làm.

## 7. Definition of done

- Clean checkout build được với versions đã pin; không phụ thuộc artifact ẩn trong máy tác giả.
- All evidence references resolve; thiếu artifact không bị coi là passed.
- Migrations và legacy fixtures có checksum còn nguyên.
- UI/runtime bundles không chứa source/tests/docs/dev dependencies không cần thiết theo image inspection.
- Không giảm test/gate coverage trong PR cleanup.
- Diff dọn repo tách khỏi thay đổi behavior để rollback từng phần.
- Current tree nhẹ và dễ tìm; Git history không bị viết lại.

