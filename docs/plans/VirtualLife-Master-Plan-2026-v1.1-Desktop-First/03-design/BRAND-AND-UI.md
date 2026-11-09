# VirtualLife Visual Identity — v1 concept

## Brand promise
**VirtualLife** = một thế giới dễ mến để sinh hoạt và khám phá; không techno-dark hoặc grim sci-fi. Mood: **Fantasy Campus × Youthful City × Modern Anime Social**; bright, airy, balanced, painterly lighting, polished glass, warm café wood, pastel accents. Tất cả tên/asset trong đây thuộc concept gốc, chưa trademark clearance.

## Logo system
- Main wordmark: **VirtualLife** đúng camel case; symbol nguyên bản gợi **portal + đôi tai thú + bốn cánh sao** (an open circle as doorway / connection and expressive companion life). Không sao chép icon của game/IP khác.
- SVG concept: `07-visuals/VirtualLife-logo.svg` (vector/temporary). Key-art AI: `07-visuals/VirtualLife-key-art-concept.webp` (chỉ concept art). Review ở kích thước 24/32/64/256 và light/dark, app launcher adaptive icon.
- Art direction logo: rounded readable sans; avoid lettering quá fantasy khó đọc ở mobile. Product name single exact string `VirtualLife` in app title, splash, admin, short-link.

## Color palette tokens
| Role | Hex | Usage |
|---|---|---|
| Mist White | `#F8FBFF` | surfaces, background sunlight |
| Cloud Blue | `#EAF4FF` | map, glass cards |
| Aurora Blue | `#4B91FF` | primary, teleport |
| Iris Purple | `#8168E9` | game accents / magic |
| Sakura Pink | `#F6A2C1` | playful secondary, casual social |
| Mint Sprout | `#69D7BA` | positive availability, foliage |
| Sunshine Gold | `#F5CB74` | achievements, warm café lights |
| Ink Navy | `#1E3153` | primary readable text |
| Soft Slate | `#50627C` | secondary text |
| Coral Alert | `#C64B55` | critical error with icon+text |

Do NOT assume palette pair contrast without testing. Normal text WCAG 2.2 AA target >=4.5:1, large text >=3:1, controls/contrast check per actual background and glass overlays; color alone never conveys state.

## UI aesthetic
- Rounded 12–20px cards, subtle shadow and blurred glass **only** when contrast and GPU budgets allow; avoid 15 translucent overlays in busy 3D.
- Typography: use properly licensed **Inter/Be Vietnam Pro or Noto Sans** for Latin/Vietnamese; fallback system fonts. Heading friendly but no unsafely small neon text.
- Icons: 24px outline, high clarity, accent glows limited. Primary CTA always recognizable. Hud top-left profile; bottom-center interaction prompt; top-right map M/social; bottom-left hotkeys; minimal overlays during play.
- Desktop landscape 16:9 first, ultrawide safe margins, tablet and mobile landscape, font scale/keyboard and reduced motion fallback.

## Core screens
Landing, avatar creation, world lobby, in-world HUD, M world map, POI detail with preview, seat/table overlay, card UI, Pet Arena match-3 board, inventory, social/safety controls, pause/settings, loading/reconnect, error and release notes.

## Art reference policy
References Honkai: Star Rail, Zenless Zone Zero, Genshin for **level of finish, camera expressiveness, colorful public spaces and world liveliness only**. Use original outfits, proportions, level geometry, shader language, UI layout, music and names. No direct screenshot tracing.
