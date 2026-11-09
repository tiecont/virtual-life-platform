# N00-03 — environment and assumptions

Observed 2026-11-05 at base `d3a2c33`. Owner authorized routine implementation choices. These are local development observations and provisional test defaults, never production hardware/capacity or device certification.

## Measured local host

| Field | Observation |
|---|---|
| OS / architecture | CachyOS Linux / x86_64 |
| CPU | AMD Ryzen 7 4800HS, 16 logical CPUs |
| Memory | 24,573,243,392 bytes reported MemTotal (~22.9 GiB) |
| Workspace filesystem | 166,313,963,520 total bytes; 49,988,481,024 free at observation; shared with other work, not reserved |
| GPU enumeration | NVIDIA RTX 2060 Max-Q and AMD Renoir/Vega; no WebGL/GPU throughput measurement |
| Repo tools | Node 26.9.0, pnpm 11.28.5, Git 2.56.0, Docker Engine 29.9.0, Compose 5.6.0 |
| Test ports | 3300, 4300, 4400, 55452 free at observation |
| Native tools on PATH | Java, Gradle and ADB unavailable; no SDK/device probe or app install claimed |
| Cluster tools on PATH | kubectl, kustomize, Helm, Argo CLI, k3d and kind unavailable; no active cluster inspected |

The inventory captures per-tool availability and actual command results privately under `artifacts/vnext/n00-03/`. Unavailable tools were not invoked and have no fabricated exit codes. Device serials, public IPs, credentials, environment secrets and kubeconfig contents were not collected.

## Chosen defaults and unresolved inputs

| Area | Default / known state | Unknowns and responsible lane |
|---|---|---|
| Development | Existing pnpm/Next/Nest/PostgreSQL/Socket.IO stack and Compose harness; keep pins | Tool upgrades require separate compatibility evidence: Foundation |
| Staging preparation | Loopback-only disposable Compose/TLS first; single-node k3s-in-Docker candidate for the N04 Argo exercise after tool/resource preflight | Actual cluster creation/access and measured resource consumption: Foundation/N04; no public host selected |
| Local rehearsal envelope | Serialize build, DB/browser and cluster exercises; begin cluster qualification with a bounded 2-vCPU/4-GiB application budget and no scale-up assumption | Shared-host headroom must be checked before each workload; this is a test budget, not a production VM recommendation or proven capacity: N04/N08 |
| Production | No actual server/cluster/domain or credentials provided | CPU/RAM/disk/IOPS/uplink, nodes, ingress/TLS, storage, region and access UNKNOWN; N04/N08 collect at qualification. No purchase or deployment authorized implicitly |
| Player locale | Reuse current Asia/Ho_Chi_Minh display defaults; begin Vietnam-oriented UX copy/latency hypotheses | Actual player regions, WAN p95, target CCU/gameplay mix UNKNOWN: Experience/N08. Loopback latency cannot qualify WAN |
| Load generator | Local host available for regression only; run qualified server load from a separate measured host | Separate qualification generator hardware/network UNKNOWN: N08 |
| Android | User reports one physical Android; use that model as baseline once available. Shared DOM/Pixi/Capacitor remains the spike default | Model, OS/API, WebView, USB/ADB authorization, thermal/battery behavior UNKNOWN; N10 installs scoped tooling and probes the actual device. One model does not define a support floor |
| Android signing/Play | Local signed APK/AAB lane can be implemented independently | Keystore custody, Play account/test-track access/tester eligibility UNKNOWN until N11; local build is not Play distribution |
| iOS | N14 inactive; shared interfaces may be prepared on Linux | macOS/Xcode, signing and physical iPhone access UNKNOWN; do not block Android/web |
| Operations | One human operator identity; separate service identities; fail closed on stale metrics | Real operator principal/MFA recovery custody, on-duty contacts, monitoring routes and backup destination UNKNOWN: N07/N12. No synthetic identity is public staffing |

Unknown external inputs do not block local docs, code, UX, images, queue or compatibility preparation. Owner discretion selects implementation defaults, not facts about uninspected servers/devices. Production/store operations retain their explicit gates.

## Exact follow-up

N00-04 records ADRs and lane ownership. N10-01 verifies SDK/JDK/ADB on this host and then the available Android, keeping not-yet-observed fields UNKNOWN. N04 validates local manifests and a disposable staging candidate before requesting any real environment access. N08 must measure hardware/workload/latency before recommending capacity. Refresh this matrix when new observations replace an assumption; retain the dated evidence.
