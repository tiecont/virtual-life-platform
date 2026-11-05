# Maid integration audit — M16-01

Readonly observation from city6124a1c on2026-11-03UTC/2026-11-04Asia_Ho_Chi_Minh. `node scripts/audit-legacy-integration.mjs maid` records25source/manifest/SQL/test hashes,current branch master/HEAD`33180a920505a6e0f3998dbf0367be0b72727710`,expanded untracked status and a second unchanged hash/status/HEAD pass. All10M11-01source hashes remain unchanged. Most implementation files are untracked; the HEAD alone cannot reproduce this app.

| Reference / boundary | Current actual source | Integration consequence |
| --- | --- | --- |
| Guest/session/profile | users/profiles/sessions SQL with hashed token expiry/revocation; profile DTO. No issuance,renewal,upgrade or profile routes. | Existing data must not be orphaned or name-merged. Need explicit possession/mapping boundary if any legacy users actually exist; no data is assumed from schema. |
| Roles/rooms/seats | DTO Customer/Maid,room/seat/role commands and24Customer/6Maid/30total catalog constants. No actual room owner/listener or role handler. | Gameplay role never becomes moderator/admin permission; enforce scoped room/seat/shift caps through owner ports. Schema acceptance alone does not prove concurrency. |
| Order/shift/gameplay | Seven order-state names and shift/order/minigame DTOs;6seed menu entries. Foundation SQL has no order,shift,course or XP ledger tables. | Nothing is safe to dual-write or pretend to extract. M11/M13engines supply canonical durable workflows; recipe/minigame/NPC differences still need explicit adapter decisions and tests. Timed preparation is not proof of the reference's minigame. |
| Safety/consent | Chat/report/moderation DTOs/error codes;no runtime safety handlers or scoped staff provisioning. | Bind M08policies and voluntary refusal/requeue;no clothing/role grants staff powers. Reference romantic/sexual/unsolicited-contact exclusions remain mandatory. |
| App/scene/travel | Complete API source inspection finds only GET health/live and health/ready;no realtime imports. Web has landing page with `/play`link but no implemented play route/scene. | No working CafeSakura world exists to embed unchanged. Synthetic travel fixture proves platform transport only;real service loop is unverified. |
| Assets/DB | Six foundation tables,checksum migration runner/advisory lock;assets/LICENSES says no external assets imported. Root code license absent. | Keep separate legacy journal/DB;no source/media copy until reuse scope clear. No original cafe sprites exist to claim reuse. |

## Actual baseline scope

AUD-07 on2026-11-02 ran lint,typecheck,test,build,all exit0. Tests were11unit and4disposablePostgreSQL foundation cases,covering schemas,health/config,migration/seed/FK constraints. A Fastify error-handler override warning was retained. No current Maid browser/gameplay/order/shift/service-loop pass follows from that baseline. M16-01 does not rerun those commands or launch the legacy app/DB. New verification is source/AST/hash inspection and city syntax/lint/governance/diff checks,not fresh legacy runtime success.

## Integration gates and rollback

Subsequent owner decision2026-11-05:reuse rights andcurrentworking-source copy selected explicitly. ADR0085 supplies cleanindependentpinf676298fdab6cd3f2d54ad422f409538c4bdf52a/59files withoriginalrepo untouched. The gate description below is historical;offlineM16-02..06 can nowresume against that archive,not the mutable original tree. No runtime/gameplay success follows from the pin.

ADR0001/B-001 requires an exact clean full implementation snapshot before M16-02..06. Do not auto-commit the owner's active untracked repository. B-002 concerns redistribution,not this local audit. Source feature gaps are later implementation work;they cannot be hidden by a VERIFIED integration label. No real Maid flag,staff grant,reward activation,legacy process/DB/migration/source/media/environment mutation or copy occurs here.

After a stable snapshot/reuse scope is supplied,rerun this audit and compare contracts before implementing identity/role mapping,one hospitality owner,report/block/sanction UX and departure cleanup. Verify customer+staff full service from CityPortal,actual claim races,refusal,block,disconnect recovery and rollback. Keep legacy DB/history unmodified until an approved proof-backed import with backup/restore/uniqueness/rollback is concrete. Independent Library work is ready now.
