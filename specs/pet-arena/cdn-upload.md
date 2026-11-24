# Concept CDN upload (Cloudflare R2)

`pnpm cdn:upload` publishes the Wave 1 concept workspace to R2 and refreshes the committed CDN manifest.
It uses the existing `S3_*` settings in `.env` as defaults and lets you choose the destination on every run.

It is idempotent: objects already present with the same byte size are skipped; missing or size-changed objects are uploaded.

## Commands

```bash
pnpm cdn:upload:dry   # HEAD only: show what would be uploaded, write nothing
pnpm cdn:upload       # upload missing/changed files, then write the manifest
pnpm cdn:upload --force
pnpm cdn:upload --endpoint https://... --bucket my-bucket --prefix releases/v2 --public-base https://cdn.example.com/releases/v2
```

## Configuration

The existing `.env` values are the default target:

```dotenv
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_BUCKET=<bucket>
S3_ACCESS_KEY_ID=<access key>
S3_SECRET_ACCESS_KEY=<secret>
S3_REGION=auto
```

Every destination can be overridden per command with `--endpoint`, `--bucket`, `--prefix` and `--public-base`.
There is no manifest-target guard: the target you pass is the target used. If you switch endpoint/bucket without passing
`--public-base`, the manifest records keys but leaves `cdnUrl` null until a public base is supplied.

Secrets are never written to the manifest or printed. `.env` stays git-ignored.

## What it uploads

- `concepts-v2/*.png`, `concepts-v3/*.png`, `concepts-v4/*.png`
- `icarus/icarus-s-limited.png`
- `review-all.html`, `concepts-v2/review.html`, `concepts-v3/review.html`
- `concepts-v*/prompts.json` and `concepts-v*/ledger.json`
- `concepts-v*/contact-*.jpg`
- The three art-bible/power-tier Markdown documents under `specs/pet-arena/`

## Output manifest

`specs/pet-arena/mvp-wave1-cdn-assets.json` is written atomically after a successful run. Each entry records the key,
public CDN URL (or null), byte size, SHA-256, content type, upload status and ETag. It also stores the target endpoint,
bucket, prefix, review-sheet URLs, access notes and the Unity-build status. The manifest is not written if any upload
or HEAD check fails.

## Options

- `--dry-run`: HEAD only, no upload, no manifest write.
- `--force`: re-upload every file even if the size matches.
- `--endpoint <https://...>`: override `S3_ENDPOINT`.
- `--bucket <name>`: override `S3_BUCKET`.
- `--region <name>`: override `S3_REGION` (default `auto`).
- `--prefix <path>`: destination key prefix; defaults to the manifest prefix.
- `--public-base <https://...>`: public URL base for the manifest.
- `--workspace <path>`: override the concept workspace path.

## Notes

- There is no target guard, so double-check `--endpoint`/`--bucket` when using non-default destinations.
- The current URL is an **R2.dev public development URL**: rate-limited and not recommended for production. Connect a
  custom domain to the bucket before production use; update `--public-base` and rerun `pnpm cdn:upload`.
- R2 has no CORS policy configured. Pages that load the assets directly (the review HTML) work; browser `fetch` calls
  from another origin will need a CORS policy.
- A production-ready Unity player is not part of this upload; `ProjectBuild.Linux` builds a Development player only.
