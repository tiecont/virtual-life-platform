# N01-02 — private evidence index, archive and restore

The committed [index](index.json), described by [INDEX.schema.json](INDEX.schema.json), pins all 3,586 original historical evidence files by path, byte size, plaintext SHA-256 and authenticated-object ciphertext SHA-256. The index records the source snapshot, creation time, key ID and restricted retention policy. It contains no key or raw screenshot/log. The [actual full restore summary](N01-02-RESTORE.json) records counts/hashes and local references.

## Access and retention

This is an **additional private local archive**, not the only retained copy, public-safe content certification or durable off-host backup. Originals and Git history are preserved. Treat the corpus as restricted project-generated test/security fixture material, potentially containing synthetic account identifiers and security examples. It has not been approved for public browsing or uploaded externally. No production/player data was collected for this task.

Ciphertext is under ignored `artifacts/evidence-store/n01-02/`; a separately generated 32-byte owner-only key is under ignored `artifacts/evidence-keys/n01-02.key`. Do not print or commit the key, place it inside the archive, or transfer it with ciphertext. Directories/files are private; tooling rejects symlinks and non-owner/private key permissions. Retention is until owner cleanup while originals/Git remain; there is no automatic erasure, expiry-URL dependency or provisioned off-host destination. Independent key custody and tested durable retrieval must be established before making this archive the only current-tree retrieval path.

The archive policy always says `cleanupAuthorized=false`. An archive/check exit 0 cannot authorize N01-04 removal. N01-03 must migrate readers/writers and preserve release gates first; N01-04 must separately prove portable access/retention. Missing credentials/storage do not block independent runtime/UX/image work.

## Commands that actually exist

```sh
pnpm evidence:inventory --out artifacts/my-review/inventory.json
pnpm evidence:archive --store artifacts/my-store --key-file artifacts/my-keys/evidence.key
pnpm evidence:check
pnpm evidence:check --archive
pnpm evidence:restore-smoke --target artifacts/my-new-restore
```

Choose new output paths for archive/restore; existing targets are refused. `evidence:check` defaults to `docs/evidence/index.json` and verifies originals by their pinned hashes, using authenticated archived objects only when an original is missing. An existing mismatched original fails rather than silently falling back. `--archive` verifies every unique encrypted object independently of originals. `--index`, `--store` and `--key-file` select explicit repository-relative locations; `EVIDENCE_STORE_DIR` and `EVIDENCE_KEY_FILE` can select private local defaults without application secrets. No network download, environment-file loading, bucket upload or remote credential provisioning is performed.

The runtime-independent API is `readEvidenceBytes(path, {root,index,store,key})`; future readers can parse only the expected JSON after indexed hash/authentication succeeds. Paths must exist in the index under `docs/agent/evidence/`. Arbitrary path traversal, source symlinks and unversioned/duplicate/boundedness-invalid indexes fail. CLI static validation is stronger than the descriptive JSON schema for traversal, duplicate paths, deduplicated-object consistency and manifest totals.

## Format and verification

Objects use Node's AES-256-GCM with a fresh random 12-byte nonce per distinct plaintext object and a 16-byte tag. The `VLPEVID1` header and plaintext digest are bound to the format/AAD; the index pins ciphertext and plaintext hashes. Ciphertext objects are named by plaintext SHA-256 for deduplication. A key is newly generated per archive and never derived from app/session credentials. [Node crypto API](https://nodejs.org/api/crypto.html#class-cipheriv).

The loader bounds each file to 64 MiB, the complete plaintext corpus to 256 MiB and entries to 10,000. Restore authenticates the complete bounded object set before creating its new private target, writes with no-overwrite semantics, then reads back and checks every restored file. Raw originals are never modified or deleted. Keys and decrypted restore buffers are cleared from the tool's explicit buffers after use; this is not an OS/process memory-erasure guarantee or a multi-user sandbox.

Actual corpus verification produced 1,955 unique objects and restored all 151,876,136 source bytes across 3,586 paths. Five isolated governance cases also cover missing source fallback, wrong key, corrupted ciphertext, original mismatch, missing object, traversal/duplicate/bounds/version errors, output symlink/overwrite refusal and key permissions. No historical test is rerun merely by reading its archived result.

N01-03 adds the [historical reader](../../scripts/evidence-reader.mjs) to governance/release/ops-watch and fixtures, preserving all original assertions and original SHA/environment applicability. Its separate [Git snapshot mapping](git-snapshot.json) binds the unchanged index hash, original revision, paths, sizes and Git blob IDs. The existing private remote tree and all local Git-only bytes were actually checked. `pnpm evidence:check --git-only` exercises retrieval without reading originals, key or encrypted objects. Full history is required; Git reads do not fetch on demand. Missing originals/archive fall back to Git; existing mismatches and authentication failures still fail. See [ADR0103](../adr/0103-indexed-historical-evidence-and-private-git-retrieval.md) for access, retention and full-clone tradeoffs.

Fresh browser/integration/load/audit outputs now use `evidenceOutput()` under ignored private local run directories, or `artifacts/ci/<group>/<spec>/evidence/` within the existing CI upload scope. Historical input reads stay indexed. Raw doc links use the original private Git commit and require authenticated repository access. N01-04 remains a separate cleanup task; no source, SQL, lockfile, provenance or legacy fixture is a deletion candidate here.

A standalone custom `--index artifacts/.../index.json` still checks its originals or authenticated archive without requiring a Git snapshot. Supply a matching `--git-index` for custom Git fallback, or `--git-only` to explicitly exercise it. The canonical default always requires the committed matching Git metadata.
