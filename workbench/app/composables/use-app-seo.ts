/** 控制台 SEO：公开页可索引，工作台 noindex */
export function useAppSeo() {
  const route = useRoute()
  const config = useRuntimeConfig()
  const { messages: tm, lang } = useI18n()

  const publicPaths = new Set(['/login', '/register'])
  const isPublic = computed(() => publicPaths.has(route.path))

  const pageKey = computed(() => {
    if (route.path === '/login') return 'login'
    if (route.path === '/register') return 'register'
    if (route.path === '/') return 'home'
    return 'workspace'
  })

  const seo = computed(() => {
    const pack = tm.value.seo as Record<string, string>
    const key = pageKey.value
    return {
      title: pack[`title${cap(key)}`] || pack.title || 'Huohuo Drama',
      description: pack[`description${cap(key)}`] || pack.description || '',
      keywords: pack[`keywords${cap(key)}`] || pack.keywords || '',
    }
  })

  const origin = computed(() => {
    const fromEnv = String(config.public.consoleUrl || '').replace(/\/$/, '')
    if (fromEnv) return fromEnv
    if (import.meta.client) return window.location.origin
    return ''
  })

  const canonical = computed(() => {
    const base = origin.value
    if (!base) return ''
    const path = route.path === '/' ? '/' : route.path
    return `${base}${path}`
  })

  const ogImage = computed(() => {
    const img = String((tm.value.seo as Record<string, string>).ogImage || '/og-cover.svg')
    if (img.startsWith('http')) return img
    const site = String(config.public.siteUrl || origin.value).replace(/\/$/, '')
    return site ? `${site}${img.startsWith('/') ? img : `/${img}`}` : img
  })

  watch(
    [seo, isPublic, canonical, ogImage, lang],
    () => {
      const robots = isPublic.value ? 'index,follow,max-image-preview:large' : 'noindex,nofollow,noarchive'
      useHead({
        htmlAttrs: { lang: lang.value },
        title: seo.value.title,
        meta: [
          { name: 'description', content: seo.value.description },
          { name: 'keywords', content: seo.value.keywords },
          { name: 'robots', content: robots },
          { name: 'googlebot', content: robots },
          { property: 'og:type', content: 'website' },
          { property: 'og:site_name', content: tm.value.brand?.name || 'Huohuo Drama' },
          { property: 'og:title', content: seo.value.title },
          { property: 'og:description', content: seo.value.description },
          { property: 'og:image', content: ogImage.value },
          ...(canonical.value ? [{ property: 'og:url', content: canonical.value }] : []),
          { name: 'twitter:card', content: 'summary_large_image' },
          { name: 'twitter:title', content: seo.value.title },
          { name: 'twitter:description', content: seo.value.description },
          { name: 'twitter:image', content: ogImage.value },
        ],
        link: canonical.value ? [{ rel: 'canonical', href: canonical.value }] : [],
      })
    },
    { immediate: true },
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
