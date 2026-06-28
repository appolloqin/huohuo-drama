#!/bin/sh
# Wrapper: load deploy/.env then run reencrypt-api-keys.mjs
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="${ENCRYPT_ENV_FILE:-$SCRIPT_DIR/.env}"
exec node "$SCRIPT_DIR/reencrypt-api-keys.mjs" --env "$ENV_FILE" "$@"
