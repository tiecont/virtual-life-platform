---
name: aetheria-character-production
description: Multi-agent reference-to-Unity-URP production pipeline for Aetheria anime/fantasy characters and Pets. Trigger for face/base mesh, hair, wings, weapons, retopo, rigging, motion, skills VFX, art review and final asset delivery; not gameplay/server implementation.
---

# Aetheria Character Production — Codex multi-agent skill

## Role and precedence

The supervising agent is CTO/Tech Lead (requested alias **GPT 6.2 Astra**); delegate isolated tasks to worker agents (requested alias **GPT 6.2 Sol**) **only when supported by the active Codex environment**. Model aliases/reasoning options are configuration targets, not proof of availability. If unavailable, execute sequentially with the available model, preserving all gates and reporting the limitation. The CTO alone owns integration, owner-facing approvals, Git and budget accounting. Never allow two agents to mutate the same `.blend`, Unity scene/prefab, `.meta`, asset manifest or backlog record concurrently.

Read, in order: root `AGENTS.md`, `README.md`, `config/development-plan.json`, `specs/pet-arena/art-direction.md`, character-specific specs, current asset contracts, this Skill, [multi-agent-4-gates.md](references/multi-agent-4-gates.md), [source-routing.md](references/source-routing.md) and [unity-delivery.md](references/unity-delivery.md). Also preserve and read the pre-existing `references/production-gates.md` (technical G0–G8), `references/style-and-rework.md` and `assets/character-brief.template.json`. Run `pnpm plan:status`. Inspect latest revision, current worktrees, source SHA, provenance and unfinished accepted work before creating anything.

The new **four owner hard gates** are acceptance checkpoints over existing technical stages; they do NOT erase G0–G8. A positive technical import check is never artistic approval. New user direction to use multi-agent plus explicit owner approvals supersedes the earlier single-agent workflow **only after the repository policy files are reconciled in the implementing branch**. Do not silently ignore the existing conflicting `AGENTS.md`.

## Scope and invariants

- Use actual owner-authorized references. Preserve character identity, rights/provenance, naming, colors and anatomy. Unseen views are *design proposals* until approved. Do not produce other five Limited Pets whose owner designs are on hold. Do not interpret lack of data as approval.
- Preserve canonical `petId`, opcode, gameplay event names and all required action names from current `specs/pet-arena/v3.1/data/limited_animation_profiles.json`. For Icarus: `pet-v3-fire-icarus` / `FIRE_ZONE` / **16 exact actions**, even where old names mention sword. Five study clips are inadequate.
- Icarus body: **adult human 1.68 m**, no tail, no beast legs; **two foldable feathered wings attached at upper back**. Preserve the approved Version-1 design/owner approval record, do not silently replace it with a more recent unapproved generated proposal. Bow: Phoenix Fire Bow, separate asset and articulation/grip checks. Treat palette as unapproved until its hex fields are reconciled with the owner reference.
- For current Icarus import contract: Unity **6000.3.14f1**, URP **17.3.0**, **Generic** import, LOD0 **26,000–29,500 triangles** (includes attachments/weapon counted by current contract), **74 joints**; LOD1 **14,000–16,500 triangles / 48–56 joints**; LOD2 **6,500–8,000 triangles / 28–34 joints**; runtime material budget LOD0 ≤3, LOD1 ≤2, LOD2 ≤1; texture ceilings 2048/1024/512. Do NOT replace these with a generic 28k–45k recommendation. Do not change importer to Humanoid without a separate validated contract migration. Blender work scene is naturally Z-up; FBX export is `-Z forward, Y up`, then verify 1.68m and scale 1.0 **in Unity**.
- Never mark `DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC` as published or runtime-enabled. No animation, Timeline or VFX decides battle outcomes. Icarus `FIRE_ZONE` is a server-authoritative 4×4 marker lasting two turns, presented over a readable 10×10 board. No fictitious gameplay state, damage or new effect opcode.

## Preflight / Seven separate files

Input directory must contain six independent clean PNGs and one JSON:

```
01_front_apose.png
02_side_apose.png
03_back_apose.png
04_face_closeup.png
05_wings_or_tail.png
06_weapon_prop.png
07_spec.json
```

For Icarus, item 05 means **two wings**, not a tail. Front is neutral A-pose with fingers separated, no held bow; side is true 90° with wings hidden/toggled for readable geometry; back shows upper-back attachment; face is neutral; wings and upgraded bow are isolated on a plain background. Full-sheet titles, overlay labels or multiple annotated views are **not** suitable geometry input. Do not upscale 299px crops and call them native HD. Design can still be reviewed with incomplete technical inputs; **stop before model generation** until independent, adequately detailed views are supplied and Gate 0 intake passes.

Copy `assets/07_spec.icarus.example.json` to `07_spec.json`, reconcile palette and actual design revision, and hash the six approved PNGs. Run:

```
python3 .agents/skills/aetheria-character-production/scripts/preflight.py /path/to/character-input --profile icarus --output artifacts/character-production/<id>/intake-preflight.json
```

It checks file presence, PNG decoding/resolution, JSON fields, declared hashes and canonical identity. It does **not** establish anatomy, absence of text, A-pose quality or owner approval. CTO performs actual image inspection; discrepancies are reported, not filled by fictional files.

## Tool routing

- **Face/base body**: reviewed licensed anime head/body base with clean editable quad loops and controlled facial shapes; VRoid Studio → VRM → reviewed Blender import only where actual plugin, license and facial controls are verified. Do not use Meshy/Tripo/Hunyuan to create the production anime head/face. Smooth shading/weighted normals cannot fix broken face geometry.
- **Hair, layered dresses, feather wings, soft parts**: Blender sculpt/curves, manual retopology, separate vertex groups/wing bones, UV inspection, baking and in-context motion clearance. Avoid tube hair, feather rods, collapsed skirt layers, entire-body automatic remesh and indiscriminate decimation.
- **Props, halo, hard armor**: Meshy/Tripo/Hunyuan optional only when provider/license/credit scope is authorized; image-to-3D proposals require review/retopo/UV/bake. Bow must retain grip/aim/arrow clearance and separate material provenance. A 3k–5k triangle prop *is a proposed target*, subordinate to actual combined Icarus LOD budgets.
- **Assembly**: Blender with `bpy` or a **verified live** Blender MCP connection; neutral inspection renders here are allowed. No fake gameplay skill VFX stage built from Blender orange curves/cylinders/board props.
- **Integration/skill effects**: Unity URP renderer, compatible Cel-Lit/Shader Graph or reviewed lilToon, skin/cloth dynamics, Unity Visual Effect Graph or Particle System as appropriate, optional Cinemachine/Recorder/Timeline after package-install compatibility verification. Do not claim those packages are installed just because recommended.

## Multi-agent execution

CTO discovers available delegation APIs; scopes isolated tasks/worktrees by file owner: (1) input & design audit, (2) face/base mesh, (3) hair/costume/wings, (4) hard props/bow, (5) skeleton/rig/animation, (6) Unity material/VFX/cinematic, (7) evidence/performance/contract QA. **No parallel modification** of a common Blender scene, rig root, Unity prefab, animation controller, manifest or shared `AGENTS.md`/backlog. Parallel workers exchange immutable GLB/FBX/images plus `sha256` receipts and exact socket/material/action contracts; CTO assembles serially. Use high reasoning for cross-discipline/rig/integration; medium for visual component work; low for deterministic scans. The CTO may vary count to minimize cost and conflict.

## Owner hard gates (H1–H4)

1. **H1 Face & Hair** — Wireframe + shaded close-ups and genuine facial deformations; neutral/blink/smile/shout/frown or equivalent 5 distinct facial controls. Inspect eye lids, mouth, bangs, normals and target likeness. STOP for owner review before progressing to detailed full-body polish.
2. **H2 Modular turnaround** — real front/right/back/three-quarter neutral renders; wings folded/spread, bow detached; inspect garment layering, surface/UV seams, feather roots, material and triangle budget. STOP for owner review before rig/animation completion.
3. **H3 Rig & extreme pose** — hands/bow, shoulder 90°, draw/release, wing fold, hair/skirt clipping, skin-weight tests. 16 canonical moving clips and three game LODs are *delivery contract*; rig checkpoint still requires actual owner review before final effects. FBX orientation/scale measured by actual import.
4. **H4 Unity URP, skills and showcase** — reimport verified model, material/shader/animation/VFX, normal & reduced-motion FIRE_ZONE, readable board with 4×4 zone, real footage and runtime metrics. STOP for owner review before qualifying asset for production reuse. Owner approval does not waive rights or public-release gates.

At each H gate write a human-readable evidence bundle under ignored `artifacts/character-production/<id>/gates/Hn/` and a gate receipt following `assets/gate-receipt.template.json`. Only owner's explicit review of these exact output hashes advances the gate. The validator checks receipt shape and sequencing, **not the authenticity of approval**. Never infer approval from `ART_PASS_SELF_REVIEWED` or green CI.

## Technical verification and deliverables

Preserve existing `scripts/art/icarus-import-contract.mjs`, `scripts/art/icarus-unity-audit.mjs`, `scripts/pet-asset-check.mjs`, `apps/unity-client`, importer GUIDs, authoring scripts, original sources and accepted owner-design hashes. Follow `references/unity-delivery.md`; complete actual Limited asset bindings, not renamed/empty placeholders. Run genuine licensed Unity Editor checks and device-specific GPU/player profiling. Reopen `.blend`, FBX, prefab and MP4; inspect source and encoded frames. Distinguish `IMPORT_CONTRACT_PASS`, `ART_PASS_SELF_REVIEWED`, `OWNER_APPROVED`, `RIGHTS_PENDING`, `PERFORMANCE_PENDING`, `RELEASE_BLOCKED` in reports.

After any rejection, repair the controlling source, re-render same cameras, rerun changed downstream checks, record failed poses, keep prior best version and avoid infinite same-technique loops. Do not ask owner to pay for new credits, external uploads, artists or new licenses without scoped authorization. Prior owner permission for Icarus Meshy credit **does not authorize buying more credits or other Pets**.

## Finish and report

Report in Vietnamese: current HEAD; task IDs; artifacts and SHA256; separate H1–H4 status, G0–G8 stage status, source/Unity/rights/performance status; executed checks and results; owner decisions still required; next exact step. Do not merge/deploy as a side effect of model production. Do not claim unfinished work will run later.
