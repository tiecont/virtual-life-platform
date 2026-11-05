# Evidence inventory and archival preparation

N01-02 implements the [versioned private store and full restore](STORE.md). N01-03 integrates indexed governance/release/ops readers, redirects new measurements into private artifact scopes and proves complete retrieval from the existing immutable private Git history. `evidence:check`, `evidence:check --git-only` and `evidence:restore-smoke` are real commands with actual full-corpus results. Originals remain in place until the separate N01-04 cleanup. No new off-host encrypted destination or independent key custody is provisioned.

N01-01 adds `pnpm evidence:inventory --out artifacts/<private-scope>/inventory.json`. It reads tracked/nonignored paths without loading environment files, follows no symlink targets, computes bytes/SHA-256 for regular unprotected files, and records static evidence references plus directory/template warnings. Output is confined to artifacts and refuses overwrite. It does not move or delete files.

[N01-01-INVENTORY.json](N01-01-INVENTORY.json) is a compact dated summary with the private full manifest hash, classification counts/bytes, reviewed consumers and limits. The scan is a point-in-time workspace observation before checkpoint/report finalization, not Git-history size or all ignored disk usage.

## Decisions and gates

| Group | Inventory decision | Required next proof |
|---|---|---|
| Runtime/source/config/tests/docs | KEEP | Public imports, runtime discovery, fixtures and file readers continue to work |
| SQL and lockfile | KEEP | Never rewrite history/checksums for cleanup |
| Assets/provenance | KEEP | Source/reproducibility/rights unchanged |
| Legacy source archives/manifests | KEEP | `legacy:check` and clean isolated preparation remain available |
| Historical evidence JSON | KEEP_UNTIL_LOADER_MIGRATED | Indexed loader, missing/tampered failures and every verifier/fixture consumer converted |
| Raw PNG/log/exit/text evidence | ARCHIVE_CANDIDATE | Full content hash coverage, private retention/access, actual restore and consumer/link migration |
| Unknown/symlink/protected input | KEEP_REVIEW / KEEP_PROTECTED | Manual ownership review; no automatic content reads or removal |
| Generated outputs if tracked | REVIEW_FOR_REMOVE | Rebuild/consumer proof before any deletion |

No MOVE or REMOVE is approved by this scan. Neither an extension nor absence of a direct import proves a file unused. Static reference edges include output producers as well as readers, and symbolic path construction remains a lower-bound limitation. Unresolved references can be old expressions/relative metadata as well as stale links; they need review, not automatic deletion or a claim that historical tests failed.

## Reader and writer review

`ops-watch.mjs` and its governance fixture parse three M23 JSON observations through indexed hash verification. `verify-release.mjs` validates indexed historical bytes supplied by the release-decision config, retaining all existing controls. `verify-governance.mjs` also verifies the complete historical corpus. `plan-status.mjs` reads the Mxx manifest/metadata and verifies a nonempty evidence/verification field; it does not independently validate raw result bytes. The old ledger remains unchanged and cannot substitute for fresh source acceptance.

Legacy integration audits read dated JSON through the historical reader; all identified browser/load/integration/audit producers now use ignored fresh output scopes. Documentation/image links target the original private Git commit. Static JSON artifact references remain historical metadata, preserving original hashes and source/environment context. See [ADR0103](../adr/0103-indexed-historical-evidence-and-private-git-retrieval.md).

## Verification and continuation

Three isolated governance fixtures exercise real temporary Git trees, exact reader/document references, dynamic path warnings, migration/asset retention, protected/symlink nonreads, no source mutation, and output traversal/symlink/overwrite refusal. Initial missing-module and overly broad “evidence” classification failures are retained; final tests and lint pass with the assertions intact.

N01-02 implements `evidence:check` and `evidence:restore-smoke` before either can be reported passing. Originals remain until full manifest coverage and real restore are demonstrated, then N01-03 migrates readers/gates. Long-term private retrieval and retention must be explicit before N01-04 cleanup. CI artifacts with expiry are never the only archive; no Git history rewrite is authorized.
