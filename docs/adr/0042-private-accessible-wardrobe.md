# ADR0042 — Private wardrobe in the current visit

Status: local implementation; verification recorded in m13-wardrobe-checks.json.

The existing avatar atlas lab is a preview, not an inventory or equip flow. The room now offers a keyboard-accessible wardrobe disclosure. Static original-art previews work for both styles, including locked styles, without motion or canvas interaction. Missing art retains textual choices and equip controls. It reads the private GET `/v1/me/cosmetics` catalog with authoritative policy thresholds and entitlement booleans; XP arithmetic in a browser never grants ownership. The existing progression response contract is unchanged.

The local sandbox explicitly allows an entitled apron; missing policies in other worlds still default to casual. This offers a real approved appearance path without inventing a staff role. All actual world flags remain OFF and new progression rewards remain disabled by default. Synthetic browser SQL entitlements test wardrobe gates, not reward earning.

Equip requires a currently confirmed connected visit and uses the existing server checks. The UI never optimistically claims success. If a response is lost after commit, the same captured source/outfit/UUID key remains available for retry. Transient room synchronization does not discard that request. Dismissing an uncertain request is an explicit user choice; the actual outfit always follows the server snapshot. A retry after visit replacement may be declined. Inventory failures clear unconfirmed ownership, and identity changes/unmount abort requests and exclude late responses. No private inventory is shared with peers or persisted in browser storage.

Native radios, disclosure, buttons and polite messages supply keyboard/mobile alternatives with44pixel button targets. A locked item remains previewable. An unlock is personal, non-tradable and never implies paid currency or staffing authority. Own catalog reads reuse account locks, session checks and rate limits. No new migration is required. Disable the UI independently to roll back presentation while preserving selection and receipts.
