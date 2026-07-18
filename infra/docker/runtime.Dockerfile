# syntax=docker/dockerfile:1.7

FROM node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854 AS web-build
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @forge/gateway build \
    && pnpm --filter @forge/gateway deploy --prod --legacy /out/gateway \
    && pnpm --filter @forge/studio build

FROM rust:1.96.0-slim-bookworm@sha256:4732ca96fd086cb9be682050c3f0176288eebaac2b80aa2bcefccfaf198e1950 AS validator-build
WORKDIR /src
COPY . .
RUN cargo build --locked --release -p forge-validate

FROM node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854 AS gateway
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="ForgedTTC gateway" \
      org.opencontainers.image.source="https://github.com/RNT56/TTC" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
ENV NODE_ENV=production \
    PORT=8080 \
    FORGE_CATALOG_DIR=/srv/forge/catalog \
    FORGE_VALIDATE_BIN=/srv/forge/bin/forge-validate
WORKDIR /srv/forge/gateway
RUN groupadd --gid 10001 forge && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin forge
COPY --from=web-build --chown=10001:10001 /out/gateway/ ./
COPY --from=web-build --chown=10001:10001 /src/scripts/db-migrate.mjs /src/scripts/postgres-migrations.mjs ./scripts/
COPY --from=web-build --chown=10001:10001 /src/infra/migrations/ ./infra/migrations/
COPY --from=web-build --chown=10001:10001 /src/catalog/ /srv/forge/catalog/
COPY --from=validator-build --chown=10001:10001 /src/target/release/forge-validate /srv/forge/bin/forge-validate
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]

FROM python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b AS workers
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="ForgedTTC workers" \
      org.opencontainers.image.source="https://github.com/RNT56/TTC" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FORGE_CATALOG_DIR=/srv/forge/catalog \
    FORGE_SCHEMA=/srv/forge/schema/forge-modelspec.schema.json \
    FORGE_VALIDATE_BIN=/srv/forge/bin/forge-validate
WORKDIR /srv/forge/workers
RUN groupadd --gid 10002 forge && useradd --uid 10002 --gid 10002 --no-create-home --shell /usr/sbin/nologin forge
COPY --chown=10002:10002 workers/ ./
RUN python -m pip install --no-cache-dir '.[queue]'
COPY --chown=10002:10002 schema/forge-modelspec.schema.json /srv/forge/schema/forge-modelspec.schema.json
COPY --chown=10002:10002 catalog/ /srv/forge/catalog/
COPY --from=validator-build --chown=10002:10002 /src/target/release/forge-validate /srv/forge/bin/forge-validate
USER 10002:10002
HEALTHCHECK --interval=10s --timeout=4s --start-period=10s --retries=6 \
  CMD ["python", "-m", "forge_workers.health", "live"]
CMD ["python", "-m", "forge_workers.runner"]

FROM nginxinc/nginx-unprivileged:1.29.5-alpine@sha256:42a7d7f2ee23e9f5a1dcdf3647ba5c585bbd18f79e79cd817e70e8cd61c55779 AS studio
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="ForgedTTC Studio" \
      org.opencontainers.image.source="https://github.com/RNT56/TTC" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
COPY --from=web-build --chown=101:101 /src/packages/studio/dist/ /usr/share/nginx/html/
COPY --chown=101:101 infra/docker/studio.nginx.conf /etc/nginx/conf.d/default.conf
USER 101:101
EXPOSE 8443
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD ["wget", "--quiet", "--no-check-certificate", "--spider", "https://127.0.0.1:8443/healthz"]
