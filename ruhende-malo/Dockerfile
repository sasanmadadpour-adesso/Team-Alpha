# syntax=docker/dockerfile:1.7
# Ruhend — MK7 Control Center (simulation). One container: CAP backend + built UI on port 4004.

# 1) backend dependencies (CAP, SQLite adapter, tsx to run the TypeScript sources)
FROM node:24-bookworm-slim AS deps
WORKDIR /build
COPY package.json package-lock.json ./
COPY app/package.json app/
RUN npm ci --workspaces=false

# 2) build the UI (React + Tailwind + shadcn/ui)
FROM node:24-bookworm-slim AS ui
WORKDIR /build
COPY package.json package-lock.json ./
COPY app/package.json app/
RUN npm ci --workspace app
COPY app ./app
RUN npm run build --workspace app

# 3) runtime
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4004 \
    DB_FILE=/data/db.sqlite \
    UI_DIR=/app/app/dist
WORKDIR /app
COPY --from=deps /build/node_modules ./node_modules
COPY package.json tsconfig.json server.ts ./
COPY db ./db
COPY srv ./srv
COPY scripts ./scripts
COPY data ./data
COPY --from=ui /build/app/dist ./app/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 4004
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4004)+'/api/v1/health()').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
