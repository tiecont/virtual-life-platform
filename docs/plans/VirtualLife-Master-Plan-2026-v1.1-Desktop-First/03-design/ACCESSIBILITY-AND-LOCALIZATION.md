# Accessibility & localization

- WCAG 2.2 AA target for **HTML/UI surfaces**; canvas/world 3D interaction paths should provide equivalent accessible menus/list/directional UI where possible. High contrast, text scale, minimum 44x44px touch targets where platform-appropriate, keyboard focus, screen-reader labels for cards/menu/chat.
- Reduce motion: disable camera bob/shake, scrolling sky effects, blur pulses, sharp Pet battle screen flashes; cap tween and add photosensitivity safeguard. Show subtitles/captions in story voice, support mute/bgm separately.
- Game rules cannot rely only on red/green; icons, labels, outlined active state, number and text turn hints. Card colors additionally glyphs/patterns.
- Focus trap properly for M-map; Esc/M close except when text field input intercept; prompts must remain visible above game scene with UI-safe overlay.
- Localize via extraction of strings, initial vi-VN and en-US plus growth language fallback, Unicode glyph/font coverage, text-expansion tests; do not bake all sign text into textures if localization needed.
- Accessibility fallback for 3D world includes clickable POI menu, teleport/direction, seat activity, map-only/web-lite; users should still play minigames with no 3D GPU.
