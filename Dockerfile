# syntax=docker/dockerfile:1
# 默认：workbench + workbench-server（无营销站 site）
# 全栈见 Dockerfile.full

FROM node:22-slim AS workbench-build

WORKDIR /app/workbench
COPY workbench/package.json ./
COPY workbench/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY workbench/ ./
ENV NUXT_APP_BASE_URL=/console/
RUN npm run generate

FROM node:22-slim AS workbench-server-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/workbench-server
COPY workbench-server/package.json ./
COPY workbench-server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg nginx default-mysql-client \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default \
    && npm i -g tsx

WORKDIR /app

COPY --from=workbench-server-build /app/workbench-server/node_modules ./workbench-server/node_modules
COPY workbench-server/package.json ./workbench-server/
COPY workbench-server/src ./workbench-server/src
COPY workbench-server/tsconfig.json ./workbench-server/
COPY agent-skills/ ./agent-skills/

COPY --from=workbench-build /app/workbench/.output/public ./workbench/dist

COPY deploy/config.sqlite.yaml deploy/config.mysql.yaml ./deploy/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/start.sh /app/start.sh
COPY deploy/import-sql.sh /app/import-sql.sh
RUN sed -i 's/\r$//' /app/start.sh \
    && sed -i 's/\r$//' /app/import-sql.sh \
    && chmod +x /app/start.sh /app/import-sql.sh \
    && mkdir -p /app/workbench-data/static

ENV NODE_ENV=production
ENV PORT=18555

EXPOSE 80
VOLUME ["/app/workbench-data"]

CMD ["/app/start.sh"]
