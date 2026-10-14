/**
 * 管线末两环：去AI味 → 审稿；此前须大纲+一致性通过。
 * 去AI味后不再回头跑大纲修写/二次去AI味。
 * Run: npx tsx scripts/verify-outline-hard-reject-keeps-content.ts
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pipeSrc = readFileSync(
  resolve(root, 'src/services/novel/novel-chapter-pipeline.ts'),
  'utf8',
)

if (!/post-process-continuity-fail-skip-humanize/.test(pipeSrc)) {
  throw new Error('must skip humanize when continuity fails')
}
if (!/post-process-outline-recheck-before-humanize/.test(pipeSrc)) {
  throw new Error('craft cold-open recheck must run before humanize')
}
if (/post-process-outline-recheck-after-humanize|pipeline-outline-recheck-after-humanize/.test(pipeSrc)) {
  throw new Error('must NOT recheck outline after humanize')
}
if (/去AI味（大纲再修后）/.test(pipeSrc)) {
  throw new Error('must NOT re-humanize after outline rewrite')
}
if (!/runGuardedAiHumanize/.test(pipeSrc)) {
  throw new Error('shared guarded humanize helper required')
}
if (/deferPipeline/.test(pipeSrc)) {
  throw new Error('must not defer humanize after outline hardReject')
}

// 流式路径：去AI味块应出现在平台审稿之前，且其后不应再有大纲合规门
const streamHumanize = pipeSrc.indexOf('const humanizeOut = await runGuardedAiHumanize({')
const streamReview = pipeSrc.indexOf("onProgress?.('平台审稿中…')")
if (streamHumanize < 0 || streamReview < 0 || streamHumanize > streamReview) {
  throw new Error('stream path: humanize must precede platform review')
}

console.log('verify-pipeline-humanize-final-stage OK')
