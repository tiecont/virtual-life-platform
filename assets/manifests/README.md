# Private asset manifests

Each private binary asset is represented by
`assets/manifests/<asset-id>.manifest.json`. Only this small JSON metadata is
tracked; the binary belongs in the private S3/Tigris bucket and at the declared
local cache path.

```json
{
  "id": "icarus-wing",
  "version": "1.0.0",
  "stage": "review",
  "s3Key": "assets/icarus-wing/1.0.0/wing.glb",
  "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_CHARACTERS",
  "sizeBytes": 12345,
  "contentType": "model/gltf-binary",
  "localCachePath": ".cache/assets/icarus-wing/1.0.0/wing.glb"
}
```

The manifest filename must match the `id`. `version` is semantic versioning.
`stage` is descriptive metadata only; it does not approve art, rights,
publication, deployment, or release. The S3 key must live under
`assets/<id>/<version>/`, and the cache path must live under
`.cache/assets/<id>/<version>/` while preserving the object filename.

The complete JSON shape is in
[`asset-manifest.schema.json`](./asset-manifest.schema.json). Runtime validation
also enforces the relationships above and checks the content-type/extension
pair.

## Pull and push

Configure the private provider only in local `.env`:

```dotenv
S3_ENDPOINT=https://your-private-s3-or-tigris-origin
S3_BUCKET=your-private-bucket
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

The checked-in `.env.example` contains empty placeholders. Never commit `.env`
or credentials.

```sh
pnpm assets:pull --dry-run
pnpm assets:pull
pnpm assets:push --dry-run
pnpm assets:push
```

Both commands accept repeated `--manifest <repository-relative-path>` options
and `--env-file <repository-relative-path>` to select the local Tigris or
Cloudflare R2 environment file. Without manifests they read all
`assets/manifests/*.manifest.json`. `--offline` is an alias for `--dry-run` and
is useful in CI.

The queued legacy binaries in
[`legacy-migration-plan.json`](./legacy-migration-plan.json) each have one
matching manifest. `node scripts/verify-legacy-asset-manifests.mjs` verifies
the tracked source bytes, sizes, hashes, content types and unique manifest
binding without credentials or network access. The source binaries remain in
place; a manifest is private-delivery metadata, not permission to remove or
publish them.

Dry-run push verifies every declared cache file, size, and SHA-256 before
reporting what would upload. Dry-run pull only reports cached versus pending
files. Neither dry-run mode reads credentials or permits network access. Live
push refuses a changed local file and verifies private object readback after a
conditional upload. Live pull verifies the S3 content type, byte count, and
SHA-256 before atomically installing the cache file.
