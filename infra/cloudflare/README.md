# Cloudflare deployment scaffold

This directory is an intentionally inactive, two-environment scaffold for
Aetheria: SoulBound. It contains no account identifiers, credentials, tunnel
identity, public hostname, Worker route, or deployment approval. The repository
remains `OFFLINE_ONLY / NO_GO_PUBLIC`.

## Environments

### Local

The local environment uses Docker Compose PostgreSQL and Redis. Redis is an
ephemeral cache only; PostgreSQL remains the authoritative store and the Nest
`RoomAuthority` remains the only legacy room writer.

1. Copy `.env.example` to ignored `.env` and replace every placeholder locally.
2. Run `pnpm db:up`.
3. Run `pnpm dev`.

The local asset CLI reads `S3_*` values from `.env`, so the same command can use
the owner's private Tigris bucket without code changes. Never commit the
populated file.

### Production

The production target is Cloudflare Workers for the portal and admin frontends,
Cloudflare R2 for private assets, Cloudflare Tunnel for private origin access,
and managed PostgreSQL. Upstash Redis REST is optional cache/coordination
infrastructure and never replaces SQL authority.

1. Copy `.env.production.example` to ignored `.env.production`.
2. Fill database, Upstash, R2 and Cloudflare values from the owner's private
   secret store.
3. Replace the placeholders in the two `wrangler.jsonc` templates after the
   Next.js apps have a Workers-compatible build output.
4. Replace the tunnel placeholders in `cloudflared/config.yml` and place its
   credentials JSON outside the repository.

Cloudflare's documented default for adding a Next.js application to Workers is
vinext. This repository currently uses its existing Next.js runtime and has not
performed that migration. The starter Worker files therefore describe the
target shape only and must not be deployed as-is.

## Files

- `portal-web/wrangler.jsonc`: starter Worker/static-assets configuration for
  `apps/portal-web`.
- `admin-web/wrangler.jsonc`: starter Worker/static-assets configuration for
  `apps/admin-web`.
- `cloudflared/config.yml`: loopback-only origin routing template.

## Free-tier guardrails

- Keep every R2 bucket private unless a separately reviewed public-media gate
  approves otherwise.
- Use R2 through its S3-compatible endpoint and keep credentials in the ignored
  environment file or secret store.
- Use Upstash REST over HTTPS and require both `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` together.
- Do not add a Cloudflare route, DNS record, tunnel token, Worker secret, R2
  custom domain or Upstash database through this scaffold.
- Do not treat a successful local build or a Workers preview as authorization
  for public release, purchases, registration, signing or production
  deployment.

Owner review is required before any Cloudflare resource is created, connected,
or deployed.
