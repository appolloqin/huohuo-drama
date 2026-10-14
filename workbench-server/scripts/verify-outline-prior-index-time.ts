/**
 * 局部重生成索引须带【本章时间】，避免情节句另起日历
 * Run: npx tsx scripts/verify-outline-prior-index-time.ts
 */
import {
  extractOutlinePriorChapterIndex,
  extractOutlineSeamTimeAnchor,
} from '../src/services/novel/novel-outline-drama-fields.js'

const sample = `【分章概要】
第4章：二叔通匪
【本章时间】穿越第四日
【局面变化】通匪败露

第5章：黑风寨夜袭
【本章时间】穿越第五日戌时
【局面变化】夜袭击退

第11章：筒车引水
【本章时间】穿越第十一日
【局面变化】引水成功
`

const index = extractOutlinePriorChapterIndex(sample, 11)
if (!index.includes('第4章｜二叔通匪｜穿越第四日｜')) {
  throw new Error(`index must include time for ch4:\n${index}`)
}
if (!index.includes('第5章｜黑风寨夜袭｜穿越第五日戌时｜')) {
  throw new Error(`index must include time for ch5:\n${index}`)
}
if (index.includes('第11章')) {
  throw new Error('index must stop before fromChapter')
}
// 旧三栏格式不得再出现（缺时间栏）
if (/第5章｜黑风寨夜袭｜夜袭击退/.test(index)) {
  throw new Error('must not use old title｜stakes-only format')
}

const seam = extractOutlineSeamTimeAnchor(sample, 11)
if (seam !== '穿越第五日戌时') {
  throw new Error(`seam time expected 穿越第五日戌时, got ${JSON.stringify(seam)}`)
}

const emptySeam = extractOutlineSeamTimeAnchor(sample, 1)
if (emptySeam) throw new Error('from=1 has no seam')

console.log('verify-outline-prior-index-time OK')
