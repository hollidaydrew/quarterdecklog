# --- Stage 1: build the React frontend ---
FROM node:20-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build
# vite.config.js outputs to ../server/public relative to /app/web, i.e. /app/server/public

# --- Stage 2: install backend dependencies (better-sqlite3 needs a native build) ---
FROM node:20-bookworm-slim AS server-build
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm install --omit=dev

# --- Stage 3: runtime image ---
FROM node:20-bookworm-slim
WORKDIR /app/server
ENV NODE_ENV=production

RUN groupadd -r quarterdeck && useradd -r -g quarterdeck quarterdeck \
    && mkdir -p /data && chown -R quarterdeck:quarterdeck /data

COPY --from=server-build /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=web-build /app/server/public ./public

USER quarterdeck
EXPOSE 7272
VOLUME ["/data"]

CMD ["node", "src/index.js"]
