# Deadline adapter — local backend contract

M15-03 embeds the configuration of owner-selected Deadline snapshot6d2ca6a4 into the shared City World/Room/Focus contracts. The actual source exports30 seats (`seat-01`…`seat-30`) in a960x640 layout;the selected seed exposes a40-place room through working catalog HTTP. Tests compare the adapter to those actual compiled exports and a separately migrated/seeded legacy API,not a synthetic travel target. Original worktrees,processes and databases remain untouched.

The selected source has no room/seat WS authority or focus service. City supplies the missing authoritative gameplay through existing shared owners;it does not run a second legacy timer/seat owner. Legacy catalog UUIDs are independent configuration IDs and cannot be forged as City membership/room authority. The old catalog's unmounted occupancy callback still reports zero independently;City room counts come from its own Room owner. No synchronization of independent source presence or history import is implied.

`@virtual-city/deadline-world` provides the versioned `deadline` definition,seat IDs,capacity40 and lifecycle/travel hooks. It imports only public contracts/SDK. Runtime installation requires `LOCAL_DEADLINE_WORLD=1` in dev/test plus an independent `deadline:true` world flag. Both default OFF;production rejects the local option. The optional M15-02 source-cookie association is a separate consent feature and does not grant admission or become mandatory for City gameplay. City session/Origin/CSRF/socket membership and shared safety remain authoritative.

| Shared contract | Deadline behavior |
|---|---|
| `room.join/snapshot/leave` | schemaVersion1/current session/version/epoch/membership;capacity40;no rooms created by directory reads |
| `seat.claim/release` | exact zero-padded source IDs;one owner/seat;canonical retry cannot add a seat |
| `/v1/focus` | own current connected seat;strict duration900/1500/3000;one active timer across all worlds |
| pause | forbidden by Deadline policy,matching the selected active/completed/cancelled SQL model |
| finish/cancel/history | private persisted shared engine outcome;server deadline;completion retry once;leave/restart does not reset deadline |
| public presence | may reveal the user's permitted profile,never focus ID/time/task text;task-note input is rejected |
| disconnect | shared15second hold/reconnect;expiry frees the seat while private focus remains available |

The actual concurrency proof distinguishes sixteen real Socket seat contenders from the capacity test's35 controlled owner memberships plus6 actual Socket admissions. Five of those six enter,one is full,total40 in one room. This is a regression of the configured boundary,not a40-client performance/load certification. The source guest/catalog baseline tests and own City/legacy databases are isolated. No timer ticks are broadcast or written each second.

M15-03 is backend verification. There is no Deadline scene route yet:source scene conversion/shared native shell/avatar and Portal navigation are M15-04. Invitation/safety journeys are05,performance/accessibility/migration/rollback06. Do not mark the module or whole plan complete from these tests. The old container image has not been rebuilt for this slice;hosted CI/public/operator gates remain separate.

Reproduce after `pnpm install --offline --frozen-lockfile --ignore-scripts` and `pnpm legacy:prepare`:build packages,then `node scripts/with-test-db.mjs pnpm exec vitest run --project integration tests/integration/deadline-world.test.ts`. The selected source fixture performs its own real migrations/seed and uses a generated separate database. City migration remains0037;this slice adds no table or retained-data change.
