# Selected offline source snapshots

The owner selected the current local Deadline/Maid sources and confirmed reuse rights for offline integration.See [ADR0085](../../docs/adr/0085-owner-selected-offline-legacy-snapshots.md) and `approval.json`. Public release and external-media licensing remain separate.

`deadline.tar`/`maid.tar` are immutable Git archives of independent clean snapshot commits. Their JSON manifests record every selected file/hash,upstream HEAD and dirty-source observation. They are baseline data,not active city workspace packages. Real environment files,credential configuration,dependencies,build output and databases are excluded. Do not edit or regenerate a selected archive to hide a mismatch.

Run `node scripts/legacy-snapshots.mjs verify` to validate both archives without executing their code. Run `node scripts/legacy-snapshots.mjs materialize deadline` or `materialize maid` once to create an editable ignored copy under `artifacts/legacy-runtime`. The command refuses existing targets. Dependency installation/builds must be offline in that copy,with separate disposable databases;never use the original apps' environment files,databases or running processes.

The selected Deadline source declares Node26.13.x while this workspace has26.9.0;record actual compatibility results rather than silently changing its declaration. Maid retains its separate Nest12/TypeScript6 toolchain. Its credential-capable `.npmrc` was excluded;use an explicit known local pnpm cache when installing offline. No working seat/focus/service runtime is inferred from the captured foundations.
