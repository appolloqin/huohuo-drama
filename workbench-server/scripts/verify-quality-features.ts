/**
 * 优秀/劣质特征块须注入章节写法引导
 * npx tsx scripts/verify-quality-features.ts
 */
import {
  WEBNOVEL_CHAPTER_PROSE_GUIDE,
  WEBNOVEL_OUTPUT_FORMAT_REMINDER,
  WEBNOVEL_QUALITY_FEATURES,
} from '../src/agents/webnovel-prose-style.js'

for (const key of ['优秀正文特征', '劣质', '作者代算账', '爽后复盘会', '内心状态栏', '权力落差可见', '称谓串味', '期限双时钟', '接招复读合同']) {
  if (!WEBNOVEL_QUALITY_FEATURES.includes(key)) {
    throw new Error(`WEBNOVEL_QUALITY_FEATURES missing: ${key}`)
  }
}

if (!WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('当面称谓')) {
  throw new Error('CHAPTER_PROSE_GUIDE must embed kinship address guide')
}
if (!WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('叙述标签')) {
  throw new Error('CHAPTER_PROSE_GUIDE must warn 叙述标签≠当面称呼')
}
if (!WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('分拍分工')) {
  throw new Error('CHAPTER_PROSE_GUIDE must state deadline beat分工')
}
if (!WEBNOVEL_OUTPUT_FORMAT_REMINDER.includes('急拍未重报')) {
  throw new Error('OUTPUT_FORMAT_REMINDER must self-check 急拍勿重报')
}
if (!WEBNOVEL_OUTPUT_FORMAT_REMINDER.includes('压迫方/仇人勿叫')) {
  throw new Error('OUTPUT_FORMAT_REMINDER must self-check kinship address')
}
if (!WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('接招与跨角色复述')) {
  throw new Error('CHAPTER_PROSE_GUIDE must embed stakes accept guide')
}
if (!WEBNOVEL_OUTPUT_FORMAT_REMINDER.includes('接招方')) {
  throw new Error('OUTPUT_FORMAT_REMINDER must self-check accept-no-echo')
}

if (!WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('优秀正文特征')) {
  throw new Error('CHAPTER_PROSE_GUIDE must embed quality features')
}
if (!WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('劣质')) {
  throw new Error('CHAPTER_PROSE_GUIDE must embed 劣质对照')
}
if (WEBNOVEL_QUALITY_FEATURES.includes('例如：') || /「[^」]{40,}」/.test(WEBNOVEL_QUALITY_FEATURES)) {
  throw new Error('quality features must not look like long copyable范文')
}
if (!WEBNOVEL_OUTPUT_FORMAT_REMINDER.includes('优秀特征')) {
  throw new Error('OUTPUT_FORMAT_REMINDER must mention quality self-check')
}

console.log('verify-quality-features OK')
