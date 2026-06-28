import { Hono } from 'hono'

const app = new Hono()

function siteOrigin(): string {
  const u = String(process.env.SITE_URL || process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return u
}

function consoleOrigin(): string {
  const site = siteOrigin()
  const raw = String(process.env.CONSOLE_URL || process.env.NUXT_PUBLIC_CONSOLE_URL || '').replace(/\/$/, '')
  if (raw) return raw
  return site ? `${site}/console` : ''
}

/** 根域 robots.txt（无 nginx 营销站时由后端兜底） */
app.get('/robots.txt', (c) => {
  const site = siteOrigin()
  const consoleBase = consoleOrigin()
  const lines = [
    'User-agent: *',
    'Allow: /',
    ...(consoleBase ? [`Allow: ${consoleBase}/login`, `Allow: ${consoleBase}/register`] : []),
    ...(consoleBase ? [`Disallow: ${consoleBase}/drama/`, `Disallow: ${consoleBase}/settings`] : []),
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    `Sitemap: ${site || ''}/sitemap.xml`,
  ]
  return c.text(lines.join('\n'), 200, { 'Content-Type': 'text/plain; charset=utf-8' })
})

/** 营销站 sitemap */
app.get('/sitemap.xml', (c) => {
  const site = siteOrigin() || 'http://localhost'
  const consoleBase = consoleOrigin()
  const today = new Date().toISOString().slice(0, 10)
  const urls = [
    { loc: `${site}/`, priority: '1.0', changefreq: 'weekly' },
    ...(consoleBase
      ? [
          { loc: `${consoleBase}/login`, priority: '0.5', changefreq: 'monthly' },
          { loc: `${consoleBase}/register`, priority: '0.4', changefreq: 'monthly' },
        ]
      : []),
  ]
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`
  return c.body(body, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
})

export default app
