# Journeys and interaction states

| Persona | Entry → action → exit | Success | Failure / recovery |
|---|---|---|---|
| Student | guest setup → Deadline seat/focus → leave | one verified session, private stats | seat conflict → refreshed seat list; offline timer never invents completion |
| Developer | resume identity → invite consenting friend → focus → logout | same avatar, scoped invitation | expired invite → safe lobby; no forced room switch |
| Casual visitor | browse catalog → enter eligible room → leave | honest occupancy, accessible controls | full/disabled room → alternatives without private metadata |
| Host | authenticate → schedule eligible event → end | correct capacity/timezone | permission/cancel conflict → current state; no duplicate RSVP |
| Staff | choose voluntary Maid role → claim/serve → end shift | exactly one owner/reward | disconnect → grace then reassign; service refusal allowed |
| Moderator | scoped staff login → review report → action → end | confidential evidence and audit | denied role or missing evidence → no action, appeal route |
| Adult dater | separate reviewed verification/consent → timed date → mutual choice → exit | mutual match only, invisible globally | unknown/underage/declined → deny safely; one-tap leave/block/report |

Wireflows (DOM alternatives for every canvas action):

1. Onboarding: explain browser guest limits → name/avatar → privacy choices → submitting → confirmed identity. Validation stays beside fields; network error retains input and offers retry. No legacy login promise.
2. City: loading → populated cards or honest empty catalog → world detail → server admission → room. Disabled worlds say unavailable; occupancy failure says unknown. Keyboard world list mirrors map hotspots.
3. Travel/leave: choose target → access/capacity check → pending confirmation → commit → destination snapshot. Failure/timeout leaves source intact or safe lobby after restart; never optimistically release source. Explicit leave is separate from logout.
4. Group invite: pick consenting recipients → server policy/capacity → pending → accepted/declined/expired. Show partial capacity truthfully; no guarantee seats are reserved without a hold. Offline delivery has TTL and no hidden world disclosure.
5. Safety: player menu → mute/block/report → confirmation/receipt. Blocking takes effect across worlds; reports remain private and do not announce reporter. Network failure shows pending, not a false success. Moderator route requires role, appeal has a receipt.

Tokens: background #f5f4ee, surface #ffffff, text #172d2a, accent #225c49, danger #a12232; space 4/8/12/16/24/32, radius 8/16. System font, 16px body, >=44px touch targets, visible focus, no color-only status, reduced-motion preference. Verify actual contrast once UI exists. Support 360px viewport, no forced orientation, scrollable DOM controls, named dialogs, clear headings and status messages. Live region announces transitions, never per-second timer spam. Escape closes optional panels without leaving a room.
