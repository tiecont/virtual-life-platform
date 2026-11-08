# Cached face construction review — revision 1

Source `2b4c070bbe199514ba82031ddb72873c47acfe34`,2026-11-08. This is a performance revision of the original technical cat. No new artwork,texture,bone,appearance selection or authority is introduced. [Actual qualification and retained failures](../../../plans/platform-vnext/audit/N06-11-CACHE-CHECKPOINT.json).

The Node CPU profile identified repeated face binding/construction. Previously every actor built temporary eyes,ears,nose,whiskers,collar and leaf,then discarded their buffers when the face cache already existed. The cache hit now creates independent actor skeleton/material/morph state directly from immutable cached buffers;cache misses keep the original bake. Material order and Low palette separation remain explicit. Last-lease disposal is unchanged.

Before/after source comparison covers3tiers×8palettes×2outfits×4poses=192snapshots,including geometry/index/UV/skin/morph,material/texture bytes,world/bind/bone matrices,visibility,triangles and serving contact diagnostics. All match. The public regression also checks cached collar colours and independent blink state at all tiers. Nine Node CPU batches per source retain every sample;Balanced20actor creation changes from164.7–183.7ms to68.8–76.9ms. This is profiled Node attribution,not browser/GPU or physical qualification;the after-profile's precommit HEAD is bound by its actual model SHA to2b4c070.

The unchanged controlled browser protocol gives these p75 observations (milliseconds;ten cold/warm pairs per row):

| Profile/tier | Before cold | After cold | Before warm | After warm |
|---|---:|---:|---:|---:|
| Desktop Low |6691.1|6066.7|4045.5|3594.0|
| Desktop Balanced |8201.6|7053.6|5538.2|4503.2|
| Landscape Low |7139.9|7498.9|4230.0|4488.8|
| Landscape Balanced |8705.6|8324.9|6323.4|4996.6|

All cold groups still exceed5000ms;all warm groups meet the comparison,but landscape Balanced has only3.4ms headroom. Landscape Low is slower in this series despite lower Node construction cost. One host/series does not establish robust device performance or causality. Active external-GC heap growth after20recreates is1508716desktop/1077352landscape bytes,within original16777216byte floor;no teardown leases/canvases remain. Procedural final-art wait/catalog,packaged native loading/GC and physical gates stay open.

The first fresh-boot AVD workload Low p95=49.9ms fails33.4ms;Balanced passes16.7ms. A separately predeclared old/new/new/old APK diagnostic retains four complete runs,each with Low/Balanced≈16.7–16.8ms. This does not erase the first failure or prove a boot/thermal cause. The old binary source21cbc1f and new binary source2b4c070 are pinned separately from the executing harness source. High184draws remains the predeclared desktop-tier diagnostic exceeding mobile160calls.

Developer inspected actual browser `study-09213f92/desktop-apron-closeup.png` and packaged AVD `native-study-6d8c422a/apron-close.png`,both under private `artifacts/vnext/n06-11/`. Pose,colours,prop and general silhouette remain consistent. Bright sparse tufts,rounded shoulder joins,flat apron surface and faceted tray remain below the requested final visual target. Functional studio passes do not constitute owner art approval or a polished game UI.

Next visible slice: improve original groom direction/coverage and cloth/silhouette on one representative cat,with before/after runtime images and rubric under unchanged budgets. Preserve this cache fast path and v1 identity/appearance. Track cold-start attribution and a separately declared packaged-native process/cache/GC protocol alongside that work. Full Deadline/Maid scenes,creator,physical Android and iOS remain separately gated;N06-11 remains IN_PROGRESS.
