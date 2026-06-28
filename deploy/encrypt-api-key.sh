#!/bin/sh
# Wrapper: load deploy/.env then run encrypt-api-key.mjs
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="${ENCRYPT_ENV_FILE:-$SCRIPT_DIR/.env}"
exec node "$SCRIPT_DIR/encrypt-api-key.mjs" --env "$ENV_FILE" "$@"
