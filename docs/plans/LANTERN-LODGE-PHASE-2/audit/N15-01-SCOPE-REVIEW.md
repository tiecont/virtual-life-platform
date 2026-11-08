# N15-01 scope and content review — 2026-11-09

Read all three original rulebooks,match protocol,UX,architecture,quality/provenance and3D addendum against handoff72d3713. ADR0136 records the local decision. No runtime game is implemented by this task.

| Existing module | Current owner/source | Lodge boundary |
| --- | --- | --- |
| M05 World SDK | `packages/world-sdk/src/registry.ts`;`apps/platform-api/src/worlds/service.ts` | Existing registry admission/lifecycle;one Lodge adapter,flags OFF |
| M06 rooms | `apps/platform-api/src/rooms/{authority,service}.ts` | Existing singleton fencing/current membership;table seat is separate |
| M07/N06 presentation | `packages/scene3d`;`packages/game-client`;`packages/client-sdk` | Shared3D animals/creator/portrait/landscape;no private facts in meshes/labels;N06-09 still required |
| M08 safety | `apps/platform-api/src/safety/{runtime,reports}.ts`;`social/service.ts` | Existing visibility/report/block/ban;do not infer permission from public profile or friendship |
| M09 travel | `apps/platform-api/src/travel/service.ts` | Existing explicit travel and receipt owner;roomId-specific table entry |
| M13 cosmetics | `apps/platform-api/src/progression/{appearance,avatar-parts}.ts` | Server cosmetic authority;species/outfit grants no game powers;rewards OFF |
| Identity/N10 | `identity/{service,socket,native-service}.ts`;native custody | Existing session/native ticket and account invalidation;no game token/auth service |
| Operations/N05 | `operations/runtime-lifecycle.ts`;worker entrypoint | Single owner ingress/fencing,recheck after waits;worker never constructs RoomAuthority |

Manual journey reviewed:City→specific Lodge room/table→rules/capacity→explicit Join→Ready→private own projection→intent/ACK→result/rematch/leave. Full/denied,unknown capacity,late ACK,account switch,reconnect,owner loss,deadline,block/travel and independent safety controls have required truthful outcomes;they are scenarios to implement,not executed gameplay. Spectators and all mode/reward exposure remain OFF.

Rule proposal review:Color64-card conservation/Glow/no stacking/ties;Mask72-card conservation/sealed claims/fourth-claim decision/bounded penalties;Routes7×7/bidirectional connectivity/hidden target/minimum-player abort/fairness. Added worked examples,audience and phase timeout notes to immutable v1 copies. Open mechanics are explicitly assigned to N16-01/N17-01/N18-01 before any corresponding runtime. Duration and fun are hypotheses;no synthetic user or balance conclusion.

Content review:three internal original names;no external art/audio/model/card assets introduced. The original naming and genre references do not establish trademark/IP clearance. New media remains NOT_CREATED/owner approval false. Shared animal anatomy/fur/LOD/animation/landscape must follow Phase1 evidence;current technical-room images are not final-art acceptance. Store age/rating,children's privacy,public disclosures,moderation coverage and human pilots remain open.

Imported architecture/UX2D wording is superseded by3D addendum09 and ADR0136. The pack's lowercase installation path is an old proposal;all executed commands and current handoff use the actual uppercase `docs/plans/LANTERN-LODGE-PHASE-2/`. The plan-only validation label describes the checker scope,not runtime proof. Phase1 state/evidence must remain byte-identical to the handoff while this lane runs.
