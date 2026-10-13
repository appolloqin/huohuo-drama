/**
 * 指称串名硬审（通用）
 * Run: npx tsx scripts/verify-referent-name-binding-audit.ts
 */
import {
  detectReferentNameBindingConflicts,
  extractReferentNameBindings,
} from '../src/common/novel/novel-referent-name-binding-audit.js'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
  console.log('ok', msg)
}

const conflict = `
秦德东是这头老虎的钱袋子。二叔秦德东跟黑风寨勾连的账目，记在暗账里。
后来又写：二叔秦德贵跟黑风寨勾连的账目，一页页都记在孙满仓的暗账里。
`
const hits = detectReferentNameBindingConflicts(conflict)
assert(hits.length >= 1, '同一指称绑两专名应硬拦')
assert(hits.some((h) => h.rule === 'referent_name_binding_conflict'), 'rule 正确')
assert(hits.some((h) => h.message.includes('秦德东') && h.message.includes('秦德贵')), 'message 含两名')

const crossChapter = detectReferentNameBindingConflicts(
  '昨日二叔秦德东在正堂说话。',
  '今日旁白：二叔秦德贵跟黑风寨勾连。',
)
assert(crossChapter.length >= 1, '跨章指称串名应硬拦')

const single = `
秦德东是中间跑腿的。二叔秦德贵跟黑风寨勾连的账目，一页页都记在孙满仓的暗账里。
秦德东是中间跑腿的，黑风虎的私铁卖到北狄去。
`
assert(detectReferentNameBindingConflicts(single).length === 0, '指称只绑一人时不误拦')

const bindings = extractReferentNameBindings('秦默对秦德贵二叔点了点头。秦德贵又坐下。')
assert(bindings.get('二叔')?.has('秦德贵') === true, '专名后指称：秦德贵二叔')

console.log('all referent name binding checks passed')
