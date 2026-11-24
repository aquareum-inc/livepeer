# The app image: user app, operator console, API and MCP in one Next.js server.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json release.config.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN MOCK_ONLY=1 pnpm --filter @livepeer/web build
# The migration runner as one file, so the image needs none of the build's node_modules to run it.
RUN pnpm --filter @livepeer/db bundle

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=app:app packages/config/presets ./presets
COPY --from=build --chown=app:app /app/packages/db/dist/migrate.cjs ./migrate.cjs
COPY --chown=app:app packages/db/migrations ./migrations
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
