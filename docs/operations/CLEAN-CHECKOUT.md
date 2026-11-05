# Full-history clean checkout after evidence cleanup

Use the repository-pinned Node/pnpm versions. Install Docker for the disposable integration database; browser verification additionally needs Chromium and built apps. Selected Deadline/Maid source archives are tracked fixtures; their prepared copies must be generated in ignored artifacts. Production data and the original sibling application worktrees are not needed.

The canonical historical evidence reader needs either full local Git history or the separately authenticated private archive. A shallow clone without those inputs fails closed. For an existing shallow clone, explicitly fetch full history from its authorized remote before verification. CI core/browser checkouts now use `fetch-depth: 0`; their hosted execution is separate evidence.

These commands exist and must be run in the checkout being assessed:

```sh
pnpm install --frozen-lockfile
pnpm legacy:prepare
pnpm evidence:check
pnpm check
```

`legacy:prepare` uses offline dependency preparation by default. On a machine without cached selected-source dependencies, explicitly run `node scripts/prepare-deadline-baseline.mjs --allow-network` and `node scripts/prepare-maid-baseline.mjs --allow-network`, then rerun the required preparation/check. There is no implicit online fallback, and no result can be inferred from these instructions. The Deadline snapshot declares Node 26.13.x while this repository pins 26.9.x; preserve and report that warning rather than rewriting selected source.

The N01-05 verification uses a separate full-history clone of committed `6a7ae9328cb64e76fc1ec5c4ffa4df1ce1815a75`, created with `--no-local --no-hardlinks`. It starts with no `.env`, `.env.safety`, `node_modules`, author artifacts, archive/key, shallow boundary or Git object alternates. Its global pnpm cache can be warm; this is not a cold network-install or hosted GitHub clone measurement. Actual outcomes and logs belong in the task checks after commands finish.

[Actual N01-05 outcomes](../evidence/N01-05-CLEAN-CHECKOUT.json): frozen install, explicit network-enabled selected-source preparation, required preparation rerun, complete indexed evidence check and full `pnpm check` exit 0. All 44 governance cases, 278 unit tests and 553 integration tests pass; API/portal production builds finish. The first offline preparation failed on absent cached packages; the prematurely started aggregate was stopped before DB work and both failed attempts are retained. The final clone remains tracked-clean, all 38 historical SQL files match the baseline, and the owned test DB is removed. No E2E/device/deployment result is inferred.

Fresh browser/load/integration/audit measurements write to ignored artifact scopes. Historical inputs remain tied to their original hashes/revision, so a fresh run cannot overwrite their meaning. Evidence summaries and immutable private links remain tracked. The [cleanup measurement](../evidence/N01-04-CLEANUP.json) covers the exact deletion boundary; committed before/after tracked-blob sizes in N01-05 additionally include checkpoint documents. Neither measure claims `.git`, installed dependencies, local archives or total disk usage has shrunk.
