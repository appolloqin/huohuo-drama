#!/bin/sh
# 默认镜像：workbench + workbench-server
set -eu

# 根据 DB_DRIVER 自动选择配置模板
DB_DRIVER="${DB_DRIVER:-sqlite}"
if [ "$DB_DRIVER" = "mysql" ]; then
  CONFIG_SRC="/app/deploy/config.mysql.yaml"
else
  CONFIG_SRC="/app/deploy/config.sqlite.yaml"
fi

# 如果用户未挂载自定义 config.yaml，则使用模板生成
if [ ! -f /app/deploy/config.yaml ] || [ -d /app/deploy/config.yaml ]; then
  cp "$CONFIG_SRC" /app/deploy/config.yaml 2>/dev/null || true
fi

/app/import-sql.sh

tsx /app/workbench-server/src/index.ts &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" >/dev/null 2>&1 || true
  nginx -s quit >/dev/null 2>&1 || true
}

trap cleanup INT TERM EXIT

nginx -g 'daemon off;' &
NGINX_PID=$!

wait "$BACKEND_PID" "$NGINX_PID"
