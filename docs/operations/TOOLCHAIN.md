# Pinned toolchain and build targets

N03-01 preserves the audited versions. No dependency, lockfile, compiler target or runtime stack upgrade is part of this slice. The [checked source map](../../config/build-targets.json) records the exact Node/pnpm pins, lock/workspace configuration hashes, all direct dependency declarations, build targets and transitive application consumers.

| Component | Pin | Verification scope |
|---|---|---|
| Node | 26.9.0; root engine 26.9.x | Actual local runtime; `.node-version` is used by all current Quality jobs. N02-04 also source-built and exercised an image with this runtime. |
| pnpm | 11.28.5 | Actual local executable, `packageManager`, both Quality install jobs and the existing Docker build agree. Frozen root install is checked separately. |
| TypeScript | 5.9.3 | Installed root dependency; shared compiler configuration retains ES2022/CommonJS where applicable. |
| API | Nest 11.2.8, Fastify 5.12.8, Drizzle 0.45.4, pg 8.23.1, Socket.IO 4.8.4 | Installed direct declarations, type checks, real PostgreSQL/HTTP/socket integration and API build. |
| Web | Next 16.4.4, React/React DOM 19.3.1, Pixi 8.22.0 | Installed direct declarations and portal/shared package production builds. Physical mobile compatibility is a separate gate. |
| PostgreSQL | Test/Compose tag 17.7 | Existing disposable integration harness; this task does not pin a new database image digest or approve production migration. |
| Legacy sources | Independent selected Deadline/Maid pins and locks | Deadline declares Node 26.13.x while the platform uses 26.9.0; the known mismatch remains disclosed. Maid allows Node >=24 <27. No legacy source or lock upgrade is inferred. |

The current graph has 14 workspaces: two applications and 12 shared packages. Ten shared packages compile; `config` supplies compiler configuration and `ui` exports source CSS without a compilation target. Both applications and all ten compiled packages participate in `pnpm -r build`. The graph's order is a valid dependency order, not a promise of pnpm's concurrent execution schedule. Root test tooling is recorded separately from application consumers.

Shared contracts reach both API and portal; renderer/focus UI changes reach their declared portal consumer. The map also follows local TypeScript `extends` files and records their hashes: shared compiler config reaches API directly and portal through compiled packages. Even a source-only package or configuration change retains the initial build-all policy. This static map, architecture/import guards and actual builds remain complementary evidence. There is no affected-build optimization or application filter that could omit another consumer. Nonlocal/multiple compiler parents require an explicit tooling update before acceptance.

Run `pnpm toolchain:check` after install. It checks the source map, exact installed versions, Node/pnpm runtime, complete build commands and Quality's frozen/read-only toolchain contract. `pnpm ci:check` includes this check and retains action-pin, browser coverage and aggregate failure checks. `pnpm check` remains the full application verification contract. Raw generated snapshots, logs and image build contexts under ignored `artifacts/` are excluded from ESLint; application, package, script and test source remain checked.

When adding a workspace or changing dependencies, regenerate with `pnpm toolchain:map`, inspect the graph/pin/lock diff, then run frozen install and applicable verification. Generation is not verification. A version upgrade needs its own rationale and tests; do not regenerate the map merely to conceal an unexplained change. Future native/admin source must acquire an explicit target before being called built.

Current evidence is Linux x64 on the local CachyOS workstation. Root install may reuse the local store; N01-05's clean clone and N02-04's source-built image are separate, scoped prior evidence. No new hosted run, fork execution, branch protection, alternate CPU/OS or device certification follows from local checks. Quality remains read-only with no production secrets or publish job. Trusted publishing and hardened split images remain N03-02…04.
