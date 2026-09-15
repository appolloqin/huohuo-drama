import fs from 'fs'
import path from 'path'
import { DEFAULT_BUILTIN_BGM_ID, ensureBuiltinBgmFile } from './builtin-bgm-catalog.js'

/** Resolve BGM loop for frame slideshow (env override or default builtin preset). */
export function ensureFrameSlideshowBgmLoop(staticRoot: string): string {
  const envPath = process.env.FRAME_SLIDESHOW_BGM_PATH?.trim()
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath)
  return ensureBuiltinBgmFile(staticRoot, DEFAULT_BUILTIN_BGM_ID)
}

export function readFrameSlideshowBgmVolume(): number {
  const raw = process.env.FRAME_SLIDESHOW_BGM_VOLUME?.trim()
  if (!raw) return 0.32
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.32
  return Math.min(parsed, 1)
}
