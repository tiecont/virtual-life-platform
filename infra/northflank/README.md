# Private Northflank production

Build `infra/northflank/Dockerfile` with the repository root as context. Use the
`frontend` target for the two Next.js processes (TCP 3300 and 3400) and the
`backend` target for NestJS and Rust (TCP 4300 and 4400). Use one instance of
each and keep all Northflank ports private. The Rust process exposes liveness
and intentionally withholds gameplay readiness.

Keep environment values in Northflank runtime variables. The backend needs
`DATABASE_URL`, `WEB_ORIGIN`, `ADMIN_ORIGIN`, `SESSION_SECRET` and a different
`OPERATOR_AUTH_KEY`. Use the Prisma Postgres direct connection for this API
because it holds a session-level advisory lock. Set `DATABASE_POOL_MAX=4` on
the Prisma Free deployment to leave room for database administration. Initialize
only the assigned production database using a one-off backend image job with argument `migrate`.
Starting or restarting the backend service does not run migrations.

Set `API_INTERNAL_URL` and `ADMIN_API_ORIGIN` to the private backend HTTP origin.
Set `PUBLIC_SOCKET_ORIGIN` and `ADMIN_ORIGIN` to the separate, exact HTTPS
origins for the portal and admin. Store `TUNNEL_TOKEN` only on the frontend
service. The connector starts only when that token is set.

The production edge Worker requires a Cloudflare Access-authenticated request in
addition to the application's existing authentication. Use hostname-based
Access policies scoped to authorized production users for the two Worker URLs. Set
`SITE` to `portal` or `admin`, bind `FRONTEND` to the corresponding Workers VPC
service on the private connector, and bind `API` on the portal Worker to the
backend VPC service on port 4300. The portal forwards `/v1` and `/socket.io`
requests to that binding. Keep preview URLs disabled. Verify anonymous requests
are denied, approved reviewers can use both sites, and WebSocket upgrades work
before making the production URL available to authorized users. Rust and PostgreSQL stay on the private network.
