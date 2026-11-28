# Aetheria production roadmap

This is the working plan for Wave D3 closure, Wave D4, Campaign V2–V4, Character Performance, AAA Asset Refinement, and the Tripo and Charakuru integration. Resume the existing tasks from their latest evidence. The [gameplay acceptance ledger](wave-d4-production-acceptance.md) owns the individual D4 and V3/V4 acceptance decisions. The [development backlog](../../config/development-plan.json) owns task IDs, dependencies and source-specific verification. In the character review branch, consult `specs/acceptance/character-visual-fidelity.md` for the evidence and open acceptance of each of the 16 groups below and `specs/media/tripo-build-refine.md` for native operation compatibility. The two harness run IDs are `master-campaign-v4` and `character-performance-cinematic`.

## Plans and their relationship

| Owner assignment | Work carried forward | Acceptance location |
| --- | --- | --- |
| Wave D3 Closure and Wave D4 Full Playable Game | Close actual D3 PR regressions. Qualify progression, balance, six maps, production presentation, Admin and regression checkpoints A–F. | D3 backlog and D4 ledger sections Integration through Final product review |
| Wave D4 Parallel Game Production, Visual Excellence, Performance and Security | Playable Linux client, ordinary player journey, world, character art, audio, Admin, security, performance and private delivery. | D4 ledger sections A–M |
| Wave D4 Product Direction Correction | Social locomotion in the world, a dedicated match-3 battle view, functional tile roles, authored backgrounds, reference-led visuals and authoritative turn controls. | D4 ledger N and reference-driven run O |
| Campaign V2 | Retain all 16 workstreams listed below, their evidence and outstanding release obligations. | Existing backlog, D4 acceptance and inherited V3 parallel-production gates |
| Campaign V3 Advanced Jewel System | R04 artwork, six basic roles, Nature/Frost/Astral, full-cell UI, combos, multipliers, persistence, Admin controls, simulation and package verification. | V3 jewel gates J1–J7, parallel production P1 and integrated qualification Q1 |
| Campaign V4 Owner-Locked Gameplay Direction | Shared nine-kind natural RNG, fixed Boss strength, elemental damage, six maps, 48 routes, all 61 identities and their 245 existing ability bindings. | V4 gates R, J, E, B, M, P, A, ART, C, D and Q |
| Campaign V4 Continuous Parallel Execution | Warden diagnosis, 48 routes, Admin completion, four packaged clients, Icarus, parallel art, cinematic/audio and local infrastructure. | Current V4 queue below and the 124 V4 conditions |
| Character Performance & Cinematic Excellence | Build reusable character and presentation systems and demonstrate them on the approved Icarus VRM. | Master Output groups 1–8 below and VL-204 |
| AAA Asset Refinement & Visual Fidelity Extension | Diagnose the original model, test reversible improvements, compare A/B/C/D and qualify visual fidelity. | Master Output groups 9–16 below and VL-204 |
| Tripo H3.5 & Charakuru Skill Update and Tripo-first Build & Refine | Verify native operations, route unsupported work to Blender, reuse compatible Charakuru workflows, qualify optional C-H35 and account for costs. | Provider work and accessory acceptance below |

## Gameplay and product work carried forward from V2

| Stream | Deliverable to qualify |
| --- | --- |
| WS01 Repository recovery | Reconcile branches, worktrees, PR revisions, D3 failures, pending edits and backlog. Preserve history and checkpoint actual source. |
| WS02 Rust combat | Implement typed engine capabilities, validate the published bundle, reproduce deterministic turns, combos, actions and immutable replay. |
| WS03 Nest and PostgreSQL | Authorize allocation, validate/pin configuration, persist progression and idempotent settlement. Exercise resume, cutoff, historical receipts and concurrent requests. |
| WS04 Unity gameplay | Walk the ordinary guest path from plaza to match, results, rewards and upgrades. Verify solo and actual packaged cooperative turns, timeout, reconnect and recovery. |
| WS05 Balance and economy | Exercise early solo and high-tier parties, training, artifacts, acquisition, currencies, achievement points and abuse controls. Diagnose losses and use independent seeds. |
| WS06 Flagship Icarus | Reuse the approved Charakuru VRM. Complete modular fitting, rig and motion, then qualify the Unity presentation under H1–H4. |
| WS07 Pet and Boss factory | Advance Coalwhisk, Cinder Warden, Ignivar and Cinderquill. Extend to the canonical roster with reference, model, UV/material, rig, motion, LOD, provenance and reviewed import. |
| WS08 Visual design | Preserve the approved R04 jewel sheets, sprite identities and full-cell readability. Qualify board, HUD, overlays, currencies, localization and combat feedback at native resolutions. |
| WS09 Environments | Qualify social spaces, map entry and battle backgrounds for Cinder Terraces, Tideglass Lagoon, Stormcoil Fields, Lantern Necropolis, Ochre Labyrinth and Dawn Prism Sanctum. |
| WS10 Animation, VFX and cinematics | Produce model-bound introductions, skill, Ultimate and Gacha presentation with Timeline, cameras and reduced-motion equivalents. |
| WS11 Audio, voice and localization | Produce authorized music, voice and effects, synchronize cues, qualify the five-language experience and record rights. |
| WS12 Private asset storage | Verify local MinIO admission/recovery, checksum manifests, versioned private delivery and access controls. Owner controls external uploads. |
| WS13 Admin and catalog | Qualify Pet, Boss, jewel, element, map, economy, recruitment and acquisition controls. Exercise draft, compare, engine validation, publication, rollback and audit in a browser. |
| WS14 Website and preregistration | Qualify public presentation, authorized media, character preview, privacy/consent and preregistration. Obtain release approval. |
| WS15 Repository efficiency | Maintain reproducible build inputs, scoped CI, reusable skills, dependency graph, skill discovery, isolated ownership and handoff/recovery. |
| WS16 Independent qualification | Qualify actual client journeys, performance, defensive security, privacy, packaging, rollback, hardware and human playtests. Record platform, revision and limitations. |

## Campaign V4 execution queue

1. **Warden and balance.** Resolve causes of the original 1,584 high-tier defeats. Inspect damage/defense, growth, skills, Boss cadence, phase pressure, resources, multipliers and policy. Compare isolated changes with holdout seeds before proposing an Admin candidate. Keep Boss strength authored and RNG shared.
2. **Six maps and acquisition.** Qualify prerequisites, encounter eligibility, recruitment, settlement and reconnect for all 48 routes. Preserve historical ownership, fixed-strength encounters, legitimate solo clears and distinct collectible/Boss Dragon stats. Reconcile every roster and ability ID.
3. **Admin.** Exercise actual local operator flows for Pet stats/growth, jewel limits and effects, maps/recruitment, economy, diff, publication, rollback and audit. Preserve the active match digest across changes and restart.
4. **Packaged gameplay.** Verify natural Nature/Frost/Astral and regular/basic jewel effects, cleanse, shielding, Chill and amplification. Capture full-cell labels after turn 12, multiplier readability and damage/heal/resource feedback. Drive four independent Linux clients, join, rotate all four real player inputs and test reconnect against receipts. Record human and Windows qualification separately.
5. **Hero.** Preserve the original Icarus. Resolve hand grip, costume/leg/arm layering and chin deformation. Review modular wing and bow attachment, then motion and a model-bound cinematic.
6. **Pet and Boss production.** Use approved references and existing jobs for Coalwhisk, Cinder Warden, Ignivar, Cinderquill and the remaining roster. Qualify texture, mesh, rig extremes, locomotion, attack and recovery in Unity.
7. **Cinematics and audio.** Qualify Cinemachine/Recorder and existing Timeline presets. Produce intro, skill, Ultimate and Gacha previews. Verify audio sync, localized playback, rights and export.
8. **Infrastructure and QA.** Verify disposable PostgreSQL, MinIO, repeatable packages, recovery, CI and review-branch integration. Main deploys directly to production. There is no staging environment. Hosting changes, signing, restricted media delivery and production release have separate owner gates.

## Character Performance and AAA Master Output Checklist

Each row describes the full scope to verify. Update individual results in the character acceptance ledger with the revision, conditions and evidence. Completing one experiment qualifies only its stated asset, pose, platform and conditions.

| Group | Required work and outputs |
| --- | --- |
| 1. Repository and harness | Audit repository, branches, worktrees and backlog. Inventory skills/workflows, verify Charakuru history, path and purpose, reconcile duplicate/obsolete skills. Verify Astra orchestration, specialist ownership, checkpoint/recovery/handoff and independent QA. |
| 2. Skill engineering | Extend engineering harness, hero VRM and standard 3D skills. Qualify Charakuru, Meshy and Tripo routes, character animation, anime rendering, combat VFX, cinematics, facial performance/audio and visual QA. Verify discovery and activation on real assets. |
| 3. Character framework | Reusable prefab, Humanoid controller, Pet/Boss non-humanoid architecture, blending and transitions, IK/FK and constraints, weapon interaction, facial expressions, gaze/blink/lip-sync, hair/cloth secondary motion, wing articulation, animation events and committed Rust event to Unity presentation. |
| 4. Anime rendering | Toon shading, face shadows, eyes, hair highlights, outlines, rim lighting, material and lighting profiles, antialiasing, temporal stability, bloom and grading. Verify installed Unity and URP compatibility. |
| 5. Combat and elemental VFX | Elemental effects, projectiles, weapon trails, impact and charge, hit-stop/shake, combat animation and audio sync, pooling and performance. Gameplay authority stays in the server. |
| 6. Cinematic production | Reusable scene, storyboard, Cinemachine, Timeline, camera choreography, lights, face, VFX/audio tracks, slow motion, repeatable export, offline 4K60 where supported, website encoding and interactive character preview. |
| 7. Icarus vertical slice | Exact approved VRM/design, personality idle, breathing, walk, run, turns/transitions, bow attack, elemental skill, Ultimate, expression showcase, hair/wing/costume motion, Phoenix Fire Bow interaction, intro and playable Unity showcase. |
| 8. Runtime performance and QA | Reference hardware, CPU/GPU frame times, percentiles/pacing, memory, draw calls, render statistics and animation overhead. Clipping/deformation and visual regressions, independent QA, rights/provenance, backlog, commits, checkpoints and rollback. |
| 9. Original asset audit | Pin checksum and immutable source. Audit silhouette and geometry, mesh/vertex/triangle inventory, topology and facial edge flow, UVs/density, textures, normals/tangents, materials, weights/influences, facial shapes and finger/hair/wing/cloth rig. Capture close-ups and classify defects by source, import, shader, rig or animation. |
| 10. Geometry refinement | Review silhouette and anatomy. Where evidence warrants, use sculpt, selective subdivision, retopology, facial edge loops, deformation topology, cleanup and normal/tangent correction. Refine costume/accessories and LOD while preserving design. |
| 11. Texture and surface | UV optimization and density, high-to-low baking, base color, normals, AO and roughness/metallic where applicable, emission, anime shading, face shadow and hair highlight masks, close-up texture detail, compression and runtime memory. |
| 12. Materials | Qualify skin, face, eyes/lashes, hair, cloth/embroidery, armor/metal, feathers, crystals/gems, magical energy and Phoenix Fire Bow under multiple lighting conditions. |
| 13. Rigging and deformation | Correct weights, test shoulders/elbows/knees/fingers, correct grip, use corrective shapes where justified. Qualify facial rig, eyelids/mouth/chin, wing fold/spread, hair and cloth collision, volume preservation, extreme poses and retargeting. |
| 14. Technical art automation | Headless Blender/Python, mesh health, UV/texture validation, normal diagnostics, bone/weight validation, pose stress and expression checks, batch render, Unity Editor tools and frame capture, visual regression, reproducible exports, backup/provenance/rollback. Demonstrate the refinement workflow on a real asset. |
| 15. Controlled experiment | Version A original VRM, B rendering only, C refined mesh and D full performance separately. Lock camera, pose and resolution. Match B/C rendering and motion benchmark conditions. Produce stills/video, analyze gains and regressions, render D cinematic, obtain independent production recommendation. |
| 16. Acceptance | Maintain visual/design, topology/deformation, facial close-up, texture/material, animation, temporal and runtime criteria. Apply Hero/Pet/Boss standards. Record severity, costs/credits, limitations, improvement roadmap and artistic owner decision. |

## Tripo, Charakuru and Blender delivery

- Inspect installed Charakuru against upstream, verify scripts, skills, donor restrictions, expression input shapes, weight transfer, Humanoid rig, springs and VRM export. Keep independently authored integration and licensing records.
- Verify Tripo Studio MCP model and operation availability, auth scopes, current price and sharing mode. Prefer a verified native MCP operation, then Studio UI where required. Reconcile existing tasks and receipts before paid calls. Preserve source references and approved silhouette.
- Assess H3.5 high-poly generation and Generate in Parts, Smart Segmentation, P2.0/native retopology, Smart UV, AI Texture/PBR, rigging, animation and export on the actual input. Check UV limits, part identity, material/texture preservation, topology, deformation and import after each applicable transition. Use Blender for failed segmentation, custom topology, detail baking and rig correction.
- For C-H35 compare high-poly and production surfaces, coordinate frames, normals, two-way distance, rays, UV overlap and misses before baking. Prioritize Phoenix Fire Bow, wings, armor and S-class Pets. Compare matched images and runtime cost. Keep A/B/C/D and the original Icarus face/body intact.
- Native surfaces of both accessories are owner-approved. The 80-credit joint UV/texture authorization covers that completed work. Earlier authorizations apply to their original operations. Any future paid operation requires a remaining applicable allocation.
- Produce new jewels from approved image references, preserve both R04 master hashes and existing sprite IDs. Use Hydrogen for visual/media production and the owner-approved tools for jewel references. Record actual provider, price, rights and output.

## Dispatch, dependencies and evidence

| Window | Parallel work | Exit criterion |
| --- | --- | --- |
| Current GPU slot and independent CPU work | Terra/Luna runs four-client packaged rotation. Character specialist refines the native grip and measures a single retained mount across walk phases. Deformation specialist tests the front garment ornament against its original UVs, weights and matched camera. | Four player-authored receipts with four-client evidence or a localized failure. Native hand close-ups, full turnaround and matched garment comparison with source hashes. |
| Next GPU slots | Serialize native Unity captures. Collect post-turn-12 HUD and natural Frost/Astral evidence, qualify Pet motion, inspect final colored C-H35 material and profile it. Lead integrates independent QA and updates exact ledger rows. | Source-specific visual and runtime evidence for each candidate. |
| H2 then H3 | Owner reviews modular turnaround, costume layers, wing roots, folded/spread silhouette and bow placement. After H2 qualify stable hand/wrist, two-hand draw, release/recovery, wing motion, cloth, hair, facial and extreme poses. | Owner's explicit H2 and then H3 decisions on actual frames and clips. |
| H3 to H4 and final review | Qualify URP materials and lighting, reduced motion, VFX/audio, skill and Ultimate, localization, intro, playable showcase, controlled A/B/C/D and website export. Continue independent V4 gameplay, Admin and infrastructure work. | Independent QA, hardware measurements, rights, H4 and production decisions recorded against exact revisions. |

Use the published PostgreSQL configuration, the default-off Rust path, and committed events for Unity presentation. Use the directly installed Unity Editor with a private compositor for rendering. Assign supplied test/build/lint cases to Luna 6 or Terra 6.1. Keep review branches isolated and evidence in ignored artifacts. Reach production only through the applicable owner decision and green source-specific CI.
