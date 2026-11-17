---
name: aetheria-character-production
description: Produce or refine Aetheria game characters from reference images through Blender modeling, textures, rigging, animation, Unity URP integration and delivery. Use for reference-matching character work, visual quality review or an artist handoff; exclude ordinary gameplay code and unrelated Blender scenes.
---

# Aetheria Character Production

Turn supplied references into an editable, visually reviewed character and a
working Unity asset package. Blender is the default creation tool. Installing
this skill does not mean a character or the production process passed acceptance.

## Start And Resume

1. Follow repository `AGENTS.md`, read `README.md` and
   `config/development-plan.json`, and run `pnpm plan:status`. Locate the current
   character worktree/assets before creating replacements. Preserve owner edits
   and work already done on other branches.
2. Read [production-gates.md](references/production-gates.md) for the stages and
   delivery contract. Read [style-and-rework.md](references/style-and-rework.md)
   when establishing appearance, reviewing renders or repairing a failed gate.
3. Inspect supplied image files. Resolve canonical character ID, roster, actions
   and opcode from current repository data. Limited Icarus belongs to VL-149 and,
   where present, VL-171; VL-160 is the distinct Standard S roster. Shared
   pipeline conventions belong to VL-105 and asset contracts to VL-121.
4. Use [character-brief.template.json](assets/character-brief.template.json) to
   capture stable design inputs in the existing character art specification. It
   is an intake template, not a replacement asset manifest. Fill inferred fields
   from current kit/contracts and state assumptions. Ask only for consequential
   missing information that cannot be inferred; an image-only prompt should
   normally be enough to begin.
5. Resume from the earliest failed or untested gate. Read previous checks at their
   recorded source SHA; rerun checks affected by changed source or unresolved
   failures. A procedural study is reusable source, not an accepted style anchor.

## Blender Capability Check

Use the installed Blender plugin/MCP and local Blender toolchain first. Discover
actual callable tools and read their documentation; do not invent tool names or
assume a previous session is connected. Confirm a real connection by inspecting
the current scene and Blender version. Probe edits belong in a separate owned
scene/file, preserving open work. If plugin access is unavailable, use an installed
Blender background/bpy route and say which route actually ran.

Blender supports modeling, sculpting, UVs, painting, rigging and animation. The
plugin exposes control; it does not itself prove image-to-3D generation, image
generation or reference-quality artistry. Address visual defects using available
operations. External generation is optional and must be actually connected and
within the user's existing provider, rights and spending authorization. Do not
purchase services, enable paid generators or upload references merely because
this skill was invoked. Continue with Blender and the rework policy when such a
tool is unavailable; never pretend generated assets exist.

## Execution

- One agent performs engineering, technical art and character art duties. No
  delegation or second reviewer is required. Do not contact or hire an artist
  without an explicit instruction.
- Follow reference/design views, base mesh, detailed model, game topology/UVs/
  textures/LODs, rig/skin, required animation, Unity integration and delivery.
  Repair upstream defects before dependent polish; reuse valid existing stages.
- Compare actual neutral-lit renders to references at visual gates. Hashes,
  polygon counts and green CI cannot pass an art gate. Use
  `ART_REVISION_REQUIRED` when likeness or finish is visibly insufficient.
- Establish a candidate style target. Only a pilot that passes actual visual and
  technical checks can become a reusable benchmark. Label autonomous acceptance
  `SINGLE_AGENT_SELF_REVIEW`; claim owner approval only when it exists. Do not
  add routine approval pauses to already-authorized autonomous offline work.
- Keep reference/source/export/import hashes in existing asset contracts. Never
  fill missing action/material/VFX/audio bindings with stills, fixture bytes or
  renamed copies of another action.
- Keep maintained designs, sources, assets and backlog in Git. Fresh probes,
  comparison reports, intermediate renders, logs and handoff archives belong in
  ignored `artifacts/`. Record source SHA, actual checks and open gates in the
  relevant task; do not create another backlog or session diary.
- Preserve `DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC` and release gates.
  Presentation never writes authoritative gameplay outcomes. Source merge does
  not authorize publication or production deployment.

## Finish

Deliver only the scope that actually passed, linking editable source and real
previews. If full production was requested and a gate remains open, mark delivery
partial and name the blocker. Follow bounded repair/artist handoff instead of
declaring a rough study final. Report task IDs, changed areas, actual checks,
source SHA/PR if any, limitations and next exact action in Vietnamese. Do not
imply continued work after the turn ends.

Example invocation:

```text
$aetheria-character-production
Lam Icarus theo cac anh tham chieu dinh kem, sat khuon mat, toc, canh va trang phuc.
Dung Blender da ket noi, tu review va sua trong pham vi offline da cho phep.
Ban giao nguon Blender, asset Unity URP va video; bao dung cac cong chua dat.
```
