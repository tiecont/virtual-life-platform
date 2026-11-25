# Engineering harness source

Keep workflow and checkpoint JSON compatible with any caller of the Node CLI.
Provider-specific Codex settings belong in `.codex/`. Use existing verification
entrypoints with fixed arguments and explicit prerequisite checks.

Keep external workflow operations read-only and scoped to the reviewed target.
Pass credentials by reference. Project tool output into validated fields and
keep raw external text out of summaries, errors and checkpoints. Preserve actual
failure, blocked and unrun classifications.

Run `pnpm test:harness` for changes here. For Codex configuration changes, run
`python3 scripts/engineering-harness/codex-config-check.py` when the installed
CLI is available. Document changes to command contracts in the harness runbook.
