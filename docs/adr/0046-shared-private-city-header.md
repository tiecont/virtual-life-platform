# ADR0046 — Shared own identity and last-checked visit

Status: local implementation; actual verification in m14-header-checks.json.

A persistent client header in the root layout provides the same identity/avatar, own last-checked visit and native Friends/Invitation inbox/Travel desk navigation on all routes. Existing local page controls remain distinct, with unique accessible names. The global avatar uses the public profile palette and casual original art; world uniforms and entitlement inventory stay in their own context. Missing art retains identity text/navigation. The center links to existing guarded social/invitation flows and displays no contact suggestions, peer locations or invented unread counts.

Header reads use authenticated no-store me/own-room/catalog endpoints with an8second deadline. It neither opens a socket nor attaches room membership. It refreshes on route/identity changes,visibility/reconnect,manual action and every30seconds while visible. UI calls the visit last checked, not live presence. Pending old reads are aborted and cannot restore a former identity after logout. Unknown room/catalog reads yield an unconfirmed visit instead of inventing a location.

Only the title of an own approved listed public destination can appear. An own context absent from the approved catalog or requiring separate permission is labeled Private visit. The rule is unit-tested with hidden dating/protected context without enabling adult access. Actual browser tests verify public visit,identity retention,native navigation and current enter/leave hints.

Room and travel views emit a version-only BroadcastChannel refresh hint after authoritative membership changes. No account,world,room,profile or capability is in the hint; header always re-reads server state. Arbitrary hint payloads do not supply a destination. Membership-key deduplication and100ms hint coalescing avoid per-motion refreshes. Older browsers without BroadcastChannel use same-page hints plus the existing route/visibility/manual/30second read path; no cross-tab guarantee is claimed there.

The enlarged full browser suite hit real shared loopback budgets: initial desktop26pass/2fail included guest429 and catalog429. Full default harness runs now give each spec/device its own API/DB lifetime, retaining actual runtime limits and test assertions. Explicit filtered invocations keep their requested batch. Per-batch exit artifacts and original failures are retained. This also prevents unrelated spec state/grace holds from coupling positive occupancy assertions. No application rate limit or timeout was raised.

No API/schema/migration or real rollout flag changes. Local Next server/client and usePathname guides were read before implementing the root client boundary. Rollback removes the header/hints while preserving existing route identity and backend state. No operational release,real-world adapter or public contact graph is implied.
