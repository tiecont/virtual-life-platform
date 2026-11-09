# Agent execution and file reservation guide — Desktop-first

## Scheduling constraints
1. **Repo HEAD audit first:** `VL-001`, then `VL-002` + `VL-077` (desktop ADR), `VL-003`, `VL-006`, `VL-007`, `VL-078`, `VL-079`. Reserve Unity project/URP files, proto, migrations, Next routes and Rust workspace separately.
2. Once ADR approved: A1 Rust `VL-004/012/015/016/017`, A5 Unity `VL-080/081/082`, A3 website `VL-083`, A4 rig `VL-025/026`, QA `VL-014`. No agent may independently choose another renderer.
3. G2: A5 builds movement camera/world/HUD `VL-084/085/086/087/088`, A4 district/rig, A1 world validation `VL-028`, A3 official site side work. Merge C# generated contracts only from pinned proto SHA.
4. G3: A1 + A2 seat/teleport, A5 Unity café/card/Pet gameplay, A6 game content, A3 launch site. Allocate distinct scene/prefab IDs to avoid merge collisions.
5. G4: QA real device benchmarks/chaos, security identity+rewards, Windows signed packaging/patch update, web download funnel; G4 cannot close based on design mock or unaudited avatar screenshots.

## File ownership table
| Hot area | Single owner | Reviewers |
|---|---|---|
| `proto/`, generated C# / TS versions | Rust protocol maintainer | Unity + platform + QA |
| `database/migrations`, outbox | DB/security | Rust + Nest |
| `Assets/VirtualLife/Rendering`, URP settings, Unity package locks | Unity tech lead | Technical artist + QA |
| Avatar `.blend` / FBX source / rig contract | Art technical lead | Unity + accessibility |
| Next release routes, hero media | Website lead | Brand + security |
| signing/CI/release manifests | SRE/release engineer only | Security + owner |
| legacy Nxx/PA/Lodge ledgers | legacy plan coordinator only | corresponding reviewers |

## Agent definition of done
Source SHA and PR, environment+device profile, deterministic tests, visual evidence **from app** where appropriate, web metrics, rollback path, review signoff. Out-of-scope marketing page screenshots may prove *design*, not 60 FPS gameplay. Send handoff notes with owners and dirty-path inventory; new `STATE.json` moves from TODO only with real proof.

## Stop-work conditions
Agent conflicts on shader/project scene settings, live secret/signing key needed, duplicated authoritative ownership, downstream task requires missing device/OS license, scope expands to full open world. Record blocker and continue independent work rather than fake VERIFY.
