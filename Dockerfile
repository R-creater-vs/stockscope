# StockScope — production image.
# Multi-stage: install deps, build the standalone server, then a slim runtime.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Persist the SQLite DB and VAPID keys on a mounted volume.
ENV STOCKSCOPE_DB_PATH=/data/stockscope.db
ENV STOCKSCOPE_VAPID_PATH=/data/vapid.json

# Next.js standalone output bundles only what the server needs.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN mkdir -p /data
VOLUME /data
EXPOSE 3000

CMD ["node", "server.js"]
