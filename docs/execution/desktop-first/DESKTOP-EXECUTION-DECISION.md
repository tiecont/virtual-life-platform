# VL-077 — Desktop roadmap and development/runner decision

Owner direction recorded 2026-11-10. Windows remains the primary release product,
Unity 6.3 LTS/URP the client, Rust new gameplay authority, Nest control plane and
legacy authority, and Next.js the official portal. See the reviewed
`DECISION-ADR-003-APPROVAL.md` and source-bound VL-002 review for architecture
acceptance provenance and independent countersignature. This document changes
execution scheduling, not the supplied 110-task checksum baseline.

## Owner's explicit host/runner allocation

| Environment | Assigned work | Evidence it can provide |
|---|---|---|
| CachyOS workstation | Primary development, Rust/PG/protocol/website, headless tests and source preparation | Dated local source/test evidence; no inferred supported Unity host certification |
| Ubuntu runner | Linux CI that needs a supported Unity environment | Actual pinned editor/module/license/build logs on a supported Ubuntu version |
| Windows runner | Build and test the Windows client | Actual Windows artifact, edit/playmode and functional test evidence |
| Windows self-hosted runner with physical GPU | FPS, shaders, DirectX 12 and real graphics quality | Named physical GPU/driver/OS, actual compiled-player captures and independent review |

The owner explicitly confirmed there is no Windows machine currently available.
Continue dependency-ready Linux work. Do not replace CachyOS as the development OS.
An ordinary Windows hosted runner is not a gaming-GPU benchmark machine, and a
Linux/Wine/container result is not physical Windows player evidence. The Rust
foundation's Ubuntu workflow does not claim to provision Unity or Windows runners.

Unity's [6.3 system requirements](https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements)
list supported Ubuntu editor environments; CachyOS is not in that list. The
[IL2CPP documentation](https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp/il2cpp-introduction)
requires platform toolchains and generally a matching host platform; the documented
Linux cross-compiler produces Linux players. A prospective Windows IL2CPP build
therefore belongs on the Windows build lane, not a claimed Linux cross-build.

## Runner trust and capability gates

Pin editor patch, packages, build/content/protocol hashes and runner OS image.
Actual Unity account/license terms and build modules remain unqualified; do not
invent credentials or accept paid terms. Configure hosted Windows functional jobs
when source/dependencies and capability are ready. A self-hosted GPU lane must be
restricted to trusted reviewed commits/manual dispatch, not arbitrary fork PR code.
Do not expose signing/license secrets to untrusted CI. No machine is provisioned
or public release approved by this decision.

VL-006 remains externally blocked on owner style/rights approval. VL-007 remains
externally blocked on agreed named Windows test machines. Their useful Linux audits
are source/evidence preparation, not fulfilled physical or brand acceptance.
Backend work does not wait for those unrelated gates. VL-078/080 and graphics
tasks still require their actual declared hardware/license/build evidence.

## Legacy handoff and scheduling

N06-04 stays `IN_PROGRESS` in the byte-preserved archive, with its final `071bcbb`
checkpoint at `N06-04-LOD-LEASE-CHECKPOINT.json`. No browser performance/art failure
is erased. Legacy renderer source remains unchanged; Agent 2 owns future optional
compatibility changes only after reservation. Preserve all legacy RoomAuthority,
encrypted journal and mobile deferrals. New Rust native namespaces start disabled.

Pet Arena PvE precedes new Lodge gameplay. Common protocol, seats, private
projection and generic table infrastructure may be direct prerequisites; they do
not activate a new Lodge mode. Map PA work to Rust/Unity evidence only after actual
matching acceptance, without promoting old PA task states.

Known baseline semantic mismatches remain explicit: VL-027 contains browser
acceptance; VL-033 and VL-058 contain N06-09 web hard gates despite the owner's
Windows-critical-path direction. Before reaching them, add a reviewed, source-bound
execution overlay and scheduler support; do not satisfy a browser gate using a
Linux/Windows result or edit baseline checksums. This decision records the intended
exception but does not silently change current scheduler semantics.

Rollback: retain this execution record and old evidence, revert through reviewed
source control, and keep existing legacy worlds on Nest. Hardware absence never
justifies changing supported-platform claims, relaxing budgets or publishing an
unsigned/unqualified artifact.
