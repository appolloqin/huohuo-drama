/**
 * 书名规范化
 * npx tsx scripts/verify-normalize-novel-title.ts
 */
import { normalizeGeneratedNovelTitle } from '../src/common/novel/novel-creative-output.js'

const cases: [string, string][] = [
  ['《九霄剑主》', '九霄剑主'],
  ['书名：废柴逆袭', '废柴逆袭'],
  ['「北疆猎手」\n多余说明', '北疆猎手'],
  ['  重生1966  ', '重生1966'],
  ['项目名：时光邮局', '时光邮局'],
]
for (const [raw, expect] of cases) {
  const got = normalizeGeneratedNovelTitle(raw)
  if (got !== expect) throw new Error(`normalize(${JSON.stringify(raw)}) => ${JSON.stringify(got)}, want ${JSON.stringify(expect)}`)
}
console.log('verify-normalize-novel-title OK')
