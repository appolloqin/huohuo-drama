function resolvePublicBasePath(raw?: string): string {
  const trimmed = raw?.trim()
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`
}

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const resolvedPublicBase = resolvePublicBasePath(process.env.NUXT_APP_BASE_URL)

export default defineNuxtConfig({
  srcDir: 'app/',
  ssr: false,
  devtools: { enabled: false },
  experimental: {
    appManifest: false,
    // Nuxt 3.20+/3.21 在 ssr:false 下修复 dev server entry 解析问题（issue #34957, #35033）
    viteEnvironmentApi: true,
  },
  runtimeConfig: {
    public: {
      /** 营销站根地址，用于 OG 图等绝对 URL */
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
      /** 控制台对外地址，如 https://example.com/console */
      consoleUrl: process.env.NUXT_PUBLIC_CONSOLE_URL || '',
    },
  },
  app: {
    /** Docker/nginx 下控制台挂在 /console/；本地不设 NUXT_APP_BASE_URL 即为 / */
    baseURL: resolvedPublicBase,
    head: {
      title: 'Huohuo Drama',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Huohuo Drama — AI platform for short drama and novel production: script, storyboard, image/video generation.',
        },
        { name: 'robots', content: 'noindex,nofollow' },
        { name: 'theme-color', content: '#1b2940' },
      ],
    },
  },
  vite: {
    resolve: {
      alias: {
        '@huohuo-shared': path.resolve(rootDir, '../workbench-server/src/common/novel'),
      },
    },
    server: {
      // 使用 127.0.0.1 避免 Node 将 localhost 解析为 ::1，而后端仅监听 IPv4 时出现 ECONNREFUSED
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:18555',
          changeOrigin: true,
          // 小说流式生成可能数分钟；0=不限时。ECONNRESET 多数是上游进程重启/崩溃，不是这里超时。
          timeout: 0,
          proxyTimeout: 0,
          configure: (proxyInstance) => {
            proxyInstance.on('proxyRes', (proxyRes, _req, res) => {
              const ct = String(proxyRes.headers['content-type'] || '')
              if (ct.includes('text/event-stream')) {
                proxyRes.headers['cache-control'] = 'no-cache, no-transform'
                proxyRes.headers['x-accel-buffering'] = 'no'
                // 上游（tsx watch 重启等）异常断开时，立刻结束浏览器侧挂起请求
                proxyRes.on('close', () => {
                  if ((proxyRes as any).errored && res && !res.writableEnded) {
                    try { res.destroy((proxyRes as any).errored) } catch { /* ignore */ }
                  }
                })
              }
            })
            proxyInstance.on('error', (err, _req, res) => {
              console.error('[vite-proxy /api]', err?.message || err)
              if (res && !res.headersSent && typeof (res as any).writeHead === 'function') {
                try {
                  ;(res as any).writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
                  ;(res as any).end('Bad gateway (upstream reset)')
                } catch { /* ignore */ }
              }
            })
          },
        },
        '/static': { target: 'http://127.0.0.1:18555', changeOrigin: true, timeout: 0, proxyTimeout: 0 },
      },
    },
  },
  compatibilityDate: '2026-05-15',
})
