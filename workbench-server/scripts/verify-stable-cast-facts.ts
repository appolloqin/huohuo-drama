/**
 * npx tsx scripts/verify-stable-cast-facts.ts
 */
import {
  parseAgeToken,
  extractStableCastFactsFromOutline,
  detectStableAgeConflicts,
  formatStableCastFactsInjectBlock,
  shouldInjectStableCastFacts,
  maybeFormatStableCastFactsInjectBlock,
  selectStableCastFactsForInject,
  detectNeededStableDimsFromChapterOutline,
} from '../src/services/novel/novel-stable-cast-facts.js'

if (parseAgeToken('十九') !== 19) throw new Error('十九')
if (parseAgeToken('二十三') !== 23) throw new Error('二十三')
if (parseAgeToken('20') !== 20) throw new Error('20')

const outline = `
【主要人物】
- **秦卫国**：男主，20岁，重生者，前特种兵王。
- **苏婉**：女主，19岁，资本家大小姐，下放劳动改造人员。
`

// 点名出场但大纲不需要年龄 → 不注入
if (maybeFormatStableCastFactsInjectBlock(outline, '【本章人物】秦卫国、苏婉\n进山设套')) {
  throw new Error('named cast without age-need must NOT inject')
}
if (detectNeededStableDimsFromChapterOutline('刘干事上门试探周旋').size) {
  throw new Error('mere 试探/周旋 must NOT need age inject')
}

// 官方盘查（即使用户未写「几岁」）→ 需要年龄；注入主要人物已写年龄者（含未点名家眷）
const panCha = `
【本章人物】秦卫国、刘干事
【欲望】应付官方盘查，不露破绽
【阻碍】刘干事的试探与敲诈意图
`
if (!detectNeededStableDimsFromChapterOutline(panCha).has('age')) {
  throw new Error('官方盘查 must need age')
}
const panInject = maybeFormatStableCastFactsInjectBlock(outline, panCha)
if (!panInject || !/苏婉/.test(panInject) || !/19岁/.test(panInject) || !/秦卫国/.test(panInject)) {
  throw new Error(`盘查 must inject 苏婉+秦卫国 ages: ${panInject}`)
}

// 大纲判定需要年龄/户籍 → 注入
const needBlock = maybeFormatStableCastFactsInjectBlock(
  outline,
  '【本章人物】苏婉、秦卫国\n刘干事上门登记，盘问年龄籍贯',
)
if (!needBlock || !/苏婉/.test(needBlock) || !/19岁/.test(needBlock)) {
  throw new Error(`need+named must inject 苏婉19: ${needBlock}`)
}

const asked = selectStableCastFactsForInject(
  outline,
  '苏婉应答\n问她几岁',
)
if (!asked.some(f => f.name === '苏婉' && f.ageYears === 19)) {
  throw new Error(`ask-age must include 苏婉: ${JSON.stringify(asked)}`)
}

if (!shouldInjectStableCastFacts('配合登记报年龄')) {
  throw new Error('registration SHOULD need inject')
}
if (!maybeFormatStableCastFactsInjectBlock(outline, '配合登记报年龄')) {
  throw new Error('inject when need without names (fallback all)')
}

const facts = extractStableCastFactsFromOutline(outline)
if (!facts.some(f => f.name === '苏婉' && f.ageYears === 19)) {
  throw new Error(`missing 苏婉19: ${JSON.stringify(facts)}`)
}

const block = formatStableCastFactsInjectBlock(facts)
if (!/稳定人设/.test(block) || !/苏婉/.test(block)) throw new Error('inject block')

const bad = `苏婉低着头走出来。"几岁了？""二十三。""籍贯？""省城。"`
if (!detectStableAgeConflicts(bad, facts).some(h => h.rule === 'stable_age_conflict')) {
  throw new Error('should catch 23 vs 19')
}

const ok = `苏婉低着头走出来。"几岁了？""十九。""籍贯？""省城。"`
if (detectStableAgeConflicts(ok, facts).length) throw new Error('19 should pass')

const longGap = [
  '刘建国问苏婉几岁。',
  '门帘后头，苏婉已经站起来了。门帘是块洗得发白的蓝花布，底下耷拉一截毛边，她一只手捏在那毛边上，指节泛着白。苏婉往前挪半步。',
  '两只手绞在身前，目光落在脚尖前头那片冻裂的泥地上，没抬。',
  '"二十三。"她答。',
].join('')
if (!detectStableAgeConflicts(longGap, facts).some(h => /二十三/.test(h.message))) {
  throw new Error('long-gap 二十三 must hard-fail')
}

// 无问句：仅「二十三。」她答 + 前窗苏婉（实章常见漏写几岁）
const noQ = [
  '门帘后头，苏婉已经站起来了。苏婉往前挪半步。',
  '两只手绞在身前，目光落在脚尖前头那片冻裂的泥地上，没抬。',
  '“二十三。”她答。刘建国那笔在本子上顿一下。',
].join('')
const noQHits = detectStableAgeConflicts(noQ, facts)
if (!noQHits.some(h => /苏婉/.test(h.message) && /二十三/.test(h.message))) {
  throw new Error(`no-Q 她答 must catch 苏婉: ${JSON.stringify(noQHits)}`)
}
if (noQHits.some(h => /秦卫国/.test(h.message))) {
  throw new Error(`no-Q must not pin 秦卫国: ${JSON.stringify(noQHits)}`)
}

// 旁白近距「人名…N岁」不做硬拦（易把弟妹年龄挂到兄长）；仅问答结构硬拦
{
  const familyOutline = `
【主要人物】
- **秦建民**：大弟，15岁。
- **秦建英**：二妹，12岁。
- **秦建军**：小弟，8岁。
`
  const familyFacts = extractStableCastFactsFromOutline(familyOutline)
  if (!familyFacts.some(f => f.name === '秦建民' && f.ageYears === 15)) {
    throw new Error(`family facts: ${JSON.stringify(familyFacts)}`)
  }
  const siblingProse = [
    '炕角三个小的缩成一团。',
    '秦建民把两个弟妹往身后挡，十五岁的半大小子，胳膊细得像柴。',
    '秦建英才十二岁，棉袄肘子上的补丁摞着补丁。',
  ].join('')
  if (detectStableAgeConflicts(siblingProse, familyFacts).length) {
    throw new Error('sibling near-age narration must NOT hard-fail')
  }
  const wrongNarration = '秦建民缩在墙角，十二岁的半大小子不敢吭声。'
  if (detectStableAgeConflicts(wrongNarration, familyFacts).length) {
    throw new Error('proximity-only wrong age must NOT hard-fail (model soft only)')
  }
  const wrongQa = '队长盯着秦建民问几岁了。「十二。」他答。'
  if (!detectStableAgeConflicts(wrongQa, familyFacts).some(h => /秦建民/.test(h.message) && /十二/.test(h.message))) {
    throw new Error('explicit age Q&A wrong answer must still hard-fail')
  }
}

console.log('verify-stable-cast-facts OK')
