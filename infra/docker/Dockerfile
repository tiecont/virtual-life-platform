FROM node:26.9.0-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN npm install --global pnpm@11.28.5
COPY . .
RUN pnpm install --frozen-lockfile
# Next rewrites are built for the private Compose API service. The edge routes
# browser API/socket requests directly;server fetches use the same internal URL.
ENV API_INTERNAL_URL=http://api:4300
RUN pnpm build

FROM build AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4300
USER node
CMD ["node", "apps/platform-api/dist/main.js"]
