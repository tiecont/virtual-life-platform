# Procedural3D technical refinement — revision2

N06-11 remains IN_PROGRESS. Revision1 and its failures/results are historical;
this refinement does not establish final animal art or a playable3D room.

The groom now offsets its roots above the base surface, widens/lengthens its
cards and leaves body shadow reception on the body rather than the tiny groom
cards. Original rounded shoulder/paw geometry covers the open pointed limb
ends. The immutable card/mesh/bone budgets are unchanged. Actual whole-model
inspection with the apron gives:

| Tier | Whole base triangles | Groom triangles | Visible model draws, no shadows | Geometry bytes |
|---|---:|---:|---:|---:|
| Low | 2744 | 1300 | 4 | 859392 |
| Balanced | 9144 | 5600 | 12 | 3134640 |
| High | 18008 | 18000 | 12 | 7581360 |

The compact landscape header gives more space to the scene. Initial Idle and
Leave controls must fit the actual viewport without scrolling in both the
browser and the implemented native probe; large-text fallback still scrolls
naturally. The frame diagnostic now reports the summed duration of the same
bounded300interval window used for p95; revision1's duration included intervals
that had already rolled out. Revision1's p95 was computed over its bounded
samples, but its displayed duration was inaccurate and is not reused as a new
measurement.

Developer review of the actual revision2 desktop image: shoulder/paw ends are
more readable and the coat has longer fibres. Fur still appears sparse/wispy,
with visible bright strands and aliasing, the silhouette remains a technical
model, and materials/room/cloth/serve props are not at the reference quality bar.
This is an unresolved visual finding. No polished/final-art acceptance, owner
approval, glTF export, modular creator, authoritative3D gameplay,20actor budget
or physical Android qualification is asserted by these changes.

All geometry/textures remain original source-generated inputs in the same
reviewed ThreeWebGL2 closure. The raster concept/prompt/provenance and locked
budget files are unchanged. Source/model/material hashes and actual execution
results belong to the N06-11 audit checkpoint; failed earlier runs remain
preserved rather than being relabelled as passes.
