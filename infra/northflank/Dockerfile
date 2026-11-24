FROM node:26.9.0-bookworm-slim@sha256:582460f614631b59b824ac6020533b9bf339c7fdf3a6d7db31abb6b4065f0212 AS node-base

FROM node-base AS workspace
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.28.5
COPY . .
RUN pnpm install --frozen-lockfile

FROM workspace AS frontend-build
ENV AETHERIA_WEB_STANDALONE=1 AETHERIA_ADMIN_STANDALONE=1
RUN pnpm --filter '@aetheria/portal-web...' --filter '@aetheria/admin-web...' -r run build

FROM workspace AS api-build
RUN pnpm --filter '@aetheria/platform-api...' -r run build
RUN --network=none node scripts/package-api-runtime.mjs /runtime-api

FROM rust:1.99.1-bookworm@sha256:e6f2cff35d0f309acf8433b4f05878ed77092602c5065cc81801177da0bb3a9c AS rust-build
WORKDIR /app
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY apps/game-runtime/Cargo.toml apps/game-runtime/Cargo.toml
COPY apps/game-runtime/src apps/game-runtime/src
COPY crates crates
COPY proto/native proto/native
COPY config/aurora-blockout-collision.json config/aurora-blockout-collision.json
RUN cargo build --release --locked --package aetheria-game-runtime

FROM cloudflare/cloudflared@sha256:55c7e3e8d89d5e8d20b75a82f3602cbf98e06db406e73e282073cfdc5a9a3af6 AS tunnel

FROM node-base AS sandbox
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/corepack
COPY infra/northflank/start.mjs ./start.mjs
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER node
ENTRYPOINT ["node", "/app/start.mjs"]

FROM sandbox AS frontend
COPY --from=tunnel /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY --from=frontend-build --chown=node:node /app/apps/portal-web/.next/standalone/ /app/portal/
COPY --from=frontend-build --chown=node:node /app/apps/portal-web/.next/static/ /app/portal/apps/portal-web/.next/static/
COPY --from=frontend-build /app/apps/portal-web/public/ /app/portal/apps/portal-web/public/
COPY --from=frontend-build /app/apps/portal-web/start-runtime.mjs /app/portal/apps/portal-web/
COPY --from=frontend-build --chown=node:node /app/apps/admin-web/.next/standalone/ /app/admin/
COPY --from=frontend-build --chown=node:node /app/apps/admin-web/.next/static/ /app/admin/apps/admin-web/.next/static/
COPY --from=frontend-build /app/apps/admin-web/start-runtime.mjs /app/admin/apps/admin-web/
COPY --from=frontend-build /app/apps/admin-web/server/runtime-config.mjs /app/admin/apps/admin-web/server/
EXPOSE 3300/tcp 3400/tcp
CMD ["frontend"]

FROM sandbox AS backend
COPY --from=api-build /runtime-api/ /app/api/
COPY --from=rust-build /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/
COPY --from=rust-build /app/target/release/aetheria-game-runtime /usr/local/bin/aetheria-game-runtime
EXPOSE 4300/tcp 4400/tcp
CMD ["backend"]
