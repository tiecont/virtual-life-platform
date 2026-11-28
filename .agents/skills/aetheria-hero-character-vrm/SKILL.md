---
name: aetheria-hero-character-vrm
description: Produce or revise Aetheria flagship and Limited S humanoid characters and key NPCs that need high-likeness faces, expressive VRM Humanoid rigs, modular accessories, and Unity URP delivery. Use for complete hero character production, not detached props, standard Pets, environments, or gameplay code.
---

# Aetheria Hero Character VRM

Use this skill for flagship/Limited S humanoids and key NPCs such as Icarus.
For detached accessories, standard/common Pets, weapons, maps, environments,
or props, use `aetheria-standard-asset-3d` instead. These two are the only
canonical Aetheria 3D-production skills; do not recreate a legacy alias.

Before production, read the root `AGENTS.md`, `README.md`,
`config/development-plan.json`, the character's art direction and animation
contracts, then run `pnpm plan:status`. Preserve owner-provided identity,
rights/provenance, canonical IDs, opcodes, action names, import contracts, and
release state. Keep new source artwork and editable production handoffs under
`/home/tiecont/Projects/Aetheria-Workspace/`; commit only source-safe files.
Skill installation does not establish an accepted benchmark, owner approval,
publishable rights, or deployment permission.

## H0 source and reference preflight

1. Start from the owner-authorized clean full-body **A-pose illustration**. The
   hero body source must have no wings, floating halo, or held weapon. Preserve
   wings, halo, and weapon references separately for modular production.
2. Reconcile the exact character ID, design revision, target height, palette,
   required expressions, animation profile, Unity/URP version, and current
   per-character LOD/import contract. Hash every accepted source.
3. Treat unseen angles and generated details as design proposals. Stop on an
   identity, anatomy, attire, provenance, or material conflict that cannot be
   resolved from an owner-authorized reference.
4. For a complete seven-file intake, run:

   ```sh
   python3 .agents/skills/aetheria-hero-character-vrm/scripts/preflight.py \
     /path/to/character-input --profile icarus \
     --output artifacts/character-production/<character_id>/intake-preflight.json
   ```

   `STRUCTURAL_PREFLIGHT_PASS_NOT_ART_APPROVAL` proves structure only, never
   likeness, pose quality, ownership, or rights.

## Reference concept inputs

Use the [Hydrogen production workflow](../../../specs/media/hydrogen-production.md) for optional clean plates, pose studies, reference gaps and cinematic keyframes. Preserve the approved H0 identity and each dependent H1–H4 gate.

For the free Tripo alternative, use the authenticated English Tripo Studio Image tab.
Select the exact model **`GPT Image 2.5`** and use the free image quota only.
Before each submission, visibly verify the model and that the run has zero paid
credit cost; use one submitted prompt per generated file so provenance and
canonical identity cannot be mixed. Stop when the free quota is exhausted,
authentication changes, or the UI would charge credits. Never fall back to a
paid run without a new explicit model, quote, and budget approval.

Save concept PNGs with descriptive canonical IDs in the production workspace and
record the actual prompt, free-quota counter, task ID when exposed, file SHA-256,
and review state. A generated concept is an unapproved design proposal. It does
not replace an owner-authorized A-pose body reference, approve likeness, or
replace the mandatory 11-view Meshy gate below. Generic or invented views remain
proposals until the owner accepts them.

## Mandatory 11-view Meshy gate

Use the connected **Meshy MCP `image-to-image`** workflow and the model ID
`nano-banana-pro` only. Never substitute a Lite model. If `nano-banana-pro` is
not available, stop and report the connector gap.

Before spending, state the exact model, credits per call, and total estimate
for all 11 views. Obtain explicit confirmation once for that request and
budget. A timeout, interrupted poll, or ambiguous result requires job-history
reconciliation, not a duplicate paid submission or an unauthorized top-up.

Generate one view per call from the approved A-pose source and save the
decoded RGB PNGs under:

```text
/home/tiecont/Projects/Aetheria-Workspace/characters/<character_id>/charakuru_views/
```

An existing reviewed checkout may retain its already-approved source path. New
binary intake defaults to the production workspace so images and editable
sources do not enter Git accidentally.

The exact 11 files are:

| Group | Files |
| --- | --- |
| Head | `head_front.png`, `head_left.png`, `head_right.png`, `head_back.png` |
| Body | `body_front.png`, `body_left.png`, `body_right.png`, `body_back.png` |
| Full-body balance | `three_front.png`, `three_right.png`, `three_back.png` |

Keep the entire head and hair silhouette in each head view, the complete
clothed A-pose body with hands and feet visible in each body view, and matching
canvas/height/foot baseline in the balance views. Exclude wings, halo, and held
weapons from these baseline images. Decode every file, inspect subject,
direction, framing, background, asymmetry, and source fidelity, and preserve
the actual prompts, task IDs, and SHA-256 values.

## Mandatory Charakuru to VRM pipeline

Operate Charakuru at `http://127.0.0.1:8766` using the installation returned by
the fresh app request. Use this exact sequence:

**Charakuru registration → Tripo Smart Mesh → Segment → Smart UV → 4K
Retexture → Blender 5.3 weight transfer → SpringBone → Expressions → VRM 1.0**

Use Blender 5.3 for new retopology, weight transfer, accessory fitting, and
export. Existing Icarus sources authored in Blender 4.5 remain valid source
history; opening, saving, or upgrading them is a version migration that requires
an explicit owner/technical decision and a new hash. Do not silently replace the
pinned source.

1. Run `node scripts/agent-session.mjs begin <url> <exact_request_id>` exactly
   from the installed Charakuru directory **once only per request ID**.
   Resolve that directory from the fresh app request. Require a confirmed save
   and the returned instructions before work. Never invent a request ID, repeat `begin` after a
   successful response, or create a duplicate `project.charakit`; update the
   single canonical file and report progress with the same request ID.
2. Register the 11 verified views, reopen the project, and stop for the
   Charakuru image review required by the kit.
3. After owner review, generate Tripo Smart Mesh candidates and stop for owner
   selection. Continue through Segmentation, Smart UV, and 4K Retexture; do not
   skip a stage because the mesh "looks close".
4. In Blender 5.3, transfer and inspect body weights, validate hair/cloth/wing
   spring setup, author independent functional expressions, test deformation,
   and export VRM 1.0 with Humanoid mapping and required expression/speech
   blendshapes.
5. Preserve editable source `.blend`, the canonical `.charakit`, provider task
   metadata, 4K source textures, and export hashes. Resolve missing materials,
   unweighted vertices, duplicated face controls, bad normals, or rig mismatch
   before Unity admission.

Keep every use of `begin` scoped to the exact fresh request. If the request
expired, the save was not confirmed, or the ID differs, stop and request a new
app prompt.

## Owner hard gates H1-H4

Character production requires explicit owner review at each dependent gate.
Use [multi-agent-4-gates.md](references/multi-agent-4-gates.md) for evidence
and receipt structure and [icarus-presentation.md](references/icarus-presentation.md)
for Icarus presentation bindings.

| Gate | Stop condition |
| --- | --- |
| H1 Face and hair | Owner reviews wireframe/shaded face, neutral and independent blink/smile/shout/frown deformation, hair roots, normals, and likeness before body polish or rig completion. |
| H2 Modular turnaround | Owner reviews front/right/back/three-quarter renders, layered costume, UV/seams, feather roots, folded/spread wings, detached bow, and measured budgets before dependent rig work. |
| H3 Rig and extreme poses | Owner reviews hands/weapon contact, shoulder/draw/release, wing fold, cloth/hair penetration, weights, actual reimport, and controls before final Unity effects. |
| H4 Unity URP | Owner reviews actual materials/shaders, cloth, four VFX tiers, normal/reduced-motion `FIRE_ZONE`, readable board, footage, and measured runtime before production reuse. |

Record source revision, exact artifact hashes, commands, reviewer, owner
approval reference, blockers, and prior receipt hash. Technical PASS, green CI,
or self-review never substitutes for owner approval. A change to gated source
reopens every affected downstream gate.

## Hard Unity admission gate

Only stage a `.vrm` 1.0 file into `apps/unity-client` when all of these are
true:

- Load the VRM metadata and verify `allowModification` is enabled, the required
  commercial-use rights are enabled, and `redistribution` is **false**. Filename
  or manifest text is not proof; inspect the exported metadata.
- Record and re-verify the `.vrm` SHA-256, source revision, design approval,
  provider task/credit record, rig/import mode, and exact staging path.
- Reopen the VRM, confirm Humanoid bone mapping, expressions, springs,
  scale/orientation, materials, and required actions. Do not stage a corrupt,
  unlicensed, redistribution-enabled, or unverified export.

If an existing per-character Unity contract names a different import mode,
do not silently migrate it. Reconcile and validate the contract, importer,
tests, and owner decision before staging.

## Unity URP assembly

- Keep wings, halo, and held weapons as separate modular assets. Attach wings to
  `UpperChest`, the floating halo to `Head`, and weapons to the approved hand
  socket (`Hand`; use the right/left hand required by the action contract).
- Cap a separately generated Hero/Limited S wing candidate at **28,000
  triangles** at LOD0. Measure and report wing-only versus assembled totals;
  28K is a provider candidate ceiling, not an assembled-character allowance.
  Retopology must still meet the current per-character contract. Icarus remains
  26,000-29,500 assembled LOD0 triangles including approved modular accessories.
- Wings default **OFF**. Enable them only while the authoritative Ultimate
  presentation is active (`Signature` / `FIRE_ZONE`). Do not invent an event,
  damage state, target, or gameplay outcome in VFX.
- Final cloth uses `Magica Cloth 2`; shaders use reviewed `lilToon` or URP
  materials. Author the four VFX tiers (Summon, Normal, Rage, Signature) and
  reduced-motion presentation in Unity URP, not Blender mock geometry.
- Preserve the current server-authoritative `FIRE_ZONE` state and board
  readability. Presentation may never mutate combat state.

Use [unity-delivery.md](references/unity-delivery.md) for current Icarus LOD,
joint, material, texture, import, action, and verification contracts. For tool
selection and owner-assembly sequencing, use
[source-routing.md](references/source-routing.md); for rework/artist handoff use
[style-and-rework.md](references/style-and-rework.md), and for technical
stages use [production-gates.md](references/production-gates.md).

## Finish

Verify actual files rather than labels: reopen `.blend`, `.charakit`, VRM,
textures, and Unity assets; inspect skinned motion and encoded video; measure
budgets on named hardware when claimed. Run the relevant repository,
governance, validator, art, and Unity checks without weakening assertions.

Report in Vietnamese: source revision; task IDs; exact artifact paths and
SHA-256; H1-H4 and technical-gate status; executed commands/results; owner
decisions still required; rights/performance status; remaining risks; and the
next exact action. Keep `DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC` unchanged
until separate approvals explicitly change release state.
