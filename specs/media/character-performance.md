# Character performance and cinematic production

The Icarus study uses the existing Charakuru VRM, its Humanoid mapping and the approved game audio. The private performance scene binds the original actor to a living idle and retargeted locomotion. A second Animator owns the camera rig. A Timeline AudioTrack owns voice playback through the Voice mixer group and a synchronized control track owns the particle cue. Keep the actor, prop contact points, camera and effects on the same scene clock. The private take can be evaluated at fixed times, independent of playback frame rate.

A production combat view consumes an existing committed gameplay event. Nest authorizes the action, Rust executes its published configuration and Unity presents the result. Cinematic tracks have no authority over hits, elemental strength, cooldowns or rewards. An offline performance can prototype anticipation, contact and recovery before game integration.

## Shot and asset review

| Stage | Authoring and acceptance |
| --- | --- |
| Portrait | Frame the eyes in neutral. Compare gaze, eyelids, chin and mouth at identical camera poses. Validate real vertex displacement and recovery to neutral before admitting a facial target. |
| Locomotion | Crossfade the breathing pose into the imported walk and back. Check foot plants against actor travel, pelvis stretch, clothing intersections and both silhouettes at matching phases. |
| Weapon and wings | Use the approved source meshes. Preserve the open wing outline, feather colors and visible shafts. Test fold, intermediate and spread poses under neutral and grazing light. Test both palms against grip and nock through draw, release and recovery. Obtain H2 approval before the dependent action. |
| Skill and Ultimate | Articulate the anticipation and release around a visible committed event, with readable effects at gameplay distance. Keep a quiet view for reduced motion. Verify the audio transient against its intended frame. |
| Showcase | Widen from portrait to full body for the voice and particle beat, then return to rest. Keep the original scene, sound identity, mix, frame sequence and measured duration together. Preview at 960×540/24. Use the 3840×2160/60 offline profile only when the actual output is inspected. |

For technique study, the official Remielle demo and its production interview are primary references. Aetheria's own review focuses on gaze before body motion, readable holds and accents, and framing that leaves room for wings and weapon. The reference publisher is recorded separately from Aetheria asset provenance. [Character demo](https://www.youtube.com/watch?v=ZOHQFFSFtHc) · [Production interview](https://www.youtube.com/watch?v=ZDF7WGT6VZs)

## Reusable tools

Run the engineering harness workflow `character-performance` to inventory the exact VRM and installed packages. The hero skill includes separate standards for humanoids, flying creatures, quadrupeds and bosses. The standard asset skill owns detached weapon, wing and Pet intake. The historical character-production skill was renamed and consolidated at revision `532f255b`. Its Charakuru intake and H1–H4 checks live in the hero skill. The campaign changes to all three skills and the workflow entered at `8ca82c16`. An intake with additional host roots enumerates each installed skill and path. [Hero authoring and performance](../../.agents/skills/aetheria-hero-character-vrm/references/character-performance.md)

Use `IcarusPerformanceStage` to stage private editorial takes. `VrmFaceCueTrack` requires an exact voice clip identity, matching audio timing and usable VRM morph bindings. `CharacterBenchmarkBuild` and `CharacterFrameBenchmark` measure a standalone player on its actual rendering device. Record resolution, rendering API, p50/p95/p99, over-budget frames, CPU/GPU timing availability, memory and draw calls. Inspect composition and deformation independently of timing. Retain private artifacts under the ignored campaign directory. Verify redistribution rights and owner gate separately before publishing a Web preview.
