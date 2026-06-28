/**
 * 火火工坊 — MiniMax 音色目录种子脚本
 *
 * 用法：cd workbench-server && npm run seed:voices
 * 音色清单见 scripts/data/minimax-voice-catalog.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import '../src/load-env.js'
import '../src/db/bootstrap.js'
import * as aiVoicesRepo from '../src/db/repos/ai-voices/index.js'

type MinimaxVoiceSeedEntry = {
  voice_id: string
  voice_name: string
  language: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const catalogPath = path.join(__dirname, 'data/minimax-voice-catalog.json')

function loadMinimaxVoiceCatalog(): MinimaxVoiceSeedEntry[] {
  const raw = fs.readFileSync(catalogPath, 'utf8')
  return JSON.parse(raw) as MinimaxVoiceSeedEntry[]
}

function mapCatalogToDbRows(catalog: MinimaxVoiceSeedEntry[], seededAt: string) {
  return catalog.map((row) => ({
    voiceId: row.voice_id,
    voiceName: row.voice_name,
    description: '[]',
    language: row.language,
    provider: 'minimax',
    createdAt: seededAt,
  }))
}

const seededAt = new Date().toISOString()
const minimaxVoiceCatalog = loadMinimaxVoiceCatalog()
await aiVoicesRepo.deleteAiVoicesByProvider('minimax')
const rowsToInsert = mapCatalogToDbRows(minimaxVoiceCatalog, seededAt)
await aiVoicesRepo.insertAiVoices(rowsToInsert)

console.log(`[huohuo] seeded ${rowsToInsert.length} minimax voices (${process.env.DB_DRIVER || 'sqlite'}) at ${seededAt}`)
