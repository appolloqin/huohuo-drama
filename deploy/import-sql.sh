#!/bin/sh
# 当 DB_DRIVER=mysql 且 MYSQL_IMPORT_SQL=true 时，将指定 SQL 文件导入 MySQL
# 幂等：若 sentinel 表已存在且行计数 > 0 则跳过，避免重复导入覆盖业务数据
# 环境变量：
#   MYSQL_IMPORT_SQL  - 是否导入（true/false，默认 false）
#   MYSQL_IMPORT_FILE - SQL 文件路径（默认 /app/workbench-data/huohuo_drama.sql）
#   MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
#   MYSQL_IMPORT_FORCE - 设为 true 强制重新导入（默认 false）

set -eu

IMPORT_SQL="${MYSQL_IMPORT_SQL:-false}"

if [ "$IMPORT_SQL" != "true" ]; then
  exit 0
fi

IMPORT_FILE="${MYSQL_IMPORT_FILE:-/app/workbench-data/huohuo_drama.sql}"
FORCE_IMPORT="${MYSQL_IMPORT_FORCE:-false}"

if [ ! -f "$IMPORT_FILE" ]; then
  echo "[import-sql] SQL file not found: $IMPORT_FILE, skipping"
  exit 0
fi

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_DATABASE="${MYSQL_DATABASE:-huohuo_drama}"

if [ -z "$MYSQL_PASSWORD" ]; then
  echo "[import-sql] MYSQL_PASSWORD is empty, skipping import" >&2
  exit 1
fi

MYSQL_CMD="mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE"

echo "[import-sql] Waiting for MySQL to be ready at ${MYSQL_HOST}:${MYSQL_PORT}..."
for i in $(seq 1 60); do
  if mysqladmin ping -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" --silent 2>/dev/null; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[import-sql] MySQL not reachable after 60s, aborting" >&2
    exit 1
  fi
  sleep 2
done

# 幂等检查：sentinel 表存在且非空则跳过
if [ "$FORCE_IMPORT" != "true" ]; then
  SENTINEL=$($MYSQL_CMD -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}' AND table_name='import_sentinel'" 2>/dev/null || echo "0")
  if [ "$SENTINEL" = "1" ]; then
    ROW_COUNT=$($MYSQL_CMD -N -e "SELECT COUNT(*) FROM import_sentinel" 2>/dev/null || echo "0")
    if [ "$ROW_COUNT" -gt 0 ]; then
      echo "[import-sql] Data already imported (sentinel table has ${ROW_COUNT} rows). Set MYSQL_IMPORT_FORCE=true to re-import."
      exit 0
    fi
  fi
fi

echo "[import-sql] Importing $IMPORT_FILE into ${MYSQL_DATABASE}..."
$MYSQL_CMD < "$IMPORT_FILE"

# 写入 sentinel 表标记导入完成
echo "[import-sql] Writing import sentinel..."
$MYSQL_CMD -e "CREATE TABLE IF NOT EXISTS import_sentinel (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, imported_at DATETIME DEFAULT CURRENT_TIMESTAMP, source_file VARCHAR(512))"
$MYSQL_CMD -e "INSERT INTO import_sentinel (source_file) VALUES ('${IMPORT_FILE}')"
echo "[import-sql] Import completed successfully"
