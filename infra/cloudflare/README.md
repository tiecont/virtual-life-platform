# Cloudflare private production

This directory defines the owner-only production edge for Aetheria: SoulBound.
The two Workers proxy production hostnames through Cloudflare Access to private
Northflank origins. There is no public route or public release approval; the
repository remains `OFFLINE_ONLY / NO_GO_PUBLIC`.

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
3. Keep both Workers behind the hostname-based `Aetheria Production` Access
   application. Do not enable preview URLs.
4. Deploy from an authenticated Wrangler session with `pnpm cf:deploy:portal`
   and `pnpm cf:deploy:admin`.

The Workers are edge relays rather than Workers builds of Next.js. Their
`FRONTEND` and `API` bindings reach the private Northflank services through
Workers VPC and the named Cloudflare Tunnel. Next.js stays on Northflank.

### Main-only automatic builds

The production portal and admin Workers use main-only Workers Builds triggers
`89f7b0cb-3bb5-435c-8750-d0e84f67e377` and
`93fa5720-4a7e-4dd0-b776-a25d66479fce`. Their build command installs the frozen
lockfile and their deploy commands remain `pnpm cf:deploy:portal` and
`pnpm cf:deploy:admin`. Keep preview branches disabled so feature pushes cannot
create preview URLs or unrelated required-status checks.

The obsolete `virtual-life-platform` prototype retains only a main-only no-op
trigger; its production and preview builds must remain disabled. Northflank
independently builds the frontend and backend services from `main`. There is no
staging environment in this deployment path.

## Files

- `portal-web/wrangler.jsonc`: owner-protected portal/API edge configuration.
- `admin-web/wrangler.jsonc`: owner-protected admin edge configuration.
- `cloudflared/config.yml`: loopback-only origin routing template.
- `readiness.json`: metadata-only target inventory for the private local and
  production asset buckets, final Worker names, MCP target names and Upstash
  production adapter.

Run `node scripts/verify-cloudflare-readiness.mjs` for the deployment readiness
gate. It validates both asset targets remain private, preview URLs and custom
routes stay off, production Worker URLs are enabled, the required VPC bindings
are present, and the production Redis path requires Upstash REST.

## Free-tier guardrails

- Keep every R2 bucket private unless a separately reviewed public-media gate
  approves otherwise.
- Use R2 through its S3-compatible endpoint and keep credentials in the ignored
  environment file or secret store.
- Use Upstash REST over HTTPS and require both `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` together.
- Keep the two `.workers.dev` production URLs behind the hostname-based Access
  application. A Worker without a Cloudflare Access identity must return 403.
- Do not add a DNS custom domain or public route through this scaffold.
- Do not treat a successful local build or a Workers preview as authorization
  for public release, purchases, registration, signing or deployment beyond
  the owner-authorized private target.

The owner has authorized this private, owner-only production deployment. Public
release, purchases, registration, signing and public routing still require their
separate review and release gates.
