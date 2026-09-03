FROM node:22-slim AS builder

WORKDIR /app

RUN corepack enable

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

CMD ["node", "dist/index.js"]
