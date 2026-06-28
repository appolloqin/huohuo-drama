import fs from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from '../media/local-media-store.js'

/** Inline DB text longer than this is written to workbench-data/storage/text/… */
export const TEXT_BLOB_THRESHOLD = 16384

export function textBlobRelativePath(table: string, id: number, field: string): string {
  return `storage/text/${table}/${id}/${field}.txt`
}

export function readTextBlob(relativePath: string): string | null {
  try {
    const abs = path.join(DATA_ROOT, relativePath)
    if (!fs.existsSync(abs)) return null
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

export function writeTextBlob(relativePath: string, content: string): void {
  const abs = path.join(DATA_ROOT, relativePath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
}

export function resolveInlineOrBlob(
  inline: string | null | undefined,
  blobPath: string | null | undefined,
): string | null {
  if (blobPath) {
    const fromBlob = readTextBlob(blobPath)
    if (fromBlob != null) return fromBlob
  }
  return inline ?? null
}

export function persistInlineOrBlob(
  table: string,
  id: number,
  field: string,
  value: string | null | undefined,
): { inline: string | null; blobPath: string | null } {
  if (value == null || value === '') {
    return { inline: null, blobPath: null }
  }
  if (value.length <= TEXT_BLOB_THRESHOLD) {
    return { inline: value, blobPath: null }
  }
  const blobPath = textBlobRelativePath(table, id, field)
  writeTextBlob(blobPath, value)
  return { inline: null, blobPath }
}
