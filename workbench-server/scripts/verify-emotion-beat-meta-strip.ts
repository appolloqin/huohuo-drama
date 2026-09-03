/**
 * 情绪拍任务标签泄漏剥离
 * npx tsx scripts/verify-emotion-beat-meta-strip.ts
 */
import { stripEmotionBeatMetaLabels } from '../src/common/novel/novel-emotion-beat-meta-strip.js'
import { stripIntraChapterNearDuplicate } from '../src/services/novel/novel-intra-chapter-dedupe.js'

const sample = [
  '（恨拍）',
  '',
  '一声闷响，祠堂门槛被一脚踹开。',
  '',
  '“秦霄呢？”',
  '',
  '（爽拍）',
  '',
  '秦霄撕了借据。',
].join('\n')

const { text, removed } = stripEmotionBeatMetaLabels(sample)
if (!removed) throw new Error('expected removed=true')
if (/恨拍|爽拍/.test(text)) throw new Error(`meta left:\n${text}`)
if (!text.includes('一声闷响') || !text.includes('撕了借据')) {
  throw new Error(`prose must keep:\n${text}`)
}

const lead = stripEmotionBeatMetaLabels('（恨拍）木屑纷飞，钱虎进了院。')
if (lead.text.startsWith('（恨拍）') || !lead.text.includes('木屑纷飞')) {
  throw new Error(`lead strip fail:\n${lead.text}`)
}

const via = stripIntraChapterNearDuplicate(sample).text
if (/恨拍|爽拍/.test(via)) throw new Error(`dedupe path left meta:\n${via}`)

const clean = '秦霄抬眼：“三叔，我接。”'
const cleanOut = stripEmotionBeatMetaLabels(clean)
if (cleanOut.removed || cleanOut.text !== clean) {
  throw new Error('clean prose must stay')
}

console.log('verify-emotion-beat-meta-strip OK')
