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

Deleting the final actor of an entry releases its geometry/materials and one
surface lease. The last entry disposes all three textures and clears the
surface cache. A subsequent actor receives fresh texture objects with the same
bytes. Idempotent actor disposal prevents a double release. The existing
`animalResourceSummary()` contract is unchanged.

The mixed-tier/species/style regression disposes entries in different orders,
adds an entry while another remains alive, verifies surviving texture identity,
and checks recreation after the final release. This proves the tested ownership
path; zero actor leases alone does not establish absence of a browser/driver
memory leak.

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
