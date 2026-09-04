FROM node:22-slim AS builder

WORKDIR /app

# corepack ships with Node 22 but was removed from the Node distribution in
# later majors, so `corepack enable` alone fails with exit 127 on those images.
# Installing it explicitly keeps this build working across Node versions while
# leaving `packageManager` in package.json as the single source of truth for
# which pnpm to use.
RUN npm install -g corepack@latest && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# hoisted linker gives a flat node_modules, so the tree survives the COPY into
# the runtime stage. pnpm's default symlinked layout does not travel cleanly.
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted

COPY tsconfig.json ./
COPY src ./src/

RUN pnpm exec prisma generate
RUN pnpm run build

# Drop the build-time dependencies before the tree is copied into the runtime
# stage. eslint, prettier, typescript, vitest and the Prisma CLI are all needed
# to produce dist/ and none of them are needed to run it.
#
# --ignore-scripts because the packages that survive have already been built;
# re-running their install scripts here only risks breaking what works.
RUN pnpm prune --prod --ignore-scripts


FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma        ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/lib/i18n ./src/lib/i18n

# pino writes to logs/ as well as stdout, and WORKDIR is owned by root. Without
# this the process cannot create the directory and dies on its first log line --
# found by running the image rather than by reading it.
RUN mkdir -p /app/logs && chown -R node:node /app/logs

# The node image ships an unprivileged `node` user. Running as root buys nothing
# here -- the process binds a high port and touches no privileged path -- and
# costs the usual container-escape surface.
USER node

CMD ["node", "dist/index.js"]
