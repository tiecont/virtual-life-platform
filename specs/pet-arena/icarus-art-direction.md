# Icarus Visual Target

VL-121 / VL-149 / VL-171. DRAFT_ONLY, OFFLINE_ONLY, NO_GO_PUBLIC.

The owner-supplied [battle reference](references/icarus/owner-battle-reference.png)
is the primary appearance reference for Icarus. It supersedes the crimson-armored
procedural blockout as an appearance target. Preserve the older study as an
unaccepted technical experiment; do not replicate it to the other Limited Pets.
The [white/gold Blender study](../../assets/characters/icarus/white-gold-study/README.md)
now has editable source, rigged GLB/FBX exports and an actual Unity URP motion
preview. It is an unaccepted draft: face, anatomy, hair, costume and feather
construction still fall short of the supplied illustration. No revised concept
drawing or approved turnaround has been produced.

## Character

- Adult female celestial archer with an elegant anime silhouette and expressive
  eyes. Retain a soft face, readable nose and mouth, shaped eyelids and irises.
- Long flowing pastel-pink hair, including separated bangs and layered locks.
  Hair should frame the face and follow the action with clear overlapping arcs.
- Predominantly white fitted fantasy dress and light armor with fine gold trim,
  small pink accents, layered cloth, translucent drapes and ornamental jewelry.
  Avoid a red armored bodysuit, oversized spherical pauldrons and segmented toy
  anatomy. Kit fire colors remain elemental accents, not the entire costume.
- Large white feathered angel wings with a visible shoulder attachment,
  overlapping feather rows and warm golden edges. Feathers must read as broad
  feather shapes, rather than thin metallic spikes or a radial fan of rods.
- A finely shaped gold ceremonial bow; retain the archer identity even when
  the reference pose opens both arms for the cinematic.

The screenshot is not a complete turnaround. Back costume, side silhouette,
obscured anatomy and bow details require new design work; do not describe
invented views as extracted facts from the reference.

## Effects And Arena

Golden solar rings, a phoenix silhouette, upward embers and warm fire columns
belong to the cinematic VFX. Keep those separate from white wing geometry and
costume textures. The screenshot is a visual reference, not executable rules:
canonical FIRE_ZONE remains a 4x4 marker lasting two turns. Do not turn the
full-board fire illustration into additional gameplay damage or tile mutations.

The stationary 10x10 board, tile identities, enemy telegraphs and controls must
remain readable. Supply a reduced-motion presentation with bounded brightness,
fewer particles and no sweeping camera or repeated full-screen flashes.
Use Aetheria: SoulBound branding; do not copy the old Aetheria wordmark or
unvalidated screenshot health values, skills or interface copy.

## Remaining Art Deliverables

The production skill is invoked for a new offline reference-matching pass.
Character ID is `pet-v3-fire-icarus`; canonical opcode remains `FIRE_ZONE` and
the required action profile is `v3.1/data/limited_animation_profiles.json`.
Primary appearance reference remains the hashed owner battle screenshot above.
No new attachment was persisted in this request; reuse that reference rather
than silently reverting to the kit's older appearance. Back/side costume,
unseen hair construction and bow details are explicitly design proposals.
Requested output is editable Blender source, Unity URP assets and actual motion
video. The reusable style target is still `UNVALIDATED_TARGET`, with no accepted
design revision or owner acceptance. This pass first addresses the failed visual
design gate: face proportions, hair silhouette, feather shape and layered dress.
Three targeted repair attempts per unresolved visual gap are allowed before a
local artist handoff; no external provider or spending is selected.

Produce a full-body character concept and face detail matching the
reference, then consistent front/side/back orthographic views in a neutral pose
with wings spread. Use a plain neutral backdrop, even lighting and no interface,
enemy, fire overlay or title obscuring the character. Keep hair, cloth, wings,
bow and jewelry legible for modeling.

Refine the draft mesh and skinning after visual review, then author production
UVs, textures and canonical action bindings. The white/gold study retains the
26k-29.5k LOD0 budget, 74 bones, three materials and five authoring actions. Unity
renders all five study clips and a neutral turntable in a 49-second preview.
These technical
checks do not establish art acceptance, all sixteen gameplay actions, production
Shader Graph/VFX, Timeline/Cinemachine or player performance qualification.
Revision 06 replaces tube hair with curved clumps and asymmetric bangs, adjusts
face/neck proportions, corrects mirrored feather curvature and rebuilds folded
trains. Saved review materials, prefab and a five-state controller are separate
from the unfilled production bindings.
The source inspection counts are in its import settings. Keep judging the face,
silhouette and costume against the supplied screenshot, not only file budgets.

Current visual review is `ARTIST_HANDOFF_REQUIRED`, `SINGLE_AGENT_SELF_REVIEW`.
Two targeted visual repair passes were inspected; the face remains generic,
hair too strip-like, feather roots tubular and cloth insufficiently draped.
The technique has not reached the required focal finish, so stop this run's
procedural rework and preserve the best source for sculpt/paint correction.
G1-G3 do not pass; G4 production UV/bakes/LODs, G5 deformation acceptance,
G6 full actions and G7 cinematic/VFX remain open. A local handoff contains the
real source/exports/Unity package, reference, comparisons and correction order;
it does not constitute artist assignment, production completion or a benchmark.

## Concept Generation Brief

Use case: stylized-concept.
Asset type: Icarus character concept for Blender modeling.
Input image: owner battle screenshot, appearance and visual-style reference.
Primary request: depict the same adult celestial archer identity, long pastel
pink hair, expressive anime face, white-and-gold layered dress armor, delicate
gold ornaments, large layered white feather wings with gold edging and a gold
bow. Show the entire character including wing tips and feet, with a small face
detail on a neutral background. Match the reference's refined bright anime
fantasy illustration quality; keep cloth, anatomy and feather construction clear.
Avoid: red armored bodysuit, toy proportions, primitive oval limbs, blank glowing
eyes, spiked metallic wings, battle interface, logos, dragon, fire covering the
outfit, cropped feet or wing tips. New hidden design details remain proposals.

No generated image or external image-to-3D service was used for this study.

## Current Charakuru export

The owner identified the existing Charakuru product as the Icarus development baseline. Open the existing local Charakuru project in Motion preview. Its project ID is `a462e9ff-57da-4e45-9b13-7ba81414f6e0`. The saved export `exports/avatar.vrm` and Unity's `Assets/Aetheria/ArtStudies/Icarus/Source/Icarus.vrm` have SHA-256 `f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a` and 16,892,316 bytes. The VRM 1.0 export contains 54 mapped humanoid bones, one skin, eleven meshes, five embedded images and no mesh morph targets. The character is visible in the [actual Charakuru motion preview](../../assets/review/wave-d4/characters/icarus-charakuru-motion-preview.webp).

Use this export for runtime binding and motion qualification. The older H1 R3 package records a separate face and hair study. Its outstanding approval applies if that revision is proposed for adoption. Keep new design acceptance, expression work and media rights scoped to the relevant delivery.
