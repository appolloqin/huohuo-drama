/**
 * 本地媒体文件存储 — 薄导出层
 */
import { defaultMediaStore } from './local-media-store.js'

export function downloadFile(url: string, subDir: string): Promise<string> {
  return defaultMediaStore.persistRemote(url, subDir)
}

export function saveUploadedFile(data: ArrayBuffer, subDir: string, originalName: string): Promise<string> {
  return defaultMediaStore.persistUpload(data, subDir, originalName)
}

export function saveBase64Image(base64Data: string, mimeType: string, subDir: string): Promise<string> {
  return defaultMediaStore.persistBase64Image(base64Data, mimeType, subDir)
}

export function getAbsolutePath(relativePath: string): string {
  return defaultMediaStore.resolveAbsolute(relativePath)
}

export function readImageAsDataUrl(relativePath: string): string {
  return defaultMediaStore.readAsDataUrl(relativePath)
}

export function readImageAsCompressedDataUrl(
  relativePath: string,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {},
): Promise<string> {
  return defaultMediaStore.readAsCompressedDataUrl(relativePath, options)
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}
