# N06-06 — Animal landscape style and production brief

Revision 1, 2026-11-06. **DESIGN_REVIEWED_BY_AGENT / OWNER_ART_REVIEW_PENDING**. The owner requested landscape gameplay, animals and part-based creation. The particular cozy vector/2.5D treatment here is a production proposal. It is not approval of final art, shipped cosmetics or public distribution.

## Source audit and reuse

At baseline `795ab3863c94e31d9f551f2a10546ba6481f23a3`, `packages/contracts/src/avatar.ts` accepts only schemaVersion1/core starter-v1/palette/outfit. `packages/pixi-scene/src/avatar-art.ts` samples 32×48, four-frame idle/walk/sit/serve sprites. Existing generated SVG atlas/provenance, seat geometry and selected-cosmetic data remain intact. ADR0042's private inventory and server-equip/retry boundaries remain authoritative. N06-01/02's direction/prototype are historical artifacts; this study adds a different art treatment without altering their hashes or runtime consumers.

`index.html`, `study.css`, `catalog.mjs`, `illustrations.mjs`, `study.mjs` are a **local, simulated design tool**, not a game-client renderer, identity store or production contract. The new scene, props and animals are original SVG path/shape code authored in this task; no external artwork, font, audio, texture, trademark character, screenshot or remote dependency is embedded. The drawings remain concept/prototype assets until owner/rights review and production QA. Procedural authorship is not a legal or store certification.

## Style sheet

The interactive study has three sheets: landscape room composition with negative states; three animal silhouettes and an editable creator; materials/palette. Use the reading room as the representative composition, then apply the same treatment to the cafe. Lodge inherits this visual language after N06-09, while its cards/map stay mechanically distinct.

| Element | Production direction |
|---|---|
| Camera | Quiet 2.5D room composition, soft perspective/height from layering; keep current server walk/seat geometry. Study tables/guests are composition fixtures, not the final room map. |
| Palette | Linen `#f6f0e2`, forest `#294d40`, honey oak `#d8b580`, clay `#b7775b`, sage `#8fa894`; primary text forest on linen. Clay/sage are material accents, not small body text or color-only game state. |
| Light | Warm upper-left daylight plus restrained lamp pool; soft contact ellipse below feet/props, no full-screen bloom. Night Lodge can warm the key without losing value contrast. |
| Material | Broad oak grain, linen/apron folds and woven sage rug. Avoid noisy microtextures at phone scale and oversaturated UI. |
| Silhouette | Big readable heads, soft paws, species-specific ears/tails; distinguish at a proposed 48 CSS px world height and enlarged 200–260px creator view. All species share server collision and seat semantics. |
| Typography | System sans for controls and descriptive text; Georgia/system serif for display headings. No font download; final fallback spacing must be checked. Letterspacing only on short overlines. |
| HUD | Scene fills primary landscape frame, top room/status plaque, bottom contextual dock with separate My character / Activity / Safety / Leave. Modal sheets carry detail; no mandatory scrolling sidebar before the scene. |
| Motion/audio | Short local selection feedback, opt-in ambient/idle movement, no compulsory camera shake/flashing. Reduced motion is a static equivalent; sound starts OFF, no sound assets supplied. |
| Character scale | Proposed visible world height48–64 CSSpx at baseline zoom, footprints aligned to current room tile centers. Do not enlarge collision or cover adjacent interactable seats. Preview fixtures intentionally enlarge characters for art review; production tile mapping belongs to N06-04/07. |

Keep intended activity readable at normal and low graphics tiers: lighting accents never hide accessible seats, turn/receipt status or safety. A missing asset/WebGL path preserves DOM controls and textual appearance. Final visual refinement requires N06-09 on actual scenes and N10-04 on physical Android; this SVG study does not establish FPS, memory or thermal budgets.

## Starter parts and rig matrix

The `catalog.mjs` **design keys** are not reserved production IDs. Three starter species: cat, dog, rabbit. Each has a shared body rig with round/slender body and soft/wide head, four fur palettes, plain/patch/freckles, bright/calm eyes, small/soft muzzle, smooth/tuft hair, knit/overalls/apron, none/scarf/cap/glasses. Production grants remain server-owned; the apron is previewable here but retains current entitlement policy when wired. Free nonprivileged starter parts must allow a complete character without a shop. Do not attach profession, score, age, gender or hidden-match faction to any visual choice.

| Group | Study choices / compatibility | Proposed normalized anchor, reference200×240 |
|---|---|---|
| Body | round/slender; all species | root feet (100,214), torso center (100,164); head root (100,126) |
| Head | soft/wide; all species | center (100,88); scaling only within rig bounds |
| Eyes | bright/calm; all species | front (80,88)/(119,88); profile-specific offsets, hidden from back |
| Muzzle | small/soft; all species | (100,108), nose (100,104); profile-specific art required |
| Fur/marking | honey/cocoa/cloud/sage; plain/patch/freckles | head/body masks only, no tinting clothing or eye whites |
| Cat ears/tail | pointed/tufted; curved/plume | ears (73,56)/(127,56); tail root (71,167) |
| Dog ears/tail | floppy/upright; wag/curl | same roots, species bounds; floppy ear does not block eyes |
| Rabbit ears/tail | long/bent; puff/bob | same roots, taller silhouette; accommodate cap and top edge |
| Hair | smooth/tuft, all | crown (100,48); cap occludes tuft where needed |
| Outfit | knit/overalls/apron, all | shoulders (74,132)/(127,132), torso overlay; entitlement and role remain separate |
| Accessory | none/scarf/cap/glasses | scarf neck (100,132), cap crown, glasses eye bridge; ear apertures/masks need final art |
| Hands/held object | all species, action-driven | hand sockets around (64,150)/(140,150); tray offset in serve; no inventory authority |

Species changes reset incompatible ears/tail together to that species' first valid choice; no silently retained invalid combination. Other groups retain selections. Layer order by pose/direction: contact shadow → rear tail/ear → feet/legs → body/outfit → rear arm → head/muzzle/eyes/markings → front arm/held object → hair/headwear. Split scarf/cap/glasses into front/rear masks when production occlusion requires it. Sit clips/hides lower body behind the server-selected chair/table; tall ears remain within creator bounds. Back hides facial features and front accessories; profile uses distinct art rather than blindly mirroring a front view. Left/right mirroring is allowed only for symmetric pieces; asymmetric markings/tray need explicit art.

The study supplies inspectable **static key-pose drawings** for idle/walk/sit/serve and front/right/back/left; it demonstrates anchors and selectable silhouettes. Profile, cap/scarf layering and walk frame continuity still need production sheets. It deliberately does not claim a complete animation atlas.

### Animation production plan

- Idle:4keys/1.6s, <=1px breathing at baseline size; reduced motion holds key0.
- Walk:4keys/0.48s, hand/foot alternation and tail follow, directional foot contact. Speed/origin from authoritative movement; no moving state from the animation itself.
- Sit:4keys/0.36s transition, then held idle pose. Enter only for the confirmed seat; no motion across occupied server geometry.
- Serve:4keys/0.48s gesture/held tray, completion only after authoritative order response; animation cancellation does not confirm or retry an action.
- Reuse rig transforms/static parts and packed per-direction fragments. Do not bake the Cartesian product of all cosmetics. N06-07 must test occlusion over a covering combination matrix; N06-09 records actual atlas coverage/loading/frame-time.

## Compatibility and migration design

1. Keep existing v1 profile/core/palette/outfit and original atlas address valid; do not rewrite or automatically persist a species for existing accounts.
2. A v2-capable creator proposes a versioned catalog/appearance on the **existing** identity/wardrobe owners. Unknown key, rig mismatch, non-owned part, stale catalog and arbitrary URL reject server-side. A preview is not an equip receipt.
3. Existing v1 casual/cafe-apron map to explicit legacy presentation when using the v1 renderer. Offer a suggested animal preset only as an unsaved draft; valid user-confirmed save creates a versioned v2 selection while retaining recovery/compatibility data. Cafe-apron entitlement does not become a free staff role.
4. Determine additive SQL needs by auditing current selection/profile storage in N06-07. Reserve the next free migration only then; no number or DDL is allocated here. Receipts, session changes, late replies and entitlement revoke keep current semantics.
5. Before publishing v2, add content negotiation/projection fixtures for actual N/N−1 clients and retained mobile binaries (N05-06/N10-03/N12). A v1 client receives a reviewed compatible projection or explicit unsupported response per policy; a missing asset fallback never overwrites stored v2 parts. Do not simply send a v2 object to a strict v1 parser.
6. Private inventory/ownership never appears in peer room state, public profile metrics or match projections. Public appearance has only safe cosmetic IDs and catalog revision; never encode a hidden role/target into avatar accessories, animation or accessibility text.

## Storyboard and review scope

The room study exposes ready/loading/empty/full/wait/offline/reconnect/denied, reading-room/cafe perspectives and local Apply/Cancel. Positive action is disabled when unavailable, while Safety/Leave/My character stay reachable. Waiting has no fake rank/ETA. Local Apply updates the illustration only. The prototype has no backend, live identity, production guest or world activation.

Review target viewports:740×360/844×390 landscape;1280×720/1920×1080;360×740 portrait fallback. Also inspect short viewport as a keyboard-occlusion fixture,200% text, modal keyboard/Escape/focus restoration and no external requests. Portrait suggests rotation but keeps recovery and negative actions accessible. CSS safe-area padding is preparation, not actual iPhone/cutout evidence. Hardware orientation, native keyboard/Back/TalkBack and real server-state wiring remain N06-08/N10/N14 tasks.

Review rubric: composition hierarchy, silhouette distinction, consistent material/light, part/pose readability, text/controls and explicit negative states. Agent review can identify issues and recommend implementation; it cannot supply owner art approval,5target-user usability, asset-law certification or N06-09 gameplay qualification. Record findings and limitations with artifact hashes, not a synthetic “beautiful” score.

## Next implementation boundary

N06-03 uses this hierarchy to mount the **existing** shared authoritative room widgets/navigation, behind a rollback flag. N06-08 implements landscape/orientation/fallback; N10-03 supplies native auth before N06-07's actual phone saves. N06-04 replaces scene art only with versioned assets after geometry and provenance checks. N06-09 qualifies the actual integrated result. Phase2 must reuse this catalog/composer after qualification rather than create another avatar system.
