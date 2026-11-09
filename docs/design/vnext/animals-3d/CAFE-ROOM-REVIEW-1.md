# Cafe room detail review 1

Task N06-04; 2026-11-09. Technical art checkpoint, not final art approval.

`packages/scene3d/src/room.ts` extends the existing procedural room recipe only
when the room adapter selects Deadline or Maid. Four inset windows and a counter
appliance share the original floor and wall bounds. Deadline has 18 laptop/cup
stations; Maid has six tea settings, pink table runners and chair cushions.
The creator and unselected scenes retain the original recipe. All static props
continue to batch by material. Disposal is idempotent and owns only its room.

Provenance: deterministic project code using existing Three.js primitives and
the existing procedural wood texture. No external model, image, texture, font
or media was downloaded, generated or licensed by this change. Source hashes
and screenshot hashes are in the N06-04 room-art audit and private raw index.
This does not establish a production media-rights or owner art signoff.

Actual desktop and responsive Chromium journeys preserve saved parts, identity,
travel/reconnect, authoritative seats and walking, camera-only navigation,
resize centering and Leave. Six browser cases pass. Twelve canvas screenshots
are nonblank; four seat-to-walk pairs change pixels. The complete focused unit
run passes 54 tests, including room resource bounds, finite geometry, batching,
unchanged default recipe and exactly-once disposal without affecting siblings.

| Static Environment | Deadline | Maid |
|---|---:|---:|
| Material batches | 11 | 11 |
| Triangles | 16,028 | 16,700 |
| Geometry buffer bytes | 1,538,688 | 1,603,200 |
| Environment texture bytes with mips | 87,380 | 87,380 |

These are the actual two cafe manifests, without actors, driver allocations,
framebuffers or a frame-time measurement. They are below the existing static
resource limits. The Sandbox fixture unit tests alone do not prove these counts.
The initial resource probe failed on a CommonJS named import; the corrected
probe uses the built world exports, preserves the failure and passes.

Agent visual review inspected whole-room desktop Deadline/Maid and mobile
seated/walking captures. Windows and world-specific props render; the saved
rabbit is visible. The mobile full-page seated capture has readable controls
without an observed overlap. Wood and warm lighting still dominate, furniture
is angular, the whole-room animal remains small, groom remains sparse/speckled
and Low has visible facets. This remains technical art. No human usability,
owner approval, final-art, 20-actor performance, controlled loading or new
remount/heap qualification is claimed.

Five rejected Sandbox performance experiments remain in private evidence.
Backdrop/seat caching and/or RAF scheduling did not meet the unchanged 100ms
frame-gap cap. All Pixi experiments were reverted; no sampling, retry, budget,
authority, protocol, schema or migration change is part of this slice.
