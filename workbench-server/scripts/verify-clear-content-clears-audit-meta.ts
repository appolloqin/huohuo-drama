/**
 * 清空正文须同时清变更记录与一致性 21 维等 metadata
 * Run: npx tsx scripts/verify-clear-content-clears-audit-meta.ts
 */
import {
  contentDerivedMetadataClearPatch,
  mergeEpisodeMetadata,
} from '../src/common/drama/episode-meta.js'
import { saveChapterContent } from '../src/services/novel/novel-chapter-service.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const prevData = process.env.HUOHUO_DATA_ROOT
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-clear-meta-'))
process.env.HUOHUO_DATA_ROOT = tmp

try {
  const existing = mergeEpisodeMetadata(null, {
    causal_change_record: '【变更记录】\n- 场景: 旧',
    continuity_check: {
      passed: true,
      score: 90,
      summary: '旧审',
      conflicts: [],
      checked_at: new Date().toISOString(),
      content_hash: 'x',
    } as any,
    prose_char_count: 100,
  })

  const cleared = saveChapterContent({
    dramaId: 900001,
    episodeId: 900001,
    chapterNumber: 1,
    content: '',
    existingMetadata: existing,
  })

  const meta = JSON.parse(cleared.metadata)
  if (meta.causal_change_record) throw new Error('causal_change_record must be cleared')
  if (meta.continuity_check) throw new Error('continuity_check (21维) must be cleared')
  if (meta.continuity_ledger) throw new Error('continuity_ledger must be cleared')
  if (cleared.proseCharCount !== 0) throw new Error('proseCharCount must be 0')
  if (cleared.contentBlobPath != null) throw new Error('blobPath must be null when empty')

  const patch = contentDerivedMetadataClearPatch()
  if (!('causal_change_record' in patch) || !('continuity_check' in patch)) {
    throw new Error('clear patch must include change record + continuity_check')
  }

  console.log('verify-clear-content-clears-audit-meta OK')
} finally {
  if (prevData === undefined) delete process.env.HUOHUO_DATA_ROOT
  else process.env.HUOHUO_DATA_ROOT = prevData
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch { /* ignore */ }
}
