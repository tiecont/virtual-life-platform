# Social, progression, identity and responsible monetization

## Social loop
Friends list, opt-in presence, group party, invite to café/table/arena, photospot, emote wheel, public-safe chat, moderation/report/mute/block/whisper policy. Public profile and avatar identity stay with Nest; world uses scoped visibility grants and filter projection; friend teleport respects consent.

## Progression
Cosmetic wardrobes, earned titles/badges, Pet collection and upgrades with competitive caps, themed seasonal décor and small narrative quests. Separate `accountInventory` (Nest ledger) from `gameStatProgression` (Rust game domain), versioned effects and results. Unlock logic only from authoritative event.

## Economy
- Earn cosmetics/season tokens by play, **no pay-to-win gameplay advantage in ranked PvP**.
- Shop purchases / regional payments / chargebacks must be platform ledger with receipt verification. Avoid cross-service distributed ACID fantasy; game emits reward request with key and awaits ledger confirmation.
- User-to-user trading/cross-marketplace deferred due fraud, moderation, legal and support complexity.

## Events
Café photography festival, campus lantern week, Pet race exhibition. Calendar and public event schedule in Nest; active session capacity/cooldown in Rust; art effects client-side. Time zones explicit, server time authoritative. Event participation does not let client claim free balance.

## Creator content and licensing
Only approved cosmetic/venue assets in MVP. Creator portals, mods and custom game rules come later after malware/IP/moderation pipeline; never run arbitrary UGC scripts on Rust game worker. Profanity/naming rules, attributions and takedown workflow required for public beta.
