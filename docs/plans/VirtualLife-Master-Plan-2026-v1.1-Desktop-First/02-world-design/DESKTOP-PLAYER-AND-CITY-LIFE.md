# Desktop player control, autonomous city life and target navigation

## Input contract
- **WASD**: freely move third-person camera; **mouse** orbit; **Shift** run (bounded); **E** interact; **M** map; **Esc** return/close; gamepad equivalents. Keybind reassignable, focus-aware: M must not trigger while typing in chat.
- **Click-to-move/auto-navigate** optional but planned: click waypoint or choose POI on map and press Navigate; destination route preview, character walks/runs to target while player may override with WASD; **server validates** nav request/path/obstacle/zone rules. No instant teleport via click-to-move.
- **Teleport** distinct from navigation: map POI with image/previews and travel requirements; triggered via server prepare/commit. No teleport to another instance while seated/in match unless policy gracefully ends/rejects activity.
- **Photo camera** and idle poses optional only after city gate; never prioritize over core movement/collisions.

## Lively city split
- **Authoritative, interactive**: actual players, seats, cafés/doors, quest NPCs, Pet Arena trainers, vendors, trams if they affect collision, timed public events; Rust zone actor tracks semantic state and schedules, not raw render bones.
- **Visual-only ambient**: wind on trees, ripples, clouds, birds, signs/particles, distant pedestrians that cannot be interacted with, tail/ear spring, cloth sway, idle emote blend, path-camera idle lighting; Unity GPU/animation jobs handle them locally, deterministic seed when visual consistency matters.
- NPC schedules: simple time-of-day state machine `walk market→open shop→serve café→break` with stable destination/content IDs. NPC behavior remains original and culturally appropriate; crowded events lower visual NPC budget automatically.

## Camera animation
Smooth follow lag/clamped pitch, no forced motion sickness; close café shots focus eyes/face/hand IK; combat uses short skippable camera cuts and reduced-motion mode. Interaction dialogue does not freeze remote world authority.

## Vertical slice route
Spawn East Gate → walk/click-to-move through Campus Plaza → E at Café Lumi → choose table seat → sit + drink animation → invitation card game → exit & stand → M map choose Pet District → safe teleport → run to kiosk → PvE Pet Arena → result receipt → return to plaza. Includes deliberate failed/blocked/timeout tests.
