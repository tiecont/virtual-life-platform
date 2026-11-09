# CI/CD, image registry và Argo CD

**Trạng thái:** thiết kế đề xuất cho giai đoạn tiếp theo, dựa trên source tại commit `cef7dc17172f7c6cda930c99648a5e3ad609cc55`, ngày 05/11/2026. Các image, manifest Kubernetes, entrypoint worker và gate mới dưới đây **chưa được triển khai hoặc kiểm thử** trong lượt lập kế hoạch này.

## 1. Quyết định kiến trúc

Giữ một pnpm monorepo, một lockfile và các package nội bộ hiện có. Đơn vị build/deploy là ứng dụng chạy độc lập, không phải từng thư mục hay từng world. Registry đề xuất là GHCR; cùng một registry chứa ba image ứng dụng runtime và artifact kiểm thử riêng khi tới phase tương ứng:

| Artifact | Nội dung và trách nhiệm | Trạng thái |
|---|---|---|
| `ghcr.io/tiecont/vlp-web` | Portal, game shell, scene assets; production build của web | Tách từ source web hiện hữu |
| `ghcr.io/tiecont/vlp-api` | API, authoritative realtime, domain services và migrations | Tách runtime hiện hữu |
| `ghcr.io/tiecont/vlp-admin` | Giao diện quản trị; deploy độc lập với giao diện người chơi | Chỉ thêm khi có source admin |
| Migration Job | Dùng đúng digest `vlp-api`, entrypoint migration riêng | Không tạo image từ source khác |
| Worker | Dùng đúng digest `vlp-api`, entrypoint worker riêng | Chỉ chạy các job đã được tách ownership |
| `ghcr.io/tiecont/vlp-load-runner` | Load generator và Socket.IO test harness, chỉ chạy transient staging Job | Artifact kiểm thử dự kiến ở N08, không phải runtime service |

Không đưa dev dependencies hoặc load harness vào hardened API runtime để chạy benchmark; test-runner image có lifecycle, quyền và budget riêng.

Worker **không khởi tạo RoomAuthority**, không mở gameplay socket và không tự ghi vào room state trong RAM. Các tác vụ như outbox, cleanup hoặc tổng hợp số liệu phải có idempotency, locking và retry riêng trước khi chạy worker. Không tách worker bằng cách khởi động thêm một bản API nguyên trạng.

Mỗi môi trường có một Argo Application, dùng Kustomize:

| Đường dẫn dự kiến | Vai trò |
|---|---|
| `infra/k8s/base/` | Deployment, Service, config references, migration/smoke Job, network policy chung |
| `infra/k8s/overlays/staging/` | Release set và cấu hình staging |
| `infra/k8s/overlays/production/` | Release set đã qua staging, cấu hình production |
| `infra/argocd/` | Bootstrap AppProject/Application và hướng dẫn kết nối |
| `infra/docker/` | Các build target/runtime image |

Database, dữ liệu bền vững và secrets là **prerequisites ngoài lifecycle của application**. Sync/prune ứng dụng không được xóa database, volume hay khóa giải mã. Không cần custom reconciler hoặc image updater: Argo CD thực hiện reconciliation của Git desired state; CI chịu trách nhiệm đưa digest đã kiểm chứng vào Git.

## 2. Base đang có và phần cần thay đổi

Repo đã có nền đáng giữ: workflow quality với actions pin SHA, quyền đọc tối thiểu, browser matrix và aggregate gate; migrations có checksum journal/advisory lock; API có readiness và bounded shutdown. Security focused lane là tập con của integration tests nên vẫn được chạy trong integration gate.[R1][R2][R3]

Các khoảng trống cụ thể:

- Dockerfile hiện build toàn workspace và runtime kế thừa build stage; API/web/migrator cùng dùng `CITY_APP_IMAGE`. Cần image production riêng, chỉ copy output/dependencies cần thiết.[R4]
- Chưa có manifest Kubernetes/Argo hoặc job publish GHCR trong snapshot đã kiểm tra.
- Authority hiện chỉ cho một API process trên một DB schema. Readiness yêu cầu migration manifest bằng chính xác, nên chưa hỗ trợ rollout hai phiên bản cùng hoạt động.[R5]
- Governance/release checks hiện assert phạm vi offline, mọi world OFF và các vận hành thật chưa có. Cần chuyển sang policy theo environment/release có bằng chứng; không sửa vài boolean hoặc xóa test để “deploy được”.[R6]
- Recovery harness hiện kiểm rollback API có migration manifest tương thích trong khi web giữ nguyên. Đó chưa phải bằng chứng rollback toàn release set hoặc tương thích mobile cũ.[R7]

Trạng thái hosted CI phải được ghi bằng run ID, commit và kết quả thật khi triển khai task. Một workflow tồn tại hoặc evidence offline được commit không thay cho hosted run thành công.

## 3. Hợp đồng build và release set

### 3.1 Build all trước, tối ưu theo số liệu sau

Ban đầu build tất cả deliverable có source khi code/build dependency thay đổi. Với quy mô hiện tại, cách này giảm nguy cơ bỏ sót consumer của shared contract, lockfile hoặc config. Chỉ thêm affected-build graph khi thời gian CI trở thành vấn đề được đo. Tối ưu đó phải có test chứng minh shared change rebuild đúng ứng dụng.

Mỗi image dùng multi-stage build thật: stage compile riêng, runtime production riêng; nonroot, read-only filesystem khi phù hợp và writable cache được chỉ định. API image chứa SQL migrations và runtime config/schema cần thiết. Web dùng standalone output hoặc phương án tương đương đã kiểm với pnpm workspace tracing. Không suy ra standalone sẽ hoạt động chỉ từ một cấu hình Next.js.

Build không chứa secrets, fixture credentials, evidence, plan hay công cụ phát triển không cần cho runtime. Pin toolchain/base image sau khi kiểm version thực tế; thay đổi version là task riêng nếu chưa cần cho mục tiêu build split.

### 3.2 Một lần build, nhiều môi trường

CI tạo một **release set** gồm:

- Source commit và release ID.
- Digest API/web/admin đang được phát hành; admin vắng mặt khi chưa có.
- API/protocol compatibility, migration manifest và schema compatibility contract.
- Asset manifest/version và minimum client version nếu release yêu cầu.
- CI run IDs, container smoke/contract results, vulnerability/provenance report.
- Capacity profile áp dụng và rollback compatibility đã kiểm.

Tag commit SHA giúp tra cứu; deploy bằng `image@sha256:...`. Staging và production dùng **cùng digest đã kiểm thử**, không rebuild với secrets/environment khác. Runtime configuration được inject khi chạy; biến buộc phải compile vào web phải có thiết kế rõ để không phá nguyên tắc promotion.

GHCR hỗ trợ image OCI gắn với repository. Publishing trong GitHub Actions dùng `GITHUB_TOKEN` với quyền package phù hợp; registry credential trên server chỉ cần quyền pull và được quản lý ngoài Git.[S1]

## 4. CI và promotion trong cùng repo

### 4.1 Luồng chuẩn

1. PR source chạy quality, unit/integration, contract, browser và kiểm build/container liên quan.
2. Sau merge `main` theo enforcement profile đã xác minh, CI publish từ đúng source SHA đã qua required gates.
3. Bot tạo promotion PR sửa release set/digest của staging trong cùng repo.
4. Promotion PR kiểm Kustomize render, policy, image existence và provenance của đúng digest; không chấp nhận metadata “PASS” tự viết.
5. Merge staging → Argo auto-sync → migration, readiness và PostSync verification.
6. Khi staging có evidence đủ, tạo PR production promote nguyên release set.
7. Người sở hữu xem diff, kết quả staging, capacity/rollback rồi merge production PR.
8. Argo production sync desired state; ghi deployment outcome và tiếp tục quan sát.

**Merge production PR là release gate cụ thể.** Việc lập kiến trúc, viết source, build và chạy kiểm thử cô lập không cần chờ bước này. Gói kế hoạch hiện tại không thực hiện public deployment.

### 4.2 Trust boundary

Giữ PR quality read-only, không production credentials, không `pull_request_target` để chạy code PR. Job publishing chỉ chạy trong ngữ cảnh trusted `main` sau gate thành công, có quyền `packages:write` riêng. Nếu tách workflow, kiểm workflow nguồn, event, repository, branch và source SHA trước khi dùng artifacts; không tiêu thụ output từ untrusted PR để publish.

Promotion bot dùng **GitHub App riêng, quyền tối thiểu** cho repository contents/pull requests. Workflow có allowlist đường dẫn overlay/release metadata; khi branch protection/rulesets khả dụng, required checks phải chặn merge thiếu kết quả. Token không mang quyền server hoặc quyền production Kubernetes. Không cấp toàn quyền repo/server cho admin app.

**Enforcement preflight:** snapshot chỉ cho thấy `protected:false`, còn rulesets API trả403; chưa có bằng chứng cơ chế chặn merge đã được bật. N03-04/N04-02 phải xác minh tính năng và policy thật. Nếu không khả dụng hoặc không đọc được, ghi hạn chế, tắt auto-merge/production auto-promotion, dùng owner promotion kiểm đúng source SHA, hosted checks và artifact digests. Quy trình này không được mô tả là technical branch protection. Không tự đổi repo thành public hoặc mua gói. Local event fixtures kiểm logic workflow, không thay hosted CI evidence của bot PR.

Current verifier của workflow đang rất chặt và có điều kiện theo phạm vi offline. Khi thêm trusted publishing/promotion, sửa verifier theo trust boundary thực tế; không nới chung mọi job chỉ để pattern check hết báo lỗi.

### 4.3 Không tạo vòng lặp build

Deploy-only commit chạy manifest/release gate, không rebuild images. Source/build changes mới mở publish lane. Required check luôn xuất hiện: condition các job không liên quan, không dùng `[skip ci]` hoặc skip toàn required workflow. Aggregate gate phải hiểu tập job bắt buộc theo loại change và fail với job bị skip ngoài kế hoạch.

GitHub cảnh báo workflow bị skip bởi path/branch filter hoặc commit message có thể giữ required check ở trạng thái Pending. Vì vậy việc tối ưu cần nằm trong job graph đã kiểm.[S2]

GitHub App được chọn cho promotion PR để CI hoạt động rõ ràng. Không dựa vào giả định `GITHUB_TOKEN` luôn trigger workflow tiếp theo: tài liệu hiện nêu các PR event nhất định tạo runs cần approval, còn nhiều event khác không trigger thêm run.[S3]

## 5. Argo CD và bootstrap

Application trỏ vào `main` và đúng overlay environment. Argo không render source root như thư mục manifests. Kustomize render phải deterministic và được kiểm trước merge; rollout không tải chart/script tùy ý chưa pin.

Native reconciliation của Argo vẫn là cơ chế CD. Webhook giúp refresh nhanh, polling làm fallback. Không có nhu cầu duy trì một hệ thống reconcile riêng giữa nhiều repo/package. Auto-sync với self-heal phù hợp cho workloads trong ownership của Application; prune chỉ bật sau khi test ranh giới dữ liệu và preview deletion.[S4][S5]

Trước lần sync đầu phải có namespace, DB connectivity, image-pull credential, session/encryption secrets, ingress/TLS và service accounts cần thiết. Sử dụng secret management sẵn có trên server nếu phù hợp; không mặc định thêm một hệ thống mới. Không commit secret rõ vào manifest.

**Caveat bootstrap:** PreSync chạy trước tài nguyên Sync của chính Application. Migration Job không thể chờ một Secret/DB/ServiceAccount chỉ được tạo ở Sync rồi mong lần deploy đầu tự thành công. Giữ prerequisites ngoài app lifecycle, kiểm tồn tại trước sync. Secret rotation phải kiểm cả migration Job lẫn API/worker; không chỉ reload web.

Kubernetes/Argo versions, ingress controller, storage class và node resources của server là input cần inventory tại task triển khai; không mặc định cấu hình Compose cũ dùng được trực tiếp. Đặc biệt `TRUSTED_PROXY_IP` cố định cần thiết kế lại theo ingress/network boundary; không chuyển sang trust mọi forwarded header.

## 6. Rollout authoritative API và database

### 6.1 Singleton là contract ban đầu

API giữ `replicas: 1` với **Recreate và explicit drain**, chấp nhận short downtime có thông báo. Web/admin có thể rollout riêng nhưng phải qua compatibility test. Không bật HPA API hoặc canary hai authority trên cùng schema.

Recreate là chiến lược rollout, không thay thế ownership guard. Pod deletion, node failure hoặc lock loss vẫn phải fail closed bằng authority hiện tại. Kubernetes cũng lưu ý bảo đảm của Recreate áp dụng cho upgrade; không được coi đó là chứng minh tuyệt đối chỉ có một process trong mọi failure mode.[S6]

Trước đổi API/schema, đóng admission mới, để công việc đã nhận kết thúc trong deadline rồi shutdown. Client nhận trạng thái reconnect/interrupted rõ ràng. Sau restart, không phục hồi seat/membership cũ chỉ từ receipt lịch sử; business state bền vững theo domain policy.

Drain/release operations nhận release ID và idempotency key. Hook lặp lại cho release đã active phải no-op phù hợp; không làm toàn hệ thống maintenance mỗi lần self-heal unrelated. API shutdown vẫn có deadline và từ chối command mới; không chờ vô hạn vì socket còn kết nối.

### 6.2 Migration tương thích N-1

Mục tiêu là server/released clients hỗ trợ N-1 trong compatibility window được khai báo, kể cả sau additive schema changes. Điều này **chưa có sẵn** trong exact-manifest readiness hiện tại.

Task schema compatibility cần:

- Giữ checksum của mọi historical migration; không sửa SQL đã phát hành.
- Khai báo schema compatibility level/epoch và required migrations của từng binary.
- Chỉ cho phép phần mở rộng tương thích đã review/test; unknown breaking schema làm readiness fail.
- Dùng expand → chuyển readers/writers → contract sau khi N-1 hết support.
- Test binary N-1 trên DB sau migration N trước khi cho phép rollback.
- Tách DB compatibility khỏi network protocol version và asset version.

Không nới readiness thành “DB ping được”. Nếu release chưa đạt N-1 schema gate, dùng maintenance window và ghi rõ **không rollback binary qua schema đó**; chuẩn bị roll-forward.

Migration Job dùng API digest của release, checksum journal/advisory lock, deadline và resource budget. Rerun không áp dụng trùng. Các migration dài hoặc không chạy được trong transaction phải có kế hoạch riêng; không nhét vào PreSync gây lock kéo dài.

### 6.3 Sync phases và failure

Trình tự logic: prerequisite check → admission/drain khi cần → migration → API/web/admin → readiness → PostSync smoke → quyết định mở admission.

PreSync/PostSync thực hiện các thao tác đã giới hạn, có audit và idempotency. Hook có thể chạy lại khi sync; selective sync bỏ hooks, nên release có migration phải đi full Application sync. PostSync chỉ chạy sau Sync thành công và resources healthy theo đánh giá Argo.[S7]

**PostSync failure không tự rollback code/database.** Nó đánh dấu sync thất bại; admission giữ đóng nếu release chưa được xác nhận. Operator chọn Git revert tới digest tương thích hoặc roll-forward. Backup restore là disaster recovery riêng, không phải routine rollback; phải xét mất dữ liệu sau backup và các quyết định consent/revocation.

Rollback thông thường là commit Git revert release set, Argo converge về desired state đó. Không sử dụng `kubectl set image` để tạo trạng thái drift, và không dựa vào nút rollback Argo khi auto-sync đang bật.[S4]

## 7. Ma trận deployment regression

Các scenario dưới đây là **acceptance phải xây dựng**, chưa phải tests đã pass. Staging thực hiện full regression trên dữ liệu cô lập; production smoke giới hạn health/version và synthetic flow được định nghĩa trước, không stress người dùng thật.

| ID | Scenario | Pass condition / evidence |
|---|---|---|
| CD-01 | Fresh clone, frozen install, build toàn bộ image | Đúng source SHA/digest; không dựa vào cache riêng của agent |
| CD-02 | Runtime nonroot, read-only; thiếu secret; inspect image | Healthy khi config hợp lệ; fail closed khi thiếu; không secret/source output không cần thiết |
| CD-03 | Kustomize render cho hai environment, policy/schema validation | Không reference thiếu, `latest`, resource trái namespace hoặc quyền quá rộng |
| CD-04 | Empty DB → head; current DB → candidate; migrate rerun | Journal/checksum đúng; idempotent; data invariants giữ nguyên |
| CD-05 | Historical checksum mismatch, migration exception/timeout | Release dừng; không API mới mở admission; log đủ chẩn đoán, không lộ secret |
| CD-06 | First bootstrap và credential rotation | Hook đọc được prereqs đúng version; failure không dẫn tới một phần app tự nhận ready |
| CD-07 | Replica cạnh tranh, authority lock loss, process crash | Không hai room owners; commands/readiness từ chối khi mất authority |
| CD-08 | Drain khi có sockets/orders; deadline shutdown | Không nhận việc mới; kết quả pending/interrupted trung thực; không phantom success |
| CD-09 | HTTPS/WSS qua ingress, origin/cookie/proxy header giả | Auth và forwarding đúng; internal metrics/admin backend không bị lộ ngoài policy |
| CD-10 | API N/web N, API N/web N-1; mobile supported N-1 | Contract ổn hoặc graceful upgrade rõ; không phụ thuộc store update tức thì |
| CD-11 | Failed candidate → previous compatible digest → forward | Preserved durable identity; fresh membership; không duplicate reward/order |
| CD-12 | Full sync lặp lại, self-heal, missing image, bad config | Idempotent hooks; không drain vô cớ; Argo failure và admission state đúng |
| CD-13 | Prune preview, app deletion drill, data protection | Không xóa DB/PVC/keys ngoài ownership; restore rehearsal chỉ dùng target test |
| CD-14 | Collector down, không traffic, stale metrics; alert test | UI phân biệt zero/stale/unknown; đúng image/release version; alert delivery có evidence |
| CD-15 | Join burst ở quota, reconnect grace, ticket replay/expiry khi rollout | Không vượt admission cap; không duplicate slot; queue/reconnect recovery đúng |

**Applicability của CD-10:** trước khi có mobile được phân phối/hỗ trợ, native subcases là NOT_APPLICABLE có lý do, không PASS; web candidate vẫn phải đạt web/API compatibility. N12-03 sở hữu physical mobile compatibility gate. Từ binary mobile đầu tiên được phân phối, mọi backend release ảnh hưởng supported clients cần evidence native compatibility tương ứng, kể cả đợt được gọi là web release.

Gate performance đầy đủ chạy riêng trên environment cô lập với profile/hardware xác định, budget và stop conditions. Unit/concurrency checks nhỏ chạy trong CI nhanh. Không dùng “1.000 socket kết nối” làm bằng chứng “1.000 người chơi thực” hoặc tự nâng recommended cap từ một smoke test.

## 8. Gate hoàn thành và handoff

**Build-ready:** image split chạy production-mode, artifact map có digest/source SHA, runtime smoke và artifact inspection thành công.

**GitOps-ready:** overlays render/validate, bootstrap ownership rõ, digest promotion không loop, full sync và failure path qua trên cluster test. Những command/script mới phải được thêm vào source trước khi báo đã chạy.

**Staging-ready:** schema N-1/roll-forward decision rõ, singleton drain, WSS/auth, admission, telemetry và 15 scenario có kết quả thật theo applicability (native-only subcases có thể NOT_APPLICABLE trước khi có mobile); blockers ghi rõ.

**Production candidate:** cùng release set qua staging, backup/restore còn hiệu lực, cấu hình server/secret custody được kiểm, capacity policy có dữ liệu và rollback runbook cụ thể. Owner merge promotion PR sau khi xem bằng chứng là bước release authorization.

Mỗi gate lưu source SHA, image digests, environment, command/exit code, report hash/run link, migration state, test exclusions và next exact action. Không dùng trạng thái VERIFIED của plan thay cho bằng chứng của artifact đang deploy.

## Nguồn

### Source audit ghim commit

- [R1 — CI workflow](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/.github/workflows/quality.yml).
- [R2 — Vitest projects](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/vitest.config.mts).
- [R3 — Migration runner](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/db/migrations.ts).
- [R4 — Dockerfile](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/infra/docker/Dockerfile) và [Compose stack](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/infra/compose/stack.yml).
- [R5 — Room authority](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/rooms/authority.ts) và [readiness](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/apps/platform-api/src/operations/readiness.ts).
- [R6 — Release verifier](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/verify-release.mjs) và [governance verifier](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/scripts/verify-governance.mjs).
- [R7 — Recovery scope](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/operations/DEPLOYMENT-RECOVERY.md).

### Tài liệu chính thức, đọc 05/11/2026

- [S1 — GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
- [S2 — Skipping workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).
- [S3 — GITHUB_TOKEN event behavior](https://docs.github.com/en/actions/concepts/security/github_token).
- [S4 — Argo CD Automated Sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/).
- [S5 — Argo CD Webhooks](https://argo-cd.readthedocs.io/en/stable/operator-manual/webhook/).
- [S6 — Kubernetes Deployments / Recreate](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#recreate-deployment).
- [S7 — Argo CD Sync Phases and Waves](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/).

