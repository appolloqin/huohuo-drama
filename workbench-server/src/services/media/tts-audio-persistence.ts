import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'node:crypto'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export const TTS_AUDIO_DIR = process.env.STORAGE_PATH
  ? path.join(process.env.STORAGE_PATH, 'audio')
  : path.resolve(moduleDir, '../../../workbench-data/static/audio')

export interface TtsAudioBlob {
  audioHex: string
  format?: string
  audioLength?: number
}

export function storeTtsHexAudio(parsed: TtsAudioBlob): string {
  const buffer = Buffer.from(parsed.audioHex, 'hex')
  fs.mkdirSync(TTS_AUDIO_DIR, { recursive: true })

  const filename = `${randomUUID()}.${parsed.format || 'mp3'}`
  fs.writeFileSync(path.join(TTS_AUDIO_DIR, filename), buffer)
  return `static/audio/${filename}`
}

export function byteLengthFromHex(hex: string): number {
  return Buffer.from(hex, 'hex').length
}
