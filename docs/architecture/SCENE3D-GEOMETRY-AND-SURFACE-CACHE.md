# Geometry Indexing And Surface Texture Ownership

N06-04 partial implementation: geometry indexing at `3e14fc2`, shared surface
textures at `19874e0`. These changes do not qualify final art or performance.

## Geometry Indexing

`packages/scene3d/src/index-geometry.ts` replaces decimal vertex-key strings in
the packed body/groom and face paths. It preserves Three's quantization and
first-occurrence order. Equality includes every base and morph attribute, so
blinking seams remain distinct. Numeric hash collisions compare complete rows;
the hash alone never determines equality. Three's `remapAttribute` preserves
attribute representation. Interleaved attributes, custom accessors and other
unsupported attribute representations use the reference implementation.

Tests compare indexed and unindexed inputs against Three at both production
tolerances, signed normalized endpoints, deliberately colliding coordinates,
morph seams, groups and interleaved data. A separate diagnostic compares 120
authored model configurations, including four animation poses at three times.
All authored geometry/index/morph/material/texture/rig bytes match the baseline.
The diagnostic is not an owner art review or a complete catalog acceptance.

## Surface Texture Ownership

The fur alpha atlas, fiber normal map and cloth normal map have identical
recipes for every quality, palette, species and modular style. A shared texture
lease now belongs to each live geometry-cache entry. Creating another actor
with the same geometry increments that entry's actor references; creating a
different entry increments the surface lease. Materials, skeletons, garment
poses and palette choices retain their existing ownership.

Without a retained gameplay lease, deleting the final actor of an entry releases
its geometry/materials and one surface lease. The last entry disposes all three
textures and clears the surface cache. A subsequent actor receives fresh
texture objects with the same bytes. Idempotent actor disposal prevents a
double release. The existing `animalResourceSummary()` contract is unchanged.

The mixed-tier/species/style regression disposes entries in different orders,
adds an entry while another remains alive, verifies surviving texture identity,
and checks recreation after the final release. This proves the tested ownership
path; zero actor leases alone does not establish absence of a browser/driver
memory leak.

## Gameplay LOD Leases

Source `071bcbb` adds `createAnimalVariants()` for one active appearance. It
captures canonical parts at construction and permits only Low/Balanced. Each
requested tier retains its cache entry once. Actor references and entry
retainers are separate: `animalResourceSummary().references` still counts live
models, including the 20 active actors in the workload. It does not hide extra
models. `animalCachedGeometries()` includes every retained body/groom/face buffer,
including inactive tiers, for conservative resource accounting.

The renderer reuses this lease only while the same participant and appearance
remain active. A LOD swap creates an independent skeleton/material instance
against the retained geometry and releases the old instance. It does not change
LOD selection, quality, animation, opacity policy, shadows or the server snapshot.
Appearance replacement, participant departure, context/account replacement,
suspend and destroy release the corresponding lease. A graphics context loss
retains the existing appearance for recovery until an ordinary departure or
disposal occurs.

An entry is disposed only when both actor references and retainers reach zero.
Closing a scope before its last model does not invalidate that model; creating
another model after scope disposal fails. Shared entries remain alive while
another active appearance still holds them. With 20 distinct active appearances,
at most 40 gameplay entries can be retained; identical styles can share entries.
The transient previous/new actor overlap during a swap is still accounted for
by the existing geometry inventory. No unbounded session/history cache is added.

Ownership tests exercise repeated swaps, independent scopes, caller mutation,
live-model disposal order and all 20 appearances retaining both tiers. These
tests complement actual browser/resource/heap/frame evidence; they do not by
themselves qualify performance or absence of a driver leak.

## Measurement Scope

Private CPU diagnostics are in
`artifacts/vnext/n06-04/render-diagnostics-v1/`. The unchanged short desktop
diagnostic records Low/Balanced/High p95 at approximately 150/433/883 ms before
texture sharing and 150/300/650 ms afterward. Both remain above the locked
33.4 ms limit. CPU profiling adds overhead and these single diagnostic windows
are not performance qualification or a causal estimate of the speedup.

No geometry detail, animation, shadow/LOD policy, required quality tier,
measurement sampling, timeout or budget was reduced. Full workload, controlled
loading, browser recovery and integrated art acceptance need their own evidence.

## Gameplay LOD Lease Measurement

The 20-actor synthetic workload was re-run on the lease source (`071bcbb`) with
the locked profile and budgets: artifact
`artifacts/vnext/n06-11/workload-v1/browser-423f5375`. Geometry stayed at
5,100,832/5,113,336/5,138,344 bytes for Low/Balanced/High against the 24 MiB
resident limit; other/shadow textures peaked at 8,640,976 bytes against 16 MiB;
total textures peaked at 9,012,344 bytes against 96 MiB; the largest texture was
1155 px. Desktop draw calls were 107/134/170 against 300, mobile Low/Balanced
were 107/134 against 160, and visible triangles were
122,384/174,112/250,880. All 20 recreate cycles finished with
`references: 0`, with no page error, foreign request or WebSocket open.

Frame p95 remains above the unchanged 33.4 ms gate on the declared SwiftShader
compositor: desktop 116.7/166.7/233.3 ms and mobile 116.6/150/266.6 ms. The run
is therefore `OBSERVED_LIMITS_EXCEEDED_NOT_PHYSICAL_QUALIFICATION` and exits 1;
it is not physical/Windows GPU qualification and no threshold was adjusted. The
prior checkpoint's 7,282,334 geometry bytes at desktop Low is a separate
measurement window, so the new number is not presented as a controlled A/B.
