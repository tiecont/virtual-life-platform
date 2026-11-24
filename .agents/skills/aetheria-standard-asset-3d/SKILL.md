---
name: aetheria-standard-asset-3d
description: Produce or normalize Aetheria detached accessories, standard and common Pets, weapons, map environments, and props through Tripo Studio, optional Meshy, Blender 5.3, and a strict Unity asset-admission gate. Use when no Charakuru full-hero VRM workflow is required.
---

# Aetheria Standard Asset 3D

Use this skill for detached character accessories such as wings, bows, and
halos; standard/common Pets; weapons; map environments; and props. For
flagship/Limited S humanoids or key NPCs requiring a high-likeness face,
expressions, or a complete VRM Humanoid, use `aetheria-hero-character-vrm`.
These two are the only canonical Aetheria 3D-production skills.

Do not invoke Charakuru for this route. Speed comes from direct Tripo/Meshy
production, not skipped segmentation, UV, texture, topology, or validation.

Read the root `AGENTS.md`, applicable art/asset specification, import and
animation contracts, and release state before production. Run
`pnpm plan:status`. Preserve canonical IDs, scale, pivots, provenance, material
ownership, server-authoritative behavior, and owner-only art gates.

## 1. Prepare references and the production target

Select the cleanest, highest-detail, owner-authorized reference images. Hash
each source and identify exact design details, hidden surfaces, material
partitions, expected attachment, gameplay orientation, target platform, and
delivery format.

If reference art does not exist, priority 1 is the authenticated English **Tripo
Studio Image** tab with the exact model **`GPT Image 2.5`** and its free image
quota. Before every run, visibly verify `GPT Image 2.5`, zero paid credit cost,
and the remaining free counter. Use one submitted prompt per generated file;
stop at quota exhaustion and never fall back to credits without a new explicit
model, quote, and total-budget approval. Record the prompt, free counter, task ID
when exposed, output SHA-256, and review state.

Meshy MCP with **`nano-banana-pro` only** remains an optional authorized
high-fidelity image route when free Tripo generation is unavailable or the owner
explicitly requires it. Never use a Lite model. For any paid call, state the
exact model, credit cost, and total budget before spending, obtain explicit
confirmation, retain task metadata, and poll/reconcile existing jobs instead of
duplicating charges. A generated image is a concept proposal, not an
owner-authorized production reference or rights approval.

Before geometry generation, record:

- asset class and exact character/pet/prop ID;
- triangle budget and LOD target;
- material and removable-part segmentation;
- texture resolution and channel needs;
- world/object scale in meters, forward/up axes, and canonical pivot;
- socket, collision, collision-proxy, and runtime-animation requirements;
- target Unity path and current per-asset contract.

Keep new concept PNGs, provider downloads, editable sources, normalized binaries,
and review packages under `/home/tiecont/Projects/Aetheria-Workspace/`. The
repository carries source, schema, scripts and small JSON manifests; do not add
new binaries larger than 500 KiB to Git.

## 2. Produce with Tripo Studio as the default

Use Tripo Studio through **Chrome DevTools MCP** for Wings, Weapons, Standard
Pets, and every asset needing multiple materials or detailed part separation.
Reuse the authenticated English Tripo tab and a locale-neutral URL.

The full chain is mandatory:

1. **Smart Mesh** with the approved triangle budget set before generation.
2. **Segment** by material and mechanical/component part.
3. **Smart UV** with checked islands, seams, texel density, and no accidental
   overlap.
4. **Retexture** at 4K for the detailed master, or 2K only when the approved
   asset contract explicitly permits it.
5. **Export GLB or FBX** using the contract, then inspect the actual downloaded
   file. Do not accept an on-screen preview as delivery.

Do not bypass Segmentation or Smart UV to accelerate a detailed asset. Keep
provider job IDs, settings, credits, candidate choice, and source/output hashes.
Reconcile ambiguous jobs rather than resubmitting them.

**Meshy MCP is secondary.** Use it only for fast simple props/environment
objects such as rocks, chests, foliage, or furniture, or for authorized
reference-image generation. It does not replace the full Tripo chain for
multi-material Wings, Weapons, or Standard Pets.

## 3. Normalize in Blender 5.3

Reopen the exported geometry and verify:

- clean watertight or intentionally open topology with no degenerate faces,
  hidden duplicate shells, inverted normals, or floating debris;
- clean UV islands and material segmentation that match the approved parts;
- exact game scale and axes; apply transforms only after confirming the export
  contract and root behavior;
- canonical pivot at the functional origin: Wings at the back-emblem center,
  Bow at the grip, Halo at its head attachment, and props at their attachment
  or contact point;
- socket direction/orientation, attachment clearance, and animation/collision
  bounds;
- retained textures, normals, roughness/metallic/AO channels, alpha mode, and
  correct color spaces.

Remove broken zero-thickness bowstrings; render the string in Unity with
`LineRenderer` using the approved endpoints. Do not replace them with visible
AI mesh rods.

## 4. Enforce poly and quality budgets

Raw or brute-force reduced AI meshes are forbidden in Unity `Assets/`.

| Asset class | Triangle budget |
| --- | ---: |
| Props and Weapons | 3K-12K tris |
| Standard Wings and Standard Pets | 10K-25K tris |
| Hero / Limited S modular wing candidate | <=28K tris at LOD0 |

Apply the same prop range to each environment object unless an existing
per-asset contract defines a tighter target. Record the LOD0/LOD1/LOD2 budget
before generation. A 200K-700K-vertex source or an unsegmented decimated mesh
must be retopologized, segmented, or rebuilt; reducing a slider until the count
passes is not acceptable. Optimize silhouettes, clean topology, UVs, and normal
baking without collapsing detail or material separation.

The 28K hero-wing figure is an upstream candidate ceiling, not an assembled
character allowance. Retopology, baking and final integration must still satisfy
the current per-character LOD contract; for Icarus that is 26,000-29,500
triangles for the complete LOD0 assembly including approved modular accessories.

## 5. Hard Unity admission gate

Before staging any file under `apps/unity-client`, all of the following must
pass:

- built from the approved source revision and provider job/credit ledger;
- correct scale, axes, pivot, sockets, materials, normals, UV islands, and
  texture assignment;
- verified triangle counts within the applicable budget;
- glTF/FBX/GLB validation plus a clean actual import in Blender 5.3;
- SHA-256 of the exact source export and delivered file;
- owner review where the asset is part of character/Pet production;
- no server/gameplay state encoded into the asset.

Record the exact source, exported, and Unity-staged hashes. Stage only the
approved normalized asset, not provider scratch data, high-poly candidates, or
broken decimation attempts.

Use `scripts/art/blender_normalize_r2_batch.py` for batch normalization when it
is present on the checked-out revision. It must measure the actual exported
triangle count, normalize scale/pivot, generate the exported file SHA-256 and
write schema-compatible `assets/manifests/<asset-id>.manifest.json` entries. A
manifest is transport metadata, not visual, rights, Unity or publication
approval.

For character and Standard Pet work, preserve the repository's H1-H4 owner
review sequencing: design/face where applicable, modular turnaround, rig and
extreme poses, then Unity URP/VFX and runtime review. A technical or CI pass is
never owner approval. Detached props and environments still require honest
visual/technical acceptance, but non-character assets do not invent
character-only gates.

## 6. Runtime integration and finish

Use modular sockets and event-driven presentation. Character Wings attach to
`UpperChest`, Halos to `Head`, and Weapons to the approved hand socket. Wings
default OFF and may enable only for an authoritative Ultimate presentation
(`Signature` / `FIRE_ZONE`) when that contract applies. VFX and animation may
present server state but must not create it.

Inspect the imported asset in Unity URP, including pivot, scale, attachment,
material/shader behavior, clipping, and any animation or collision proxy.
Preserve `DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC` until separate rights,
hardware, release, and owner approvals change the applicable state.

Report in Vietnamese: source revision; task/asset ID; production route and
credits; source/normalized/Unity paths; SHA-256 values; measured triangle and
material counts; actual commands and results; owner-review status; remaining
visual/rights/performance risks; and the next exact action. Never claim a Unity,
Blender, provider, or governance check that did not actually run.
