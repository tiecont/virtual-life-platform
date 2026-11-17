# Owner-design character intake

VL-105 / VL-121 / VL-149 / VL-171. DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC.
This offline reference tool complements the production bindings in PR37; it is
not an asset database, game importer, approval service or accepted art benchmark.
Use the existing Blender sources and Unity project rather than replacing them.

## Icarus review package

The [maintained intake](references/icarus/design-intake-v2.json) pins the exact
owner concept sheet and native pixel crop rectangles. It is now the primary
appearance target for this intake. PR40's battle screenshot and white/gold study
remain preserved, unaccepted historical work. They cannot approve this design.
No Meshy input was uploaded, paid job started, model produced or art accepted.

Run from the repository root with Python 3.10+ and Pillow installed:

```sh
python3 scripts/art/pet_design_intake.py --manifest specs/pet-arena/references/icarus/design-intake-v2.json
python3 scripts/art/pet_design_intake.py --verify artifacts/design-intake/pets/pet-v3-fire-icarus/owner-sheet-v2
python3 -m unittest discover -s tests/art -p 'test_*.py'
```

Open `artifacts/design-intake/pets/pet-v3-fire-icarus/owner-sheet-v2/review/index.html`
directly. No server, remote resources or public route is required. The package
includes the unchanged original PNG, 16 lossless crops, coverage and specific
owner questions. Native turnaround crops are 299 pixels tall; browser zoom or
nearby enlarged PNGs do not create additional detail. The source illustration's
view labels do not certify orthographic cameras or exact construction continuity.

The source SHA-256 is
`925d341660bf355081b2f055dbece44631c0f803a6da1d8506b1424b4fc95460`.
The original is 1672 x 941, RGB, 2,727,224 bytes. Crop boxes are integer
`[left, top, right, bottom)` coordinates in this image. No resizing, sharpening,
background removal, generative fill or interpretation is applied. No crop is
promoted to an independently approved design.

The design gate is open until ICARUS-D01 through D05 are resolved: paw/tail
anatomy, usable consistent orthographic references, hidden wing/back/hair
construction and scale, bow construction/version, and explicit owner approval.
New missing views require a design-completion revision and owner review before
generation. Never silently synthesize them. An approved design also needs
separate authorization for the exact paid generation batch.

## Immutable files and mutable processing

Keep each Pet under `pets/<canonical-pet-id>/<design-revision>/`, currently in
ignored `artifacts/design-intake/`. The directories are `concept/`,
`turnaround/`, `details/`, `meshy/`, `blender/`, `exports/`, `unity/`, `review/`
and `provenance/`. Future-stage directories are empty, not completed assets.
Keep maintained design inputs in the existing `specs/pet-arena/references/`
area. Existing Blender studies under `assets/characters/icarus/` and Unity
importer GUIDs retain their ownership and locations.

`provenance/design-<sha256>.json` is a content-addressed snapshot binding the
original, design input, exact crops, producer and review page. `package.sha256`
and `manifest.sha256` bind its index. Building the same input verifies an
existing package; changed inputs cannot overwrite that design revision. The
verifier checks every byte hash and compares decoded crop pixels with the
original. This provides tamper detection relative to the recorded digest,
not an owner signature or a defense against replacement of every checksum.
Approval must cite an independently retained snapshot digest. A relocated
source can be passed via `--source`; its exact hash must still match.

Future approvals and job/quality events are separate records referencing that
snapshot, never edits that retroactively turn intake into approval. Approval
evidence must identify owner, decision, exact snapshot and reference hashes,
resolved design questions, time and approved use. Record each quality mismatch
as FIXED, ACCEPTED, UNRESOLVED or REQUIRES_OWNER_REVIEW, with actual render hashes
and the decision authority; technical green does not grant artistic approval.

Private PostgreSQL ownership and MinIO object ingest are the separately scoped
VL-170 task, not present on this source branch. Reuse the existing migration
journal there: immutable object keys include Pet ID, design revision and content
hash; metadata stores checksums, MIME/size, ownership, processing status,
object key and approval evidence. Require actual object-byte verification,
operator authorization and bounded signed private previews. Do not create a
second database or public bucket here. Website integration uses `apps/admin-web`
under VL-165 after applicable media gates, not a new app or public publication.

## Lifecycle and gates

| Transition | Evidence required |
| --- | --- |
| OWNER_DESIGN to DESIGN_REVIEW | Supplied provenance, hashes, full sheet, five same-character angles and detail coverage; explicit omissions |
| DESIGN_REVIEW to DESIGN_APPROVED | Owner decision tied to immutable snapshot; resolved ambiguities and approved supplemental views |
| DESIGN_APPROVED to MESHY_DRAFT | Separate explicit batch/model/settings/cost authorization and current balance; never inferred from design approval |
| MESHY_DRAFT to BLENDER_REFINED | Actual draft inspection and repaired likeness/topology/UV/materials/LODs, compared to approved references |
| BLENDER_REFINED to RIGGED | Actual deformation and the canonical action contract, not only Meshy's walk/run |
| RIGGED to UNITY_VALIDATED | Actual licensed pinned Editor import and body motion in rendered frames; prefab/controller/material/VFX dependencies |
| UNITY_VALIDATED to ART_APPROVED | Explicit artistic acceptance of exact outputs; rights and hardware qualifications stay separate |

Icarus remains DESIGN_REVIEW. The CLI only builds/verifies that state and
rejects attempts to grant approval, rights or spending. It has no Meshy client
and performs no lifecycle advancement, production write or website publication.

## Meshy capability assessment

The connected MCP exposes single-image, multi-image, text, texture, remesh,
rigging, animation, status/list, usage and export/download operations. The
assessment below comes from discovered tool documentation, not an executed job.
Discover again before executing because models, parameters and prices can change.

For a game character, the proposed first test after design approval is one
single-image `meshy_image_to_3d` smart-topology job: `ai_model: meshy-t2.5`,
`model_type: smart-topology`, `should_texture: false`, `pose_mode: t-pose`,
`target_polycount: 14000`, `target_formats: [glb, fbx]`, and
`image_enhancement: false`. Estimated cost: 5 credits. This is a proposal,
not authorization, and 14,000 polygons does not guarantee a triangle budget.
Use a clean owner-approved single-character reference, never the full composite
sheet. Choose component separation only after approved wing/weapon construction.

The optional textured alternative is `meshy-t2.5` plus `texture_model: meshy-n1`,
2K, estimated 15 credits per single-image job. N1 is base color only: no PBR
maps, texture prompt, 4K/8K, quad remesh or lighting removal. Production 2K
Albedo/Normal/ORM/EmissiveMask still require Blender texturing and validation.
Do not silently add this alternative, retexture, remesh, rigging or retries to
the 5-credit proposal. Reconfirm model choice and exact batch cost before a call.

`meshy_multi_image_to_3d` accepts 1-4 views of the same object, not five, and
does not support t2/t2.5 smart topology. It cannot guarantee five-view agreement.
All five approved views remain mandatory Blender comparison references even
when only one image conditions a draft. Do not use the multi-image path as a
substitute for game topology or design consistency.

Future job records must include Pet ID/design revision/snapshot digest,
input paths/hashes, exact tool/model/settings, task ID/type, authorization,
estimate, actual consumed credits, before/after balance with timestamps,
download file hashes, real previews and errors/quality observations. A balance
delta alone cannot attribute concurrent account spending. Team usage is free
but can require Studio/Enterprise; otherwise mark per-job consumption unavailable
until provider evidence exists. Timeout/5xx after create requires listing tasks
before any retry; never recreate an uncertain charged request.

Rigging costs 5 credits and includes walking/running as separate files. It
requires a textured biped, clear limbs and at most 300,000 faces. Wing, hair,
cloth, bow IK, 74-bone budget and all 16 gameplay bindings remain Blender/Unity
work. Other library actions cost 3 credits each and must be discovered by ID.
No rig, animation, download or generation job was executed by this intake.

Free library queries returned bow hit reaction ID 150, bow-aimed forward/back
walk IDs 228/230 and their in-place variants 691/683. A `float` name query
returned no matches; this is not proof the entire library lacks hovering.
The substring search also matched an unrelated elbow strike, so inspect actual
names/previews before selection. No preset demonstrates Icarus-specific bow
draw, wing deformation or the canonical skill/ultimate contract without testing.

## Canonical integration

Use `pet-v3-fire-icarus`, Limited S, `FIRE_ZONE`, and
`v3.1/data/limited_animation_profiles.json`. Preserve its exact 16 actions,
including `normal_sword_hit` and `rage_sword_100` names even though Icarus uses
a bow. An animation or effect never writes authoritative outcomes. The kit's
five authoring clips do not replace these actions or their VFX/audio bindings.

Keep Blender 4.5 LTS, meters/Y-up transfer, 26,000-29,500 LOD0 triangles,
74 bones, at most 3 materials and 2048-square texture sets. Use the existing
Unity 6000.3.14f1 project with URP 17.3.0. LOD1/2 remain required. Preserve PR37's
complete-binding validator and PR40's actual study assets; complete hashes do
not validate likeness, deformation, rights or performance. No raw Meshy export
is production-ready. Windows qualification requires actual Windows hardware.
