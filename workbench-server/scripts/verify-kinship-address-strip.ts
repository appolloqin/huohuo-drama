/**
 * 压迫方对白族内称串味剥离
 * npx tsx scripts/verify-kinship-address-strip.ts
 */
import { stripOutsiderKinshipAddress } from '../src/common/novel/novel-kinship-address-strip.js'
import { stripIntraChapterNearDuplicate } from '../src/services/novel/novel-intra-chapter-dedupe.js'
import { WEBNOVEL_KINSHIP_ADDRESS_GUIDE } from '../src/agents/webnovel-prose-style.js'

if (!WEBNOVEL_KINSHIP_ADDRESS_GUIDE.includes('压迫方/仇人')) {
  throw new Error('kinship guide must hard-ban 压迫方/仇人')
}
if (!WEBNOVEL_KINSHIP_ADDRESS_GUIDE.includes('秦二叔')) {
  throw new Error('kinship guide must ban 姓+二叔')
}
if (WEBNOVEL_KINSHIP_ADDRESS_GUIDE.includes('秦伯若仅为社交敬称')) {
  throw new Error('kinship guide must not keep 秦伯社交敬称 loophole')
}

const sample = [
  '秦卫东沉声道：“钱爷，我侄儿3日前确实去了县外乱葬岗。”',
  '',
  '“上坟？”钱虎斜了他一眼，嘿笑一声，“秦二叔，你当尸傀门外门弟子是吃素的？”',
].join('\n')

const { text, removed } = stripOutsiderKinshipAddress(sample)
if (!removed) throw new Error('expected removed=true')
if (text.includes('秦二叔')) throw new Error(`秦二叔 left:\n${text}`)
if (!text.includes('秦二爷')) throw new Error(`should rewrite to 秦二爷:\n${text}`)
if (!text.includes('我侄儿')) throw new Error('family dialogue must keep 侄儿')

const via = stripIntraChapterNearDuplicate(sample).text
if (via.includes('秦二叔')) throw new Error(`dedupe path left 秦二叔:\n${via}`)

const family = '秦霄道：“二叔，我接了。”'
const famOut = stripOutsiderKinshipAddress(family)
if (famOut.removed || famOut.text !== family) {
  throw new Error(`family speaker must not rewrite:\n${famOut.text}`)
}

console.log('verify-kinship-address-strip OK')
