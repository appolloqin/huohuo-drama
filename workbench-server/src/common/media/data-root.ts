import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(moduleDir, '../../..')

/** 仓库根目录下的 workbench-data（与 deploy / README 一致） */
export function resolveDataRoot(): string {
  if (process.env.DATA_PATH?.trim()) return path.resolve(process.env.DATA_PATH.trim())
  return path.resolve(serverRoot, '../workbench-data')
}

/** 旧版错误落盘位置：workbench-server/workbench-data（少退一级导致） */
export function resolveLegacyDataRoot(): string {
  return path.join(serverRoot, 'workbench-data')
}

export function resolveStaticRoot(): string {
  if (process.env.STORAGE_PATH?.trim()) return path.resolve(process.env.STORAGE_PATH.trim())
  return path.join(resolveDataRoot(), 'static')
}

/** 将旧版 workbench-server/workbench-data/storage 合并到 canonical DATA_ROOT/storage */
export function migrateLegacyWorkbenchDataStorage(): void {
  const canonical = resolveDataRoot()
  const legacy = resolveLegacyDataRoot()
  if (legacy === canonical) return

  const legacyStorage = path.join(legacy, 'storage')
  if (!fs.existsSync(legacyStorage)) return

  const targetStorage = path.join(canonical, 'storage')
  fs.mkdirSync(targetStorage, { recursive: true })

  const copyRecursive = (src: string, dest: string) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true })
        copyRecursive(srcPath, destPath)
        continue
      }
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  copyRecursive(legacyStorage, targetStorage)
}
