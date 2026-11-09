# Controls, HUD, map and interaction UX spec

| Action | Desktop | Mobile | Gamepad | Accessibility |
|---|---|---|---|---|
| Move | WASD/arrows | virtual stick | left stick | click-to-move toggle / auto-walk bounded |
| Camera | mouse / Q/E optional | swipe | right stick | reduce motion, sensitivity |
| Sprint | Shift | toggle sprint | shoulder | no double tap requirement |
| Interact | E / left-click target | context button | X/A | focusable HUD action |
| Map | **M** / HUD map | persistent map icon | View/Menu | accessible POI list search |
| Emote | G / emote wheel | emote button | d-pad | list + keyboard labels |
| Activity | seated table prompt | table prompt | confirm | leave/forfeit visible |
| Menu | Esc | menu | Start | accessible focus |

## Menu-to-world flow
All menus are overlays not disconnected pages where possible: camera remains in current instance; a board-game table animates in, world remote actors downgraded to low update; result returns to seat (or server-safe spawn if transfer). Social and moderation controls remain reachable even during battle via pause.

## Map details
M toggles large light-colored map, POI preview with original thumbnail, category filters, teleport locked/unlocked rationale, hover route, ping, search and account-consented party destinations. `Teleport` only enabled once Rust `eligible` or last-known state and preflight; actual click always revalidated server-side.

## Character feedback
Feedback after move within client frame while reconcile server; seat reservation displays pending spinner then sit animation; friendly but not misleading errors, damage VFX after Rust event not client assumption. Toasts stack ≤3, dismissible; avoid modal spam in first-play.

## Screens inventory
- Login/entry and device quality tier selector
- Character maker parts/pattern/face emote preview
- World HUD and friend presence
- City map and POI/fast travel
- Café menu/order/seat
- Game invitation and ready check
- Card table UI recipient-scoped
- Pet Camp/team/arena battle
- Outfit/inventory/achievements
- Event calendar & admin separate
- Network lost/rejoin/unknown receipt
- Block/report/mute/privacy and age controls

Acceptance: task VL-056 should include screenshots across 16:9, 19.5:9 landscape, ultrawide and large text + high contrast mode, plus real navigation with keyboard/touch; no hidden mouse-only actions.
