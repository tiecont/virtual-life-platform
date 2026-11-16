# Standard S animation production contract

Six draft profiles in `v3.1/data/standard_animation_profiles.json` bind the
canonical240 manifest. All asset paths are planned, all assets MISSING.
Reuse the existing battle asset validator/import pipeline when binding real
files; supply source/runtime/import hashes and provenance. No fabricated hashes.

Use floating lantern, radial bell/tendrils, avian wings, spectral mask/veil,
six-legged alternating-tripod and quadruped deer rigs respectively. Overrides
must pass skinning/deformation and locomotion tests; no forced humanoid mapping.
Each requires idle, move, summon, normal sword hit, Rage100, skill anticipation,
hurt, guard, status, victory, defeat and world-follow clips with distinct normal
and rage bindings. Use emissive materials with readable low-flash fallbacks,
shared pooled VFX and original audio matching each profile's sound brief.

Typed event IDs (match/version/ordinal) drive playback and dedupe. Skip, reconnect,
slow playback or missing VFX cannot change results. No animation callback commits
damage or rewards. Fixed10x10 board stays visible/stationary during normal skills;
ultimate clears/refills only follow committed Rust tile diffs. No Standard
signature card, exclusive opcode or mandatory Limited-scale camera timeline.

Candidate per-Pet budgets: LOD0/1/2 triangles24000/12000/3000, max64 bones,
three materials,2048px textures,256 particles and four audio voices. Measure
CPU/GPU p95/p99, memory, shader warmup and crowd-companion load in actual Unity;
these budgets are not performance results. Validate at720p/1080p, reduced motion,
colorblind cues and gamepad navigation. Outside Arena, owner-only eligibility,
zone permissions, privacy, obstacle avoidance, teleport recovery, distance LOD
and crowd culling gate the shared follow controller.

Limited S retains dedicated original camera/cinematic/VFX production. Standard
S must still have polished silhouettes and useful endgame kits. Acceptance needs
editable source, original/licensed provenance, real Linux Editor/player motion,
combat/world integration and separate physical Windows qualification.
