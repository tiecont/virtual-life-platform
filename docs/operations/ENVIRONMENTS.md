# Environments and local TLS stack

M21-01 adds an environment matrix,application image and local Compose/Caddy staging equivalent. See [ADR0071](../adr/0071-local-staging-tls-and-one-explicit-edge-proxy.md),[matrix](../../infra/environments/matrix.json) and [actual evidence](../agent/evidence/m21-env-checks.json). [Private telemetry](OBSERVABILITY.md) and [bounded readiness/deployment recovery](DEPLOYMENT-RECOVERY.md) extend this local stack;their ledgers distinguish later image hashes and exact observed scope. No external staging,public deployment,domain or public CA is configured. All real world flags/restricted approvals remain OFF.

| Environment | Runtime and data | Entry / transport |
|---|---|---|
| dev | Existing development mode,retained local city DB,generated ignored `.env` | `pnpm dev`,loopback HTTP,`city_session` |
| test | Test mode,disposable loopback PostgreSQL,synthetic fixtures | `scripts/with-test-db.mjs`,isolated per run/device |
| staging | Production mode,independent credentials/volume,one explicit private edge | `infra/compose/stack.yml`,HTTPS,`__Host-city_session`;local equivalent tested |
| prod | Production mode,independent reviewed credentials/volume/certificates | Template only;owner approval and separate ingress/release work required |

Compose publishes only its TLS edge on127.0.0.1. API/web/database have no host ports. Choose a nonconflicting private /24;the upper /25 supplies dynamic services and the edge uses an explicit lower-half IP. The smoke caught a collision when Docker dynamically took the edge IP;the split range fixes that startup race. This is one instance,not a distributed room ownership design.

`TRUSTED_PROXY_IP` accepts one explicit optional IPv4 peer. Neither HTTP nor Socket.IO trusts forwarding by default. Fastify trusts only that peer;Socket.IO accepts exactly one valid forwarded IP only from it,otherwise counting the TCP peer. Caddy overwrites forwarded IP/protocol/host and strips `Forwarded`. Never expose API directly or enable blanket trust. World/adult checks,Origin,CSRF and sessions remain application authority. Cookie security derives from production mode,not client protocol claims.

Build and test locally:

```sh
docker build -f infra/docker/Dockerfile -t virtual-life-platform:m21-local .
pnpm infra:check
pnpm infra:smoke
```

The image builds Node26.9.0/pnpm11.28.5/workspace/lockfile and runs API/web as nonroot with read-only root filesystems and temporary writable caches. Env/registry credentials,TLS keys,artifacts and legacy references are excluded from context. This initial image retains build/development dependencies;minimization,vulnerability review,signing and public registry distribution remain before release. Evidence records the actual image ID and matching316runtime source hashes;the local tag alone is not immutable artifact provenance.

The smoke creates a unique disposable stack and one-day local certificate/key. It validates and boots PostgreSQL→additive migrator→healthy API/web→Caddy,then tests real TLS/Chromium cookies,identity reload,rotation rejecting the old cookie,Origin denial and authenticated TLS WebSocket.31connections with forged forwarded IPs recorded29accepted/2transport denials after an earlier valid connection;that is a rate invariant,not load evidence. Stopping API deliberately returns502;Caddy error output must omit a private path/cookie marker. No Caddy access log is enabled;runtime error filters remove URI/headers/IP fields. Broader telemetry belongs to M21-03.

Node explicitly trusts the generated certificate and Chromium trusts only its exact SPKI;the smoke installs no system CA. Generated env/key/certificate files are removed and only the newly generated test project's containers/network/volumes are cleaned. Retained city dev DB is untouched. Raw diagnostics remain in ignored artifacts;retained evidence contains no credentials.

For an owner-reviewed persistent local staging instance,copy `infra/environments/staging.env.example` to ignored `.env.staging`,choose an independent stack/image/subnet,generate an independent URL-safe database password/session secret,and supply certificate/key files outside context. Production has a separate template. Never reuse dev/test signing/encryption keys,passwords,volumes or certificates. The stack supplies no reporting key,staff grant,world flag or adult provider;real social/restricted operation stays closed.

```sh
node scripts/verify-infra.mjs .env.staging
docker compose --env-file .env.staging -f infra/compose/stack.yml config --quiet
docker compose --env-file .env.staging -f infra/compose/stack.yml up -d --wait
docker compose --env-file .env.staging -f infra/compose/stack.yml stop
```

Never paste expanded Compose config/container environments:they contain secrets. `stop` retains data. The smoke's volume removal is only for its own generated test stack,not a persistent staging/production reset. No destructive down migration exists. Actual external DNS/ingress,public certificate issuance/renewal,backup/restore,rollback,monitoring and operator coverage remain release gates.

Preparation failures remain explicit:the first checksum comparison used SHA256 against a SHA512 manifest,then was corrected/verified. Official Caddy2.11.8 binary existed while its Docker tag did not. Actual Compose uses available `caddy:2.11.7-alpine`;failed tag/IP-collision runs are retained. See ledger for final root/source-stability outcomes;configuration files alone do not establish completion.
