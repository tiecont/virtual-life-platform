# Character performance with an existing source

## Inspect before assigning work

From the repository root run the following.

```sh
python3 .agents/skills/aetheria-hero-character-vrm/scripts/performance_intake.py
node scripts/engineering-harness/workflow.mjs run character-performance '{"allowLocalExecution":true}'
```

The first command accepts an alternate private VRM via `--vrm` and additional installed skill roots via repeatable `--skill-root`. It reports real expression bindings, eye bones, springs, colliders and resolved packages. The second records a bounded harness receipt against the current revision. Verify permissions from the actual metadata and the owner's delivery record. See the [Unity delivery contract](unity-delivery.md) and [H1–H4 gates](multi-agent-4-gates.md).

## Author by morphology and action

| Asset and input | Working method | Evidence |
| --- | --- | --- |
| Humanoid with mapped hands | Retarget the source walk to the existing avatar at authored scale. Adjust limb swing only where measured cloth interference warrants it. For a bow shot retain the grip, moving nock, elbows and release-hand trajectory in the same shot. | Same walk phase, mesh and camera before and after. Measure palm/grip and nock/free-hand distances throughout draw and release. |
| Quadruped or boss with imported actions | Bind the original skeletal clips at the rig root. Separate fore/hind contact intervals. Keep foot plants when blending locomotion. Preserve signed boss telegraph duration. | Ground contact velocity per planted paw, loop seam, attack anticipation and hit receipt. |
| Flying pet or modular wing | Keep the accepted open silhouette as the reference pose. Segment along actual shafts and relief. Preserve matched oriented faces, loop UVs and material maps. Blend skin weights across touching groups so neighboring shafts can move without opening a hole. | Matched front, rear, side and grazing views, folded/spread and at least one intermediate pose. Check physically welded components before and after LOD. |
| Face and voice | Verify independent eyelid, brow, jaw and phoneme targets. Use measured eye-bone motion when the source has eye bones. Drive bound phonemes from a rights-cleared audio timeline, with interruption returning the face to rest. | Neutral, single-control and mixed expressions. Inspect lip contact, chin drift and unintended opposite-eye motion. Unbound VRM presets require facial authoring. |
| Combat and showcase | Bind Unity presentation to an existing committed event, or explicitly mark an offline cinematic take. Use camera lead and recovery, a readable silhouette at impact, timed audio and a quiet reduced-motion version. | Compare event time, first visible response and audio cue on one timeline. Record real-time playback separately from paced offline media. |

## Material and performance review

Capture both sides under identical neutral illumination at matched exposure. Include base-color-only, full PBR and normal-disabled controls. Compare local feather colors and accent materials against approved reference views. Inspect texture dimensions, color space, culling, metallic/roughness channel conversion and foreground clipping. An overhead fixed key can leave the underside unreadable even when both UV sides carry matching colors.

For a private timed player build use a staged Icarus Recorder or private Performance scene. In the Performance scene, Space pauses or resumes playback, the arrow keys step by 1/60 second, and dragging with the right mouse button while paused orbits the character. Stepping or resuming restores the authored shot. Set `AETHERIA_CHARACTER_BENCHMARK_SCENE` to its Unity asset path, `AETHERIA_CHARACTER_BENCHMARK_PLAYER` to a fresh absolute Linux executable path, then run the installed Editor directly with `-batchmode -quit -executeMethod Aetheria.Editor.CharacterBenchmarkBuild.Build`. Run that development player under a private compositor with `-aetheria-character-benchmark`, an absolute new `AETHERIA_CHARACTER_BENCHMARK_OUTPUT` JSON path and the measured `AETHERIA_CHARACTER_BENCHMARK_REVISION`. After 60 warm-up frames it samples at least 240 frames and a full Timeline cycle. Each row includes the playhead time. Report interval p50/p95/p99, frames exceeding 16.67 ms, available CPU/GPU timings, memory and draw calls alongside device, resolution and graphics API. Unavailable counters remain unqualified. Recorder export duration measures a different workload.

For official media retain the source hashes, signed-off design gate, original animation and audio provenance, scene revision, shot timings, export size, actual frame count and QA findings. Google Flow is optional for storyboard exploration. Its monthly allowance requires specific spend approval. Final footage comes from the approved Unity scene. Render a private audition first and check the actual encoded output for clipped anatomy, unreadable action and synchronization.
