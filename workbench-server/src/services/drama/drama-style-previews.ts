import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { resolveStaticRoot } from '../../common/media/data-root.js'
import { DRAMA_STYLE_CATALOG, dramaStylePreviewSlug } from '../../common/drama/drama-style.js'

function stylePreviewDir(): string {
  return path.join(resolveStaticRoot(), 'style-previews')
}

function hashHue(slug: string): number {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

function buildPreviewSvg(slug: string, label: string): string {
  const hue = hashHue(slug)
  const hue2 = (hue + 48) % 360
  const hue3 = (hue + 120) % 360
  const safeLabel = label.replace(/[<>&'"]/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue}, 62%, 42%)"/>
      <stop offset="100%" stop-color="hsl(${hue2}, 58%, 28%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="30%" r="55%">
      <stop offset="0%" stop-color="hsl(${hue3}, 70%, 72%)" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="hsl(${hue3}, 70%, 72%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg)"/>
  <rect width="320" height="180" fill="url(#glow)"/>
  <circle cx="72" cy="118" r="38" fill="hsl(${hue2}, 55%, 58%)" opacity="0.35"/>
  <circle cx="248" cy="52" r="28" fill="hsl(${hue3}, 62%, 68%)" opacity="0.42"/>
  <rect x="18" y="18" width="88" height="6" rx="3" fill="white" opacity="0.22"/>
  <rect x="18" y="32" width="56" height="4" rx="2" fill="white" opacity="0.16"/>
  <text x="18" y="162" fill="white" font-size="13" font-family="Arial, sans-serif" opacity="0.88">${safeLabel}</text>
</svg>`
}

async function writePreviewIfMissing(outPath: string, slug: string, label: string): Promise<void> {
  try {
    await fs.access(outPath)
    return
  } catch {
    /* generate below */
  }
  const svg = buildPreviewSvg(slug, label)
  await sharp(Buffer.from(svg)).png().toFile(outPath)
}

let ensurePromise: Promise<void> | null = null

/** 为风格目录生成抽象预览图（缺失时写入 workbench-data/static/style-previews/） */
export async function ensureDramaStylePreviews(): Promise<void> {
  if (ensurePromise) return ensurePromise
  ensurePromise = (async () => {
    const dir = stylePreviewDir()
    await fs.mkdir(dir, { recursive: true })
    await Promise.all(DRAMA_STYLE_CATALOG.map(async (item) => {
      const slug = dramaStylePreviewSlug(item.value)
      const outPath = path.join(dir, `${slug}.png`)
      await writePreviewIfMissing(outPath, slug, item.cn)
    }))
  })().finally(() => {
    ensurePromise = null
  })
  return ensurePromise
}
