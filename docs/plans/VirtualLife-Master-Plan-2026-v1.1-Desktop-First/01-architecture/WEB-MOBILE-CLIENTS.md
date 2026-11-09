# Client architecture v1.1: native desktop first / web official / ports later

- **Windows Unity**: `NATIVE-CLIENT-ARCHITECTURE.md` is the one primary source for 3D. Unity URP/C#, Input System, Addressables, Animation Rigging, generated proto, local prediction; authority remains in Rust.
- **Website Next.js**: `OFFICIAL-WEBSITE-ARCHITECTURE.md` publishes game downloads, localized news, gallery/trailer, accounts and support. Keep videos/posters light. No browser render parity obligation.
- **Existing Web 3D**: archive/compatibility only, scope re-evaluated under optional web teaser. Reuse N06 visual/gltf engineering if useful; do not sabotage existing VERIFIED work.
- **Mobile/macOS**: use same Unity source repo but distinct quality tier, safe-area and OS device checks after Windows G4. Windows-first does **not** imply shipping on all screens simultaneously.
- **Shared contracts, not rendering**: proto, avatar IDs, pet/game rules, map POIs, session tickets, content hashes and entitlement semantics. Unreal, Babylon, HDRP are not built in parallel by default.
