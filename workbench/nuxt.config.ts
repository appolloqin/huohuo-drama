function resolvePublicBasePath(raw?: string): string {
  const trimmed = raw?.trim()
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`
}

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
    server: {
      // 使用 127.0.0.1 避免 Node 将 localhost 解析为 ::1，而后端仅监听 IPv4 时出现 ECONNREFUSED
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:18555',
          changeOrigin: true,
          configure: (proxyInstance) => {
            proxyInstance.on('proxyRes', (proxyRes) => {
              const ct = String(proxyRes.headers['content-type'] || '')
              if (ct.includes('text/event-stream')) {
                proxyRes.headers['cache-control'] = 'no-cache, no-transform'
                proxyRes.headers['x-accel-buffering'] = 'no'
              }
            })
          },
        },
        '/static': { target: 'http://127.0.0.1:18555', changeOrigin: true },
      },
    },
  },
  compatibilityDate: '2026-05-15',
})
