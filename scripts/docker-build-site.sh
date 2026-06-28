#!/bin/sh
# Docker site-build 阶段：构建 Nuxt SSR 应用
# SSR 模式下不预渲染页面，详情页由 Nuxt server 在运行时实时渲染
set -eu

echo "[docker-build-site] building Nuxt SSR application..."
npm run build
echo "[docker-build-site] build complete, .output/server/index.mjs ready"
