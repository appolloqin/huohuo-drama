/**
 * Build shared tab / PWA icons from app logo.
 * Run: node scripts/update-favicons.mjs (from workbench-server/)
 * Output: workbench/public + site/public (single source of truth)
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..')
const src = path.join(root, 'workbench/app/assets/huohuo-logo.png')
const outputs = [
  path.join(root, 'workbench/public'),
  path.join(root, 'site/public'),
]

if (!fs.existsSync(src)) {
  console.error('Missing', src)
  process.exit(1)
}

const bg = { r: 248, g: 251, b: 255, alpha: 1 }

async function out(targetDir, name, size) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: bg, position: 'centre' })
    .png()
    .toFile(path.join(targetDir, name))
  console.log(`${path.basename(targetDir)}: ${name} ${size}`)
}

for (const dir of outputs) {
  await fs.promises.mkdir(dir, { recursive: true })
  await out(dir, 'favicon.png', 32)
  await out(dir, 'favicon-16x16.png', 16)
  await out(dir, 'apple-touch-icon.png', 180)
}

console.log('Done →', outputs.join(' , '))
