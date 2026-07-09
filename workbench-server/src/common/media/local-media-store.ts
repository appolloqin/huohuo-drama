import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { resolveDataRoot, resolveStaticRoot } from './data-root.js'

export const DATA_ROOT = resolveDataRoot()
export const STATIC_ROOT = resolveStaticRoot()

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export class LocalMediaStore {
  private ensureDir(subDir: string): string {
    const dir = path.join(STATIC_ROOT, subDir)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  private buildFilename(extension: string): string {
    return `${randomUUID()}${extension}`
  }

  private toPublicPath(subDir: string, filename: string): string {
    return `static/${subDir}/${filename}`
  }

  private guessExtensionFromUrl(url: string): string {
    try {
      const ext = path.extname(new URL(url).pathname)
      if (ext && ext.length <= 5) return ext
    } catch {}
    return '.bin'
  }

  async persistRemote(url: string, subDir: string): Promise<string> {
    const dir = this.ensureDir(subDir)
    const filename = this.buildFilename(this.guessExtensionFromUrl(url))
    const target = path.join(dir, filename)

    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)

    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()))
    return this.toPublicPath(subDir, filename)
  }

  async persistUpload(data: ArrayBuffer, subDir: string, originalName: string): Promise<string> {
    const dir = this.ensureDir(subDir)
    const extension = path.extname(originalName) || '.bin'
    const filename = this.buildFilename(extension)
    const target = path.join(dir, filename)

    fs.writeFileSync(target, Buffer.from(data))
    return this.toPublicPath(subDir, filename)
  }

  async persistBase64Image(base64Data: string, mimeType: string, subDir: string): Promise<string> {
    const dir = this.ensureDir(subDir)
    const extension = MIME_TO_EXT[mimeType] || '.png'
    const filename = this.buildFilename(extension)
    const target = path.join(dir, filename)

    fs.writeFileSync(target, Buffer.from(base64Data, 'base64'))
    return this.toPublicPath(subDir, filename)
  }

  resolveAbsolute(relativePath: string): string {
    if (relativePath.startsWith('static/')) {
      return path.join(DATA_ROOT, relativePath)
    }
    return path.join(STATIC_ROOT, relativePath)
  }

  readAsDataUrl(relativePath: string): string {
    const filePath = this.resolveAbsolute(relativePath)
    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = EXT_TO_MIME[ext] || 'image/png'
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  }

  async readAsCompressedDataUrl(
    relativePath: string,
    options: { maxWidth?: number; maxHeight?: number; quality?: number } = {},
  ): Promise<string> {
    const filePath = this.resolveAbsolute(relativePath)
    const maxWidth = options.maxWidth ?? 768
    const maxHeight = options.maxHeight ?? 768
    const quality = options.quality ?? 68

    const pipeline = sharp(filePath).rotate().resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    const metadata = await pipeline.metadata()
    const output = metadata.hasAlpha
      ? await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer()
      : await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()

    return `data:image/jpeg;base64,${output.toString('base64')}`
  }
}

export const defaultMediaStore = new LocalMediaStore()
