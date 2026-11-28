# Hydrogen production inputs

Use the authorized Hydrogen workflow for images, storyboards, video and music
inputs that previously used Gemini. Start from a specific gap in a named asset
or playable scene. Verify the available tool, model, entitlement and cost before
submitting. Preserve the brief if access or capability is unavailable. Record
the actual provider on each new receipt and retain the original attribution on
earlier work.

## Build a brief from Aetheria

Read the [Wave 1 art bible](../pet-arena/art-bible-mvp-wave1.md), [Dragon and Bird family rules](../pet-arena/art-bible-families-dragon-bird.md) and the current identity, map or animation contract. For existing scenes inspect a frame from the playable build. For social spaces preserve navigation landmarks. For battle, use a fixed side-on camera, reserve the middle for the board, and leave clear silhouettes for allies at left and the Boss at right. Treat walkable battle scenes as DEVELOPMENT_BLOCKOUT references. Send project-owned text descriptions by default. Attach only the specific reference approved for processing by this provider, with its hash and permitted use recorded locally.

Use gentle fantasy in the lighting, pacing and character acting. Preserve the original anime monster-tamer silhouettes, the element's material and motion cues, and one readable focal point. A calm Water scene can still use saturated wet blues, pale mint caustics and crisply separated masses. Give every prompt an asset ID, purpose, one concrete composition or action, identity constraints, deliverable format and a visible or audible success condition.

| Input needed | Request in Hydrogen | Handoff and review |
| --- | --- | --- |
| Standard Pet or hero reference | A clean plate for one canonical ID with an exact limb count, neutral pose, scale and material boundaries. Request a separate profile or rear view to resolve a specific ambiguity. For Icarus preserve her adult human identity, 168 cm body, pastel-pink hair, white/gold costume, and separate wing, halo and bow studies. | Compare front/profile landmarks, folds and contact points against approved references. Mark inferred surfaces. Route the accepted reference through the applicable 3D skill. |
| Environment, prop or UI artwork | Ask for the actual map landmark, camera and interaction footprint. For a symbol specify the distinct silhouette at final display size. The [Coalwhisk action sheet brief](gemini-briefs/coalwhisk-actions.txt) uses the published actions to distinguish personal Guard, party shielding and two attacks at 32 pixels. For battle use the [Tideglass](gemini-briefs/tideglass-battle.txt) and [Stormcoil](gemini-briefs/stormcoil-battle.txt) fixed-camera briefs. The earlier arrival-path study belongs to navigation development. | Identify materials, modular pieces, negative space, value contrast and Unity camera scale. Check the new in-game render beside the original. |
| Intro or skill animation | Establish keyframes first. Give the camera's start and end positions, the subject motion, the hold before a cut, and the transition back to the player. Use the [opening shot prompt](gemini-briefs/opening-v1.txt). For Icarus reference only externally approved identity images. | Compare first, middle and last frames. Inspect hands, wings, bow continuity and eye line. For skill shots the committed effect and tile area define the staging. Check skip and fallback in Unity. |
| Music or ambience | Name the map, emotion, motif, arrangement, requested length, loop point and transition cue. Example: “Central Plaza at first light in Aetheria: SoulBound. Let a flute sing a rising fourth answered by two descending steps. Soft plucked strings keep a walking pulse. End on a sustained open fifth that can meet the first bar. Instrumental, no voices.” | Save the original audio before editing. Listen to the seam twice, measure peaks and duration, compare loudness to dialogue and UI. Carry the motif into the Boss phase with a new rhythm. |
| Character action blocking | Ask for anticipation, contact and recovery poses with a fixed camera, joint orientation and weapon socket. For wing folds show the back attachment and tip clearance. | The animator checks reference frames against the actual rig in Blender and tests the clip on its Unity avatar. |

## From a submission to a candidate

1. Record the brief revision, canonical input IDs, permitted reference hashes, selected tool and any displayed model name. Keep private account information out of the record.
2. Submit once. If interrupted, inspect the existing result in the same conversation before retrying. If the feature is absent, preserve the brief for that production step.
3. Retain the actual downloaded original in the private production workspace. Record the displayed task/output ID when available, SHA-256, source format, dimensions or sample rate, duration and one specific defect or review finding. Record unknown fields explicitly.
4. Put the candidate through visual, deformation, playback or loop review as applicable. Record provider provenance and rights separately. Route a reduced public-safe preview through the review gallery only when permitted. Use private versioned storage for approved originals.
5. Keep the approved design and current in-game asset available for comparison. A concept, staging frame, technical import, rights decision and owner acceptance have separate entries. Icarus requires an explicit decision for each H1–H4 gate.

## R04 functional jewels

The owner supplied `design/05_battle_fire_zone_normal.webp` (SHA-256
`c4f4874c8903230cb6913a46028a4e2ae5726645af2d7f7fd3e9fba4a6f2ba6d`).
OpenAI ImageGen received that image directly and generated one transparent 1536 ×
1024 sheet on 28 November 2026. The provider did not report a price. The private
master is `artifacts/private-workspace/r04-jewels/provider-master.png` (SHA-256
`a1d1264705632fb709bb6c95032a1676eef8f59dee229d58acd8a768c20a3ad1`).
The first row contains gold lightning (Sword), blue droplet (Mana) and red flame
(Rage). The second contains pink Heart, cobalt Shield and amber paw (Special).
The UI kit packer takes that master as its only argument and preserves the six
existing Unity sprite names, regions and GUIDs. The default atlas has SHA-256
`9899801e283c6751746c5fa0c6e8711a65d33d737dd6aace626ff64ae97f14be`.
The separate historical Gemini candidate matches its archived atlas at
`76837c975680022d177265493a8f89a6b52c2c031f93687601ef740e371161ca`.
Owner visual approval and release remain pending.

Three reserve icons use a second ImageGen sheet derived from R04 and the six-jewel
master. Its SHA-256 is `26fe604af853af4606216d359117dbc022cba4e59ece7a9f8f0dde858057a588`.
Pass `--reference-icons artifacts/private-workspace/r04-jewels/reference-jewels.png`
to pack its leaf, snowflake and star into the existing reserve icon resources.
They have no gameplay assignment on the functional board.
