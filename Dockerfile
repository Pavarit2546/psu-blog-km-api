# syntax=docker/dockerfile:1
# PSU Knowledge Platform — multi-stage build (Next.js standalone output).
# Node 24.22.3 satisfies Payload 3.94.0 engines (^22.23.5 || ^24.22.3 || >=26.13.1).

FROM node:24.22.3-alpine AS base
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------- dependencies (exact lockfile) ----------
FROM base AS deps
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3100
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
# Build never connects to the database (all pages are dynamic); a throwaway secret is enough.
RUN PAYLOAD_SECRET=build-time-placeholder-not-used-at-runtime DATABASE_URL=postgres://build:build@localhost:5432/build \
    pnpm run build

# ---------- runtime (no build tools, non-root) ----------
FROM node:24.22.3-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Local-storage fallback directory (only used when MinIO is disabled) — mount a volume here.
RUN mkdir -p /app/media && chown nextjs:nodejs /app/media
USER nextjs
EXPOSE 3000
# Pending migrations run automatically on boot (postgresAdapter prodMigrations).
CMD ["node", "server.js"]
