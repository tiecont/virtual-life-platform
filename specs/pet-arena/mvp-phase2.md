# Pet Arena Wave 1 playable loop

Release state is `OFFLINE_ONLY / NO_GO_PUBLIC`. Set
`LOCAL_PET_ARENA_WAVE1=1` on a development or test API bound directly to
loopback. The default is off. The Wave 1 rules manifest retains its draft
banner and purchase settings.

## Campaign and collection

- The 43-Pet roster uses Fire, Water, Electric, Ghost, Ground and Light. Water
  uses a ripple, Electric an arc, Ghost a Shadow ring, Ground a Nature petal
  and Light an Ice crystal. These effects share one transparent URP shader.
- An account starts with Coalwhisk, Dewskip, Clodkin and 8,000 coins. Save an
  ordered party of 1–4 owned Pets and choose one to fight each map.
- The six maps each have a regular encounter and a boss. The next map opens
  when both are defeated. The regular and boss fights each start at full HP
  with zero Rage and allow up to 12 turns each. Strike and Guard build Rage.
  Guard halves retaliation. Skills share a three-turn cooldown.
- Lv 20 unlocks Power skill. Lv 40 unlocks Signature, including Icarus's
  `FIRE_ZONE`, which damages the opponent for two subsequent turns. Lv 60
  unlocks Ultimate. Signature and Ultimate require full Rage and a ready
  skill. The first-clear and replay rewards grant EXP and coins. Each victory
  recruits one unowned Pet from that map, regular Pets first and Legendary
  last. This makes all 36 map Pets obtainable through the campaign.
- First-clear EXP is 500, 750, 1,100, 1,500, 2,000 and 2,600. First-clear
  coins are 200, 250, 300, 350, 400 and 500. Replay rewards use zero-based
  map order: `120 + 30 × index` EXP and `40 + 10 × index` coins. EXP to next
  level is `25 + 5 × level` up to the level 60 cap.
- The banner costs 100 coins per pull. The manifest defines the S-rate and
  pity curve. On an S, the featured result is Icarus at 50%, with the six
  Standard S Pets equally weighted in the off-rate pool. An off-rate S
  guarantees Icarus for the next S. Duplicates grant 200 EXP to the owned Pet
  and a missed S grants 25 EXP to the party lead. The most recent 100 results,
  including misses, appear in the API state. Account export includes the
  complete history.

## Authenticated local HTTP routes

Routes under `/v1/pets/wave1` require the existing identity session. POSTs also
require the configured origin and CSRF header. Responses use private no-store.
Requests that save progress use a UUID `requestId` in the JSON body. Retrying a
request with the same body returns the original receipt.

| Method and route | Request and response |
| --- | --- |
| GET `/manifest` | Ordered maps and encounters, element matchups, evolution thresholds and banner rules |
| GET `/roster` | The 43 Wave 1 identities, ranks, elements and sources |
| GET `/state` | Wallet, ordered party, owned Pets with EXP/level/stage, cleared and next map IDs, pity and recent history |
| POST `/party` | `{requestId, petIds}` returns the saved party and revision |
| POST `/campaign/preview` | `{mapId, petId, actions, bossActions?}` returns computed HP, Rage, skill availability, FIRE_ZONE and outcome for the current encounter. An empty current action list returns opening stats. |
| POST `/campaign/play` | The same transcript with `requestId` returns the settled result, updated state and optional recruit. The server replays both fights against the stored Pet level. |
| POST `/gacha/pull` | `{requestId, count}` with count 1 or 10 returns cost, S results and updated state. Entropy comes from the server. |

Action IDs are `strike`, `guard`, `skill`, `power-skill`, `signature`,
`fire-zone` and `ultimate`. Use `bossActions` for the second encounter.
For an existing caller omitting the field during settlement, the server
reuses the regular transcript. Both settlement lists allow 1–12 moves.

Migration 0055 adds account-owned player, ownership, party, map clear, pull
history and command receipt tables. Player-level serialization makes the
reward, ownership and wallet changes atomic. The tables follow the existing
account deletion cascade and Wave 1 has an account export adapter.

In Unity, open `PetArenaPve.unity` with `AETHERIA_WAVE1_API` set to reach the
local session screen. The session cookie is scoped to that loopback origin
and kept in the per-user data directory. The client reads canonical state
after resuming an unexpired session. Existing registered accounts can also
sign in. Reduced motion is on by default.
