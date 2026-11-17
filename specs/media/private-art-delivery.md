# Private art delivery (VL-170)

This Node CLI prepares a local, private stage and can deliver an explicitly
reviewed batch to Cloudflare R2 or `https://t3.storage.dev` using S3 SigV4.
It does not implement the remaining database ingest, operator HTTP authorization,
signed preview access or public release portions of VL-170. No MinIO service,
new application stack, credentials or approved art are supplied.

The owner has already authorized routine private delivery after the art
foundation passes. No additional owner or public-release approval is required
for that scoped private delivery. The current art gate must actually pass before
an operator invokes `upload`.
The tooling does not infer visual acceptance from a hash, a green test, a draft
manifest or a successful stage. It never creates its own review receipt.

## Local manifest and stage

Keep inputs, stages, receipts and environment files under ignored `artifacts/`.
Run from the repository root. Paths are relative to the root; source file paths
are relative to `--source`. Absolute paths, traversal, symlinks, URL paths,
unsupported extensions, duplicate paths (including case variants), extra JSON
fields and MIME mismatches are refused.

An input manifest has exactly these fields (replace the illustrative hash and
size with the actual file's values):

```json
{
  "schemaVersion": 1,
  "characterId": "icarus",
  "designRevision": "review-candidate-v1",
  "publication": "UNPUBLISHED",
  "files": [
    {
      "path": "preview.glb",
      "bytes": 1234,
      "sha256": "REPLACE_WITH_ACTUAL_SHA256",
      "mime": "model/gltf-binary"
    }
  ]
}
```

```sh
node scripts/private-art-delivery.mjs stage \
  --source artifacts/art-input \
  --manifest artifacts/art-input-manifest.json \
  --output artifacts/art-stage-v1
node scripts/private-art-delivery.mjs verify --stage artifacts/art-stage-v1
```

Staging copies bytes without modifying originals. The stage directory is mode
0700 and its files are 0600. An existing output directory is never overwritten.
A failed stage has no terminal `manifest.json` and cannot be uploaded. Preserve
or remove a partial stage deliberately, then use a fresh output path. Use a
trusted local operator workspace; a concurrent malicious process running as the
same OS user is outside this boundary.

Limits are 1 MiB per JSON document, 1,000 files, 256 MiB per file and **10 GB
(10,000,000,000 bytes) per manifest/batch**. The smaller file limit keeps
bounded buffers and a single conditional PUT; multipart is intentionally absent.
The CLI cannot measure an account-wide quota without inventory access. If 10 GB
is also the account budget, the operator must reserve capacity across all batches
and enforce that quota at the provider before authorizing a receipt.

Accepted MIME/extension pairs are PNG (`image/png`), WebP (`image/webp`), GLB v2
(`model/gltf-binary`), uncompressed Blender (`application/x-blender`), binary FBX
7.x (`application/vnd.autodesk.fbx`), MP4 (`video/mp4`) and WAV (`audio/wav`).
Content signatures/container checks supplement size, extension and SHA-256
checks. They do not replace a full decoder, malware scan, actual Blender/Unity
import or visual/technical art review. Text SVG, HTML, JSON sidecars, archives,
ASCII FBX and external/embedded GLB URI dependencies are refused. Stage any
separate accepted textures as explicit manifest entries.

## Separate review and private destination

A trusted reviewer creates a local receipt only after reviewing the exact staged
manifest and its content. Review covers the art foundation and technical checks
for the files in this delivery, the existing private-delivery authorization, and
the destination's access configuration. It does not require a finished animation
library, final Unity qualification, public release or completion of VL-171. The review
expires within seven days. The following is an **invalid template**, not approval:

```json
{
  "schemaVersion": 1,
  "manifestSha256": "REPLACE_WITH_STAGE_MANIFEST_SHA256",
  "artGate": "REVIEW_REQUIRED",
  "technicalGate": "REVIEW_REQUIRED",
  "rights": "REVIEW_REQUIRED",
  "reviewedBy": "reviewer-id",
  "reviewedAt": "REPLACE_WITH_REVIEW_UTC_TIME",
  "expiresAt": "REPLACE_WITH_EXPIRY_UTC_TIME",
  "target": {
    "provider": "r2",
    "endpoint": "https://ACCOUNT_ID.r2.cloudflarestorage.com",
    "bucket": "private-art",
    "region": "auto",
    "publicAccess": "REVIEW_REQUIRED"
  }
}
```

The rights field records the existing authorization for private delivery; it
does not ask for public licensing or a new owner decision. Actual accepted
values are `PASS` for art/technical, `PRIVATE_DELIVERY_APPROVED`
for rights and `DISABLED` for public access. The target must match all four
runtime destination fields exactly. For R2, disable public development URLs,
custom domains and other public delivery routes. For t3, verify private bucket
policy and ACL configuration. Deny anonymous read/list and public grants; use
credentials restricted to PUT/GET on the private-art prefix. Do not grant bucket
administration or object deletion to this uploader. The CLI sends **no ACL
header** (R2 does not support S3 ACL management), listing or bucket mutation.

The receipt is a trusted local operator attestation, not a provider-signed proof
or automated ACL audit. It must be supplied independently from untrusted art
inputs. Pin its exact SHA-256 through `--review-sha256` after review, not by
blindly hashing an incoming receipt immediately before upload. Its pin prevents
later substitution; it cannot establish that a dishonest reviewer performed the
review. No third-party privacy probes are run by this tool.

## Credentials and delivery

Supply configuration only in the uploader process environment, using a protected
local environment file or the operator's secret manager:

- `ART_S3_PROVIDER`: `r2` or `t3`.
- `ART_S3_ENDPOINT`: exact HTTPS origin. R2 accepts a 32-character lowercase hex
  account ID followed by `.r2.cloudflarestorage.com`; t3 accepts exactly
  `https://t3.storage.dev`. Custom endpoints, ports, credentials in URLs, paths,
  queries, redirects and MinIO are refused.
- `ART_S3_BUCKET`: a lowercase DNS-style bucket name without dots.
- `ART_S3_REGION`: `auto` for R2; the region configured by t3 for that bucket.
- `ART_S3_ACCESS_KEY_ID`, `ART_S3_SECRET_ACCESS_KEY`, and optional
  `ART_S3_SESSION_TOKEN`: scoped credentials. Never put them in a manifest,
  receipt, command argument, source file, commit or shared log.

Only after the real review gate passes:

```sh
node --env-file=artifacts/private-s3.env scripts/private-art-delivery.mjs upload \
  --stage artifacts/art-stage-v1 \
  --review artifacts/art-review.json \
  --review-sha256 REVIEWER_SUPPLIED_RECEIPT_SHA256
```

Objects use
`private-art/v1/<characterId>/<designRevision>/<manifestHash>/<fileHash>.<ext>`.
The signed PUT includes `If-None-Match: *`, MIME, SHA-256 metadata and
`Cache-Control: private, no-store`. A provider lacking conditional PUT support
fails closed; no unconditional fallback exists. Successful PUT and existing-key
412 responses both require a signed GET and actual SHA-256/length/MIME/cache
header verification. ETags alone are never trusted. No manifest is uploaded and
no listing endpoint, public URL or presigned URL is emitted.

The complete local batch passes verification before any network call. The gate
and each file are checked again before each object PUT. A timeout (60 seconds
per request), expiry, corruption, network error or readback failure stops the
batch. Earlier verified objects can remain private; there is no destructive
rollback. Retrying the same reviewed batch safely verifies existing objects.
A changed byte or manifest produces a different key. Provider permissions must
also prevent other writers from replacing/deleting these keys: conditional PUT
is this client's immutability guarantee, not storage Object Lock.

Errors are deliberately generic and never echo credentials, paths, URLs,
headers or provider response bodies. Local `stage`/`verify` can diagnose content
preflight without using a network or credentials. Success reports hashes and
counts only. No R2/t3 endpoint has been contacted by the automated tests; the
owned loopback S3 fixture checks signed requests, conditional writes, readback,
privacy headers and negative paths. Provider compatibility and actual private
configuration remain deployment acceptance work.
