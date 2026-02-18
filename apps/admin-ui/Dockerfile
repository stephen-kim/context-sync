FROM node:20-bookworm-slim

WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/admin-ui/package.json apps/admin-ui/package.json

RUN pnpm --filter @claustrum/admin-ui install --no-frozen-lockfile --ignore-scripts --prod=false

COPY apps/admin-ui apps/admin-ui

RUN pnpm --filter @claustrum/admin-ui build

WORKDIR /workspace/apps/admin-ui
CMD ["pnpm", "start"]
