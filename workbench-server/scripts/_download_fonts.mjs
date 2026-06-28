// 下载 Google Fonts 到 workbench/app/public/fonts，并生成自托管的 CSS
// 使用方法：node workbench-server/scripts/_download_fonts.mjs
//
// Nuxt 3 + srcDir='app/' 会把 publicDir 解析为 app/public/，
// 所以这里把字体放进 app/public/fonts/，dev 与 build 都能直接吐到 /fonts/。
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, '..', '..', 'workbench', 'app', 'public', 'fonts')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const CSS_URL = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Noto+Serif+SC:wght@400;500;600;700&display=swap'

if (!existsSync(FONTS_DIR)) mkdirSync(FONTS_DIR, { recursive: true })

console.log('Fetching Google Fonts CSS...')
const cssRes = await fetch(CSS_URL, {
  headers: {
    'User-Agent': UA,
    // Accept only text/css → Google returns woff2 (not woff/ttf)
    'Accept': 'text/css',
  },
})
if (!cssRes.ok) throw new Error(`CSS fetch failed: ${cssRes.status}`)
const remoteCss = await cssRes.text()
console.log(`Remote CSS length: ${remoteCss.length}, @font-face count: ${(remoteCss.match(/@font-face/g) || []).length}`)

// 提取所有 @font-face 块（注释可选）
const blockRe = /(?:(?:\/\*\s*([^*]+?)\s*\*\/)\s*)?@font-face\s*\{([\s\S]*?)\}/g
let m
const blocks = []
while ((m = blockRe.exec(remoteCss)) !== null) {
  blocks.push({ comment: m[1] || '', body: m[2] })
}
console.log(`Found ${blocks.length} @font-face blocks`)

// 为每个 block 下载 woff2
const localCss = []
let downloaded = 0
let totalBytes = 0
for (const b of blocks) {
  const urlMatch = b.body.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/)
  if (!urlMatch) continue
  const url = urlMatch[1]
  // 用 URL 的 hash 部分做文件名（Google 用的就是 hash）
  const filename = url.split('/').pop()
  const localPath = join(FONTS_DIR, filename)
  if (!existsSync(localPath)) {
    process.stdout.write(`  [${++downloaded}/${blocks.length}] ${filename}... `)
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) {
      console.log(`SKIP (${r.status})`)
      continue
    }
    const buf = Buffer.from(await r.arrayBuffer())
    writeFileSync(localPath, buf)
    totalBytes += buf.length
    console.log(`${(buf.length / 1024).toFixed(1)} KB`)
  } else {
    process.stdout.write(`  [skip cached] ${filename}\n`)
    totalBytes += readFileSync(localPath).length
  }
  // 替换 body 中的 URL 为本地路径
  const newBody = b.body.replace(/url\(https:\/\/fonts\.gstatic\.com[^)]+\.woff2\)/, `url(/fonts/${filename})`)
  localCss.push(`/* ${b.comment} */\n@font-face {${newBody}}`)
}

const finalCss = localCss.join('\n\n') + '\n'
const outCss = join(FONTS_DIR, 'fonts.css')
writeFileSync(outCss, finalCss, 'utf8')

console.log(`\nDone. ${blocks.length} @font-face blocks, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total.`)
console.log(`Local CSS: ${outCss}`)
