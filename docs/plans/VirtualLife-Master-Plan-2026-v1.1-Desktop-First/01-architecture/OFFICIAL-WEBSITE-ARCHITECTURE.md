# VirtualLife official website — launch/publishing portal, not full AAA client

## Information architecture
```
/                       hero • trailer • what is VirtualLife • world preview • Download CTA
/world                  Aurora City map/story cards, districts, interactive POI preview images
/characters             anthro avatar expression/cosmetics/gallery (safe, original content)
/activities             Cafe • Card Lounge • Pet Arena • Events with short gameplay clips
/news/[slug]            patch notes, devlogs, events, announcements, RSS/OG tags
/download               OS-detected Windows signed download + hashes + system requirements
/account                secure browser identity/account/profile/password/session management
/support                FAQ, installation, known issues, report abuse, status, privacy
/legal                  terms, privacy, cookie/analytics consent and attributions
/status                 monitored or externally linked service status
```

## Visual design
- **Brand** VirtualLife with portal-star/ears logo already in `07-visuals/`. Style **Fantasy Campus × Bright City × Sky Blue/Sakura/Iris**, generous typography, soft cloud shapes, structured hero card, fluid gradient/rounded panels; not overly glass/blur/fps-taxing on low devices.
- Hero: **poster first** (WebP/AVIF responsive) and short muted optional preview video behind user gesture or when connection/desktop accepts; use `prefers-reduced-motion` and Save-Data. No mandatory 3D render context, no autoplay audio, no blocking huge shader scene.
- Primary CTA: `Download for Windows`; secondary `Explore City` and `How to Play`. Screenshots must be original render/video captured from actual build once available; AI key-art only **concept** and clearly labeled during prototype stage.
- World-map cards show preview, destination stories and supported features. Website map does **not** issue game teleport; instead `Open in VirtualLife` deep link to installed client to select the destination through authenticated in-game map.
- SEO/marketing: localized vi/en, canonical metadata, accessible headings, alt, structured page, open graph + favicon, clear privacy and support, rate-limited signup endpoints.

## Implementation
- Next.js with server-rendered/static pages; edge CDN/cached content and immutable images/video. API calls for account to NestJS; downloads from dedicated CDN/origin **not** app server memory. Content CMS can be content-in-repo markdown/typed content for first release; avoid premature costly CMS.
- Media through responsive `picture`, lightweight `<video poster>` with lazy source, partial range requests; no cinematic 4K video auto-load in mobile 4G. Lazy cross section and suspense boundaries. Respect CSP, CSRF, origin checks, anti-bot rate limits on auth/download endpoints.
- `Core Web Vitals` targets on real RUM p75: **LCP ≤2.5s, INP ≤200ms, CLS ≤0.1** where possible; test actual network and representative mobile/desktop rather than synthetic-only claim.
- Accessible contrast, keyboard focus outlines, font Vietnamese, motion disable, alt captions, WCAG 2.2 AA targeted; social accessible without 3D client.

## Secure installation funnel
1. Landing shows platform readiness + minimum specs (after real hardware validation); download URL is an HTTPS origin with signed artifact metadata.
2. Download button offers signed installer, SHA256 optional verify help, code signing publisher; never claim trusted unless signatures verified.
3. Installer opens game directly or launcher; `Open in App` signed, scoped, and no OAuth secret in URL.
4. Release notes, current version, rollback/warning, safety docs and crash-report opt-in.

## Ownership
`A3-Web-UX` = portal; `A5-Native` = Windows game and optional launcher; `A7-QA-SRE` = verified artifacts/CDN/canary/telemetry; `A2-Persistence-Security` = auth and installer chain. Web cannot own seat/battle result.
