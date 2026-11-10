# Pure GameSession foundation

This private workspace contains deterministic reducer routing,strict projection helpers,host-abort state preparation and sampling over supplied entropy words. It has no system clock,RNG,I/O,logging,room owner or built-in game mode. Inputs are bounded plain JSON and are isolated/frozen before a reducer runs.

`GameRulesEngine` defaults to an empty registry. Actual mode rules arrive only in their gated tasks. Do not treat test adapters as playable modes. The server must authenticate/fence and recheck current room/session/policy/deadline before persisting;core effects are intentions,not completed broadcasts or timers. Internal state contains secrets:only parsed recipient projections may leave the host.

See repository ADR0137 and the Phase2 `contracts/GAME-SESSION-v1.md` for the implemented signatures. Run the actual root `scripts/boardgame-boundary.mjs` and `tests/games/contracts.unit.test.ts` checks before adding reducers.
