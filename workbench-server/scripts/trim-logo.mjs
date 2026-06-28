/**
 * Trim near-white margins from logo PNG → workbench assets.
 * Run from workbench-server/: node scripts/trim-logo.mjs <input.png>
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..')

const input = process.argv[2]
if (!input || !fs.existsSync(input)) {
  console.error('Usage: node scripts/trim-logo.mjs <input.png>')
  process.exit(1)
}

const outMain = path.join(root, 'workbench/app/assets/huohuo-logo.png')
const outFavicon = path.join(root, 'workbench/public/favicon.png')

const trimmed = await sharp(input)
  .trim({ threshold: 18 })
  .png()
  .toBuffer()

const meta = await sharp(trimmed).metadata()
const maxEdge = 512
let pipeline = sharp(trimmed)
if (meta.width > maxEdge || meta.height > maxEdge) {
  pipeline = pipeline.resize({
    width: meta.width >= meta.height ? maxEdge : undefined,
    height: meta.height > meta.width ? maxEdge : undefined,
    fit: 'inside',
    withoutEnlargement: true,
  })
}

await pipeline.png().toFile(outMain + '.tmp')
fs.renameSync(outMain + '.tmp', outMain)
await sharp(outMain)
  .resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(outFavicon + '.tmp')
fs.renameSync(outFavicon + '.tmp', outFavicon)

console.log('Wrote', outMain, 'and', outFavicon)
