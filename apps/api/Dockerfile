# syntax=docker/dockerfile:1

FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

FROM base AS prune
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @omni/api --docker

FROM base AS build
WORKDIR /app
COPY --from=prune /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /app/out/full/ .
RUN pnpm --filter @omni/api build \
  && pnpm --filter @omni/api --prod deploy --legacy /out/api

FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out/api /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "--input-type=module", "-e", "const port=process.env.PORT??'3000';const res=await fetch('http://127.0.0.1:'+port+'/health');if(!res.ok)process.exit(1)"]
CMD ["node", "dist/index.js"]
