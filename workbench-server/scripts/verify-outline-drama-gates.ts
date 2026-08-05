/**
 * npx tsx scripts/verify-outline-drama-gates.ts
 */
import {
  computeDramaGatePassed,
  DRAMA_GATE_CODES,
  type DramaGateCode,
  type DramaGateEntry,
} from '../src/services/novel/novel-chapter-craft-check.js'
import { resolveChapterCraftRewriteMax, parseNovelMetadata } from '../src/common/novel/novel-meta.js'

const empty = {} as Record<DramaGateCode, DramaGateEntry>
if (computeDramaGatePassed(empty)) throw new Error('empty should fail')

const allWeak = Object.fromEntries(
  DRAMA_GATE_CODES.map(c => [c, { level: '弱' as const }]),
) as Record<DramaGateCode, DramaGateEntry>
if (!computeDramaGatePassed(allWeak)) throw new Error('all weak should pass')

const oneNone = { ...allWeak, desire_on_page: { level: '无' as const } }
if (computeDramaGatePassed(oneNone)) throw new Error('one 无 should fail')

if (resolveChapterCraftRewriteMax(parseNovelMetadata({})) !== 3) {
  throw new Error('rewrite_max default must be 3')
}

console.log('verify-outline-drama-gates OK')
