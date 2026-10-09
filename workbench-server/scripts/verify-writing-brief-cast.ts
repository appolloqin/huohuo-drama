/**
 * npx tsx scripts/verify-writing-brief-cast.ts
 */
import {
  buildWritingBriefCastConstraintBlock,
  extractChapterCastAllowlist,
  findForeignPersonNamesInBrief,
  mergeCastAllowlist,
} from '../src/services/novel/novel-writing-brief-cast.js'

const outline = [
  '第1章：卯时令牌',
  '【本章人物】秦默｜黑风岭领主，穿越者；秦德贵｜父亲，伤残老卒；王德福｜账房；赵铁柱｜旧部头领；秦德东｜二叔，族老；秦德民｜三叔，铁匠',
  '【本章起因】卯时签到',
].join('\n')

const allow = extractChapterCastAllowlist(outline)
if (!allow.includes('王德福') || !allow.includes('秦默') || !allow.includes('秦德东')) {
  throw new Error(`allowlist parse failed: ${JSON.stringify(allow)}`)
}
if (allow.includes('孙满仓')) throw new Error('孙满仓 must not be in outline allowlist')
if (allow.includes('穿越者') || allow.includes('伤残老卒') || allow.includes('铁匠')) {
  throw new Error(`role phrases must not enter allowlist: ${JSON.stringify(allow)}`)
}

const polluted = `
开头承诺：秦默一睁眼就被孙满仓哭穷、王德福讨债、秦忠冷眼三刀架喉。
场景目标：扣下孙满仓的账本。
孙满仓：欲望藏住烂账／怕新领主查账／哭穷起手。
秦忠：欲望重振秦家军威名／怕败在眼前。
王德福：欲望讨个说法／怕税银逼死百姓。
`
const foreign = findForeignPersonNamesInBrief(polluted, allow)
if (!foreign.includes('孙满仓')) throw new Error(`must catch 孙满仓, got ${foreign}`)
if (!foreign.includes('秦忠')) throw new Error(`must catch 秦忠, got ${foreign}`)
if (foreign.includes('满仓')) throw new Error(`must not false-positive 满仓: ${foreign}`)
if (foreign.includes('王德福') || foreign.includes('秦默')) {
  throw new Error(`allowlist names must not be foreign: ${foreign}`)
}

const clean = `
开头承诺：秦默被王德福讨债、秦德东冷眼、赵铁柱按刀三面夹击。
王德福：欲望讨个说法／怕税银逼死百姓。
秦德东：欲望夺权／怕被揭穿。
赵铁柱：欲望护主／怕旧部哗变。
`
const cleanForeign = findForeignPersonNamesInBrief(clean, allow)
if (cleanForeign.length) throw new Error(`clean brief must pass, got ${cleanForeign}`)

const block = buildWritingBriefCastConstraintBlock({ chapterOutline: outline })
if (!block.includes('王德福') || !/人名硬性/.test(block)) {
  throw new Error('constraint block missing')
}

const merged = mergeCastAllowlist(allow, ['沈青鸾', 'xx'])
if (!merged.includes('沈青鸾') || merged.includes('xx')) {
  throw new Error(`merge failed: ${merged}`)
}

console.log('verify-writing-brief-cast OK', { allow, foreign })
