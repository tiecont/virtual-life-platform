# Local web and server containers

Use the existing independently packaged nonroot API and Next standalone images.
This profile runs production artifacts with their normal closed rollout policy.
It does not enable local-only worlds, games, native auth, admin or public release.
One API owns rooms. Migrator uses exactly the same immutable API image ID.

Requirements: repository Node/pnpm pins, Docker Engine/Compose, Linux `ip`,
OpenSSL and Chromium (`pnpm exec playwright install chromium`).

```sh
pnpm install --frozen-lockfile
# Build and test the committed HEAD, not the dirty working tree.
pnpm image:check --target=web
# Substitute the facts.json path printed by the successful image check.
pnpm docker:prepare --facts artifacts/image-web-<id>/facts.json
pnpm docker:up
pnpm docker:status
```

Open **https://localhost:3443**. The local certificate is self-signed; trust only
the generated `artifacts/local-docker/tls/cert.pem` in your development browser
or use `curl --cacert artifacts/local-docker/tls/cert.pem https://localhost:3443/health/ready`.
Never disable TLS checks globally. This certificate expires after 90 days.

Names: `vc-db`, `vc-migrate`, `vc-api`, `vc-web`, `vc-edge`.
The migrator exits successfully after applying additive SQL. The other four
services have health checks (edge checks listener liveness; `docker:up` also
verifies TLS/API readiness with the generated certificate). Only TLS port 3443 is published, on 127.0.0.1;
web, API and database stay on the private Docker network. No host DB port.
The generator inventories host/Docker subnets and refuses name/port conflicts.
Images must have matching source labels and immutable local IDs. These IDs
are local Docker identities, not claims of published registry digests.

Secrets and certificate key are generated in ignored mode-700
`artifacts/local-docker/`; `runtime.env` and the key are mode 600.
The web receives only its runtime API/socket origins, never DB/session secrets.
Preparation refuses to overwrite an existing environment. Keep that directory
with the retained `vc_data` volume; deleting credentials will not reset PostgreSQL.

```sh
pnpm docker:stop   # Retain containers and database.
pnpm docker:up     # Resume; migration rerun is idempotent.
pnpm docker:down   # Remove only this stack's containers/network; retain database.
```

Never use `down --volumes` on this retained stack. To update selected images,
stop the stack first, back up the database and private environment, qualify the
new images/schema, then edit only VC_API_IMAGE/VC_WEB_IMAGE in the private env
and corresponding selection.json. Do not change session/DB secrets casually.
Downgrading an image whose strict migration manifest differs is not a safe
rollback; use a separately qualified compatibility policy or roll forward.

CI's runtime-images job builds/tests API, web and admin through the existing
release bundle, then tests this exact Compose file using its API/web IDs.
`node scripts/local-compose-smoke.mjs --facts <web-facts.json>` runs the same
check locally. It owns a unique short prefix, ephemeral TLS port and separate
database volume; verifies HTTPS cookies, WSS, portal rendering, 47-at-this-source
migrations/idempotency and retained identity through down/up; then removes only
its disposable stack, volume and generated secrets. Raw evidence uses fresh
`artifacts/compose-smoke-*/` paths. No existing development data is reused.

Quality also runs on `codex/**` pushes; publishing remains disabled and limited
to independently authorized main candidates. Local pass does not prove a
hosted run or branch protection. Production, registry and public gates remain
separate. Existing legacy stack/test/admin profiles remain supported.
