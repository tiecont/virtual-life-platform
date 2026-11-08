# Game journal key custody — local foundation

`GAME_STATE_KEY` is an independent32-byte hex root. `GAME_STATE_KEY_ID` starts with `game-`. Leave the journal off unless that root is available through private runtime custody. Reusing player, native, operator, safety or dating keys is rejected. Keep the game root stable for any retained ciphertext; changing its ID/value does not decrypt or rekey old matches.

Backups contain ciphertext and public key IDs. The archive wrapping key and the game root have separate purposes and must be held separately from the archive and repository. A restored archive alone cannot expose hands/roles/decks/targets/seeds. The owned restore test generates temporary separate keys, checks an incorrect wrapping key before SQL and an incorrect game key after restore, then removes its temporary secrets/archive. It is not an operated custody/rotation/offsite/PITR service.

After restore or owner restart, old room membership is absent. The foundation aborts old-epoch state rather than restoring consent or inventing a winner. Missing/corrupt keys can also be handled by the metadata-only abort path: destroy ciphertext, release claims, preserve sanitized receipts/results and require a fresh consented match. Do not introduce a default key, expose secrets to an admin view, or publish an encrypted payload as a public projection.

Local verification commands (results belong to their recorded source SHA):

```sh
pnpm test:games
pnpm game:restore:smoke
pnpm game:migration:compat
```

The compatibility drill rebuilds Git5b020fc's46-aware API/shared packages and uses the explicit46→47 policy. Normal runtime/migrator defaults remain strict. Never run a destructive down migration on retained data. Production key management, legal retention, public mode activation and distributed-owner routing remain separate unpassed gates.
