FROM node:20-alpine AS base
RUN npm install -g pnpm@11
WORKDIR /app

# ─── Development ─────────────────────────────────────────────────────────────
FROM base AS development
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/whatsapp/package.json ./packages/whatsapp/
RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages ./packages

WORKDIR /app/apps/api
RUN pnpm prisma generate

EXPOSE 3001
CMD ["pnpm", "dev"]

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/whatsapp/package.json ./packages/whatsapp/
RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages ./packages

RUN pnpm --filter @safi/api build

# ─── Production ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS production
RUN npm install -g pnpm@11
WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

RUN pnpm prisma generate

EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/main"]
