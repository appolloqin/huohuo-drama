/**
 * Copy PNG favicons into workbench/app/assets + build favicon.ico for Vite-bundled URLs.
 * Run from workbench-server/: node scripts/build-app-icons.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..')
const pub = path.join(root, 'workbench/public')
const assets = path.join(root, 'workbench/app/assets')

const f16 = path.join(pub, 'favicon-16x16.png')
const f32 = path.join(pub, 'favicon.png')
const apple = path.join(pub, 'apple-touch-icon.png')

for (const p of [f16, f32]) {
  if (!fs.existsSync(p)) {
    console.error('Missing', p, '— run node scripts/update-favicons.mjs first')
    process.exit(1)
  }
}

await fs.promises.mkdir(assets, { recursive: true })
await fs.promises.copyFile(f16, path.join(assets, 'favicon-16x16.png'))
await fs.promises.copyFile(f32, path.join(assets, 'favicon-32x32.png'))
if (fs.existsSync(apple)) {
  await fs.promises.copyFile(apple, path.join(assets, 'apple-touch-icon.png'))
}

const icoBuf = await pngToIco([fs.readFileSync(f16), fs.readFileSync(f32)])
await fs.promises.writeFile(path.join(assets, 'favicon.ico'), icoBuf)

console.log('Wrote app/assets: favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png')
