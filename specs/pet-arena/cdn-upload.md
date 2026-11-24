# Concept CDN upload (Cloudflare R2)

`pnpm cdn:upload` publishes the Wave 1 concept workspace to R2 and refreshes the committed CDN manifest.
It uses the existing `S3_*` settings in `.env` (the same keys as `assets:push`) and adds no separate CDN configuration.

It is idempotent: objects already present with the same byte size are skipped; missing or size-changed objects are uploaded.

## Commands

```bash
pnpm cdn:upload:dry   # HEAD only: show what would be uploaded, write nothing
pnpm cdn:upload       # upload missing/changed files, then write the manifest
pnpm cdn:upload --force
```

## Configuration

Use the existing `.env` values; make sure they point at the CDN bucket:

```dotenv
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_BUCKET=<bucket>
S3_ACCESS_KEY_ID=<access key>
S3_SECRET_ACCESS_KEY=<secret>
S3_REGION=auto
```

The public CDN base and key prefix are read from `specs/pet-arena/mvp-wave1-cdn-assets.json`, so a normal run needs
no extra variables. When the domain or prefix changes, pass `--public-base` / `--prefix` once and the manifest is
updated from the new values.

Secrets are never written to the manifest or printed. `.env` stays git-ignored. The script also aborts when `S3_ENDPOINT`
or `S3_BUCKET` differ from the values in the existing manifest, so a stale `.env` cannot silently upload to another bucket.

## What it uploads

- `concepts-v2/*.png`, `concepts-v3/*.png`, `concepts-v4/*.png`
- `icarus/icarus-s-limited.png`
- `review-all.html`, `concepts-v2/review.html`, `concepts-v3/review.html`
- `concepts-v*/prompts.json` and `concepts-v*/ledger.json`
- `concepts-v*/contact-*.jpg`
- The three art-bible/power-tier Markdown documents under `specs/pet-arena/`

## Output manifest

`specs/pet-arena/mvp-wave1-cdn-assets.json` is written atomically after a successful run. Each entry records the key,
public CDN URL, byte size, SHA-256, content type, upload status and ETag. It also stores the CDN base, review-sheet
URLs, access notes and the Unity-build status. The manifest is not written if any upload or HEAD check fails.

## Options

- `--dry-run`: HEAD only, no upload, no manifest write.
- `--force`: re-upload every file even if the size matches.
- `--public-base <https://...>`: override the manifest's public base.
- `--prefix <path>`: override `CDN_PREFIX` / the manifest prefix.
- `--workspace <path>`: override the concept workspace path.
- `--allow-target-change`: allow S3_ENDPOINT/S3_BUCKET to differ from the manifest target. Without it the script aborts, so a stale `.env` cannot upload to the wrong bucket.

## Notes

- The current URL is an **R2.dev public development URL**: rate-limited and not recommended for production. Connect a
  custom domain to the bucket before production use; update `--public-base` and rerun `pnpm cdn:upload`.
- R2 has no CORS policy configured. Pages that load the assets directly (the review HTML) work; browser `fetch` calls
  from another origin will need a CORS policy.
- A production-ready Unity player is not part of this upload; `ProjectBuild.Linux` builds a Development player only.