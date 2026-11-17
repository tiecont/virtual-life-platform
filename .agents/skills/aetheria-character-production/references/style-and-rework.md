# Style Standard And Rework

## Establish The Standard

Use Icarus as the initial Limited pilot. Existing procedural blockouts and
white/gold studies are not accepted golden assets. Until a pilot actually passes,
the style target is `UNVALIDATED_TARGET`; writing this skill does not validate it.

Keep stable style decisions in the character's existing art specification with
reference paths/hashes and one primary reference. Capture:

- Identity/anatomy: adult/creature proportions, head/body balance, facial shapes,
  hands and attachment points.
- Shape language: hair rhythm/asymmetry, feather/scale/cloth construction,
  costume layers, ornament hierarchy and simplification at game-camera scale.
- Materials: base palette, shadows/highlights, roughness/metallic breakup,
  translucency and emission. Elemental color is not the entire costume palette.
- Motion: expression, posture, weight, anticipation and appendage follow-through.
- Presentation: neutral inspection lighting, consistent cameras, close-ups and
  target game-camera scales; effects must not hide underlying model defects.

Icarus's current owner target is a refined bright anime-fantasy celestial archer:
soft expressive adult face, flowing pastel-pink hair, layered white/gold dress,
delicate ornaments, broad white feather wings and a gold bow. Phoenix/fire
effects are separate VFX. Inspect the supplied image and read
`specs/pet-arena/icarus-art-direction.md` if present. Do not force this human
silhouette onto other characters or quadrupeds.

One image can establish the target and start modeling. Hidden views are new
design proposals, checked against visible design. Request another view only when
a consequential ambiguity exceeds authorized design freedom. Do not invent a
likeness percentage or promise pixel-identical reconstruction from an illustration.

## Review Actual Outputs

Compare references and neutral renders side by side at comparable framing.
Inspect silhouette, face, hair, costume and appendages in close-up and at game
scale; inspect side/back views even when newly designed. Use these results per
visual area:

| Result | Meaning And Next Action |
| --- | --- |
| NOT_REVIEWED | Missing inspection/view; produce and inspect it before acceptance |
| ART_REVISION_REQUIRED | Visible identity/construction/finish/motion gap; repair its source |
| ART_PASS_SELF_REVIEWED | Actual outputs meet the target under authorized single-agent review; retain exact reviewed hashes and limitations |
| ARTIST_HANDOFF_REQUIRED | Important gap persists after bounded repair or required capability is unavailable; prepare an actionable handoff and report partial delivery |

A serious focal failure cannot be averaged away: wrong face/age impression,
plastic rod-like hair, metallic spikes replacing feathers, tube joints, muddy
costume layers or obscuring VFX all require repair regardless of technical PASS.

Only after the pilot passes visual review, full requested bindings, deformation
and real Unity inspection may it become a `VALIDATED_OFFLINE_BENCHMARK`. Record
the design revision/hashes in existing specs/manifests and actual checks in the
backlog. Label `SINGLE_AGENT_SELF_REVIEW` or actual owner approval accurately.
Benchmark validation does not authorize publication or confer rights/hardware
acceptance. Future characters reuse quality/shading/texture/deformation standards,
not the pilot's identity or actions indiscriminately.

## Bounded Repair

1. Identify the visible defect and likely source: proportions, silhouette,
   topology, weights, texture, shader, light or pose. Fix structure before
   decoration. Preserve the best previous source.
2. Make a targeted Blender/plugin/bpy edit with a stated visible objective.
   Render affected views and compare before/after under the same conditions.
3. If unresolved, change technique: reshape overlapping hair clumps, sculpt/
   paint the face, rebuild feather vanes or correct topology/weights. More
   triangles/subdivisions alone are not evidence of improvement.
4. Default to at most three meaningful attempts on the same blocking gap per run.
   Stop earlier for a clear capability/input limitation; honor explicit user
   budgets or later instructions to continue. Keep iteration logs/comparisons
   under ignored artifacts; retain stable design decisions in maintained specs.
5. If still unresolved, use `ARTIST_HANDOFF_REQUIRED` for that area, preserve
   useful work and prepare the package below. Continue independent authorized
   work, but do not replicate a failed pilot across the Limited roster.

## Artist Handoff

Prepare the package locally under ignored `artifacts/`. Include actual referenced
files instead of dangling workstation paths:

- Best Blender source, exports, textures and rig/actions, exact hashes, tool
  versions and opening/export instructions.
- Supplied references, neutral renders/close-ups and comparisons identifying
  unresolved defects; preserve provenance/rights labels.
- A concise work order with corrections, design decisions to preserve, budgets,
  required actions, integration constraints, expected outputs and acceptance checks.
- Completed reusable parts and missing deliverables. A handoff package does not
  mean an artist has been assigned or a character is complete.

Report its path and next required action. Contacting/hiring anyone, external
uploads and new spending need applicable user authorization; the skill itself
does not grant it. When a revision returns, inspect likeness/source/provenance and
resume affected gates without resetting valid work or inventing prior approval.
