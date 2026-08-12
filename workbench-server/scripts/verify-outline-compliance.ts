/**
 * 大纲落实校验（通用：字面/锚点 + 末拍越界 V2 + 名后那/这+泛称；无场面词表、无截断）
 * Run: npx tsx scripts/verify-outline-compliance.ts
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  detectOutlineCompliance,
  formatWeakRewriteDraftBlock,
  formatNuclearColdDraftBlock,
  buildOutlineBeatHardBlock,
  extractBriefPacingClause,
} from '../src/services/novel/novel-outline-compliance.js'
import { buildChapter1WorldIntroBlock, hasRealWorldBlock } from '../src/common/novel/novel-worldbuilding.js'
import { NOVEL_OUTLINE_WORLD_SECTION } from '../src/agents/novel-defaults.js'

function pad(s: string, minChars: number): string {
  let out = s
  while ([...out].length < minChars) out += s + '补充叙述若干字。'
  return out
}

const outline = '主角醒来发现身处陌生房间 / 身边躺着一个陌生人 / 门外脚步声逼近 / 他迅速理清现状决定不再逃避'

// 严匹配：正文须含大纲拍点原文片段
const goodHead = pad(
  '主角醒来发现身处陌生房间。身边躺着一个陌生人。门外脚步声逼近。混乱思绪里带着对环境的空间感。',
  900,
)
const goodTail = pad('他迅速理清现状决定不再逃避。', 250)
const good = goodHead + goodTail

const badHead = pad('木板终于塌了火光涌进来为首的人冷笑着逼近当众升级他站起来大声表态要公开关系人群哗然', 500)
const bad = badHead + pad('后文继续争吵。', 800)

const rGood = detectOutlineCompliance({
  content: good,
  chapterOutline: outline,
  writingBrief: '需在前三分之一篇幅内，借主角苏醒后的混乱思绪与对环境的空间感确立穿越。',
  chapterNumber: 1,
})
console.log('good ok:', rGood.ok, rGood.reasons.map(x => x.code))

const rBad = detectOutlineCompliance({
  content: bad,
  chapterOutline: outline,
  writingBrief: '需在前三分之一篇幅内，借主角苏醒后的混乱思绪与对环境的空间感确立穿越。',
  chapterNumber: 1,
})
console.log('bad ok:', rBad.ok, rBad.reasons.map(x => x.code))

const prevTail = pad('他迅速理清现状决定不再逃避。众人散去，夜色渐深。', 400)
const staleOutline = '主角醒来发现身处陌生房间 / 身边躺着一个陌生人 / 门外脚步声逼近 / 他迅速理清现状决定不再逃避 / 次日对峙升级'
const ch2 = pad('次日对峙升级。对方不肯罢休，新的阻力出现。他只能硬着头皮应对。次日对峙升级收束于此。', 500)
const rStale = detectOutlineCompliance({
  content: ch2,
  chapterOutline: staleOutline,
  prevChapterTail: prevTail + '他迅速理清现状决定不再逃避。门外脚步声逼近。身边躺着一个陌生人。主角醒来发现身处陌生房间。',
  chapterNumber: 2,
})
console.log('ch2 stale skip ok:', !rStale.reasons.some(r => r.code === 'early_beats_missing'), rStale.reasons.map(x => x.code))
if (rStale.reasons.some(r => r.code === 'early_beats_missing')) {
  throw new Error('ch2+ stale early beats must not fail C1')
}

// 章缝叙事不再走规则硬审（交给模型）；离家开篇不得仅因规则产出 chapter_seam_cold_open
const huntPrev = pad('雪地脚印还在。他收起刀，记下明日再来设套，沿原路折回营地边缘。', 400)
const huntOutline = '精准击杀 / 设好简易陷阱成功猎获两只肥野兔 / 娴熟剥皮处理 / 归途遇赵大虎挑衅冷眼无视'
const coldBody = pad('天没亮，秦卫国醒了。炕那头苏婉还蜷着。他摸出猎刀，开门迎着寒风往红松林走去。一路上想着家里的事。', 900)
const rCold = detectOutlineCompliance({
  content: coldBody,
  chapterOutline: huntOutline,
  prevChapterTail: huntPrev,
  chapterNumber: 5,
})
console.log('cold open codes (rule path):', rCold.reasons.map(x => x.code))
if (rCold.reasons.some(r => r.code === 'chapter_seam_cold_open')) {
  throw new Error('rule path must not emit chapter_seam_cold_open (model-only)')
}
const nuclear = formatNuclearColdDraftBlock({ existingText: coldBody, chapterOutline: huntOutline })
if (!nuclear.includes('核修模式') || !nuclear.includes('早于上章末')) {
  throw new Error('nuclear cold draft block incomplete')
}
console.log('nuclear cold block ok; rule seam skipped ok')

const orphanCore = '木板终于塌了火光涌进来为首的人冷笑着逼近当众升级他站起来大声表态要公开关系人群哗然这一段与大纲前半无关完全是旧稿越界高潮铺陈'
const orphanDraft = pad(orphanCore, 300) + pad('主角醒来发现身处陌生房间。', 200)
const replayed = pad(orphanCore, 500) + pad('他这才想起自己还没理清现状。', 600)
const rReplay = detectOutlineCompliance({
  content: replayed,
  chapterOutline: outline,
  existingText: orphanDraft,
  chapterNumber: 1,
})
console.log('draft orphan replay:', rReplay.reasons.some(r => r.code === 'draft_orphan_replay'), rReplay.reasons.map(x => x.code))

const weak = formatWeakRewriteDraftBlock({ existingText: orphanDraft + good, chapterOutline: outline })
console.log('weak draft short:', weak.length < 2500, 'has forbid:', weak.includes('禁止'))

const hard = buildOutlineBeatHardBlock({ chapterOutline: outline, writingBrief: '需在前三分之一篇幅内写清苏醒混乱。' })
console.log('hard block:', hard.includes('大纲拍点硬性') && hard.includes('章末边界'))

const pacing = extractBriefPacingClause('需在前三分之一篇幅内，借主角苏醒后的混乱思绪。')
console.log('pacing:', !!pacing)

console.log('empty world:', buildChapter1WorldIntroBlock({}) === '')
console.log('hasReal false:', hasRealWorldBlock({}) === false)
const withWorld = `${NOVEL_OUTLINE_WORLD_SECTION}\n修炼体系：淬体-凝气\n大陆/地域：东荒\n门派/势力：青云宗、赤焰门\n`
console.log('hasReal true:', hasRealWorldBlock({ outline: withWorld }) === true)
console.log('world block non-empty:', buildChapter1WorldIntroBlock({ outline: withWorld }).length > 50)

const complianceSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/novel/novel-outline-compliance.ts'),
  'utf8',
)
if (/破门|提亲|撞开|踹门/.test(complianceSrc)) {
  throw new Error('novel-outline-compliance.ts must not contain scene-word rule vocabulary')
}
if (/trimOutlineEndpointOvershoot/.test(complianceSrc)) {
  throw new Error('compliance module must not contain deterministic trim helpers')
}
if (/trimOutlineEndpointOvershoot/.test(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/novel/novel-outline-compliance-fix.ts'),
    'utf8',
  ),
)) {
  throw new Error('fix path must not use trimOutlineEndpointOvershoot')
}

if (!rGood.ok) throw new Error('expected good pass')
if (rBad.ok) throw new Error('expected bad fail')
if (!rBad.reasons.some(r => r.code === 'early_beats_missing' || r.code === 'brief_pacing' || r.code === 'head_orphan_span')) {
  throw new Error('expected early/pacing/orphan reason on bad')
}
if (!rReplay.reasons.some(r => r.code === 'draft_orphan_replay')) {
  throw new Error('expected draft_orphan_replay')
}

// 最后拍点过早字面出现 + 长尾无拍点
const earlyDone = pad(
  '主角醒来发现身处陌生房间。身边躺着一个陌生人。门外脚步声逼近。他迅速理清现状决定不再逃避。',
  400,
)
const overshootTail = pad('随后外头的人闯了进来，双方当众升级，他站起身大声表态并许下一个月期限，众人让路，他扶着人往外走，脑中浮现更远的商路地图。', 900)
const overshoot = earlyDone + overshootTail
const rEnd = detectOutlineCompliance({
  content: overshoot,
  chapterOutline: outline,
  writingBrief: '需在前三分之一篇幅内，借主角苏醒后的混乱思绪与对环境的空间感确立穿越。',
  chapterNumber: 1,
})
console.log('endpoint overshoot:', rEnd.reasons.some(r => r.code === 'outline_endpoint_overshoot'), rEnd.reasons.map(x => x.code))
if (!rEnd.reasons.some(r => r.code === 'outline_endpoint_overshoot')) {
  throw new Error('expected outline_endpoint_overshoot')
}

const tightEnd = pad('主角醒来发现身处陌生房间。身边躺着一个陌生人。门外脚步声逼近。思绪乱了一阵。', 900)
  + pad('他迅速理清现状决定不再逃避。', 200)
const rTight = detectOutlineCompliance({
  content: tightEnd,
  chapterOutline: outline,
  chapterNumber: 1,
})
console.log('tight endpoint ok:', !rTight.reasons.some(r => r.code === 'outline_endpoint_overshoot'), rTight.reasons.map(x => x.code))
if (rTight.reasons.some(r => r.code === 'outline_endpoint_overshoot')) {
  throw new Error('tight ending should not overshoot')
}

// 意译覆盖：前段用近义表述 + 锚点；末拍用大纲锚点收束（不依赖场面特判）
const paraOutline =
  '林远醒来发现身处草垛 / 身边是衣衫不整的柳如梅 / 门外火把通明村民叫骂逼近 / 他迅速理清现状决定不再逃避'
const paraOk = pad('林远撑开眼皮，发现自己躺在发霉的破草垛里。身边蜷着衣衫凌乱的柳如梅。门外火把晃动，村民叫骂声逼近。思绪乱成一团。', 750)
  + '他强迫自己冷静，迅速理清现状，决定不再逃避。'
const rParaOk = detectOutlineCompliance({
  content: paraOk,
  chapterOutline: paraOutline,
  chapterNumber: 1,
})
console.log('paraphrase ok:', rParaOk.ok, rParaOk.reasons.map(x => x.code))
if (rParaOk.reasons.some(r => r.code === 'early_beats_missing')) {
  throw new Error('paraphrased early beats should pass C1')
}
if (rParaOk.reasons.some(r => r.code === 'outline_endpoint_overshoot')) {
  throw new Error('ending at last beat must not overshoot')
}

const paraOver = paraOk + pad(
  '随后外头的人闯了进来，双方当众升级，他站起身大声表态并许下一个月期限，众人让路，他扶着人往外走。',
  1000,
)
const rParaOver = detectOutlineCompliance({
  content: paraOver,
  chapterOutline: paraOutline,
  writingBrief: '需在前三分之一篇幅内确立开篇状态。',
  chapterNumber: 1,
})
console.log('paraphrase overshoot:', rParaOver.reasons.map(x => x.code))
if (!rParaOver.reasons.some(r => r.code === 'outline_endpoint_overshoot')) {
  throw new Error('overshoot tail must trigger outline_endpoint_overshoot')
}

// 逗号/顿号在拍点内部：不得拆碎末拍，否则「决定不逃 + 开门后长尾 + 末尾回扣」会漏检
const commaOutline =
  '林远在草垛中醒来，发现身边衣衫不整的柳如梅 / 后山草垛外火把与村民逼近，赵德柱带头围攻 / 林远快速评估处境：流氓罪、沉潭风险、原主烂摊子 / 他决定不再逃跑，硬着头皮面对这一局'
const commaBody = pad(
  '林远撑开眼皮，发现自己躺在破草垛里。身边蜷着衣衫凌乱的柳如梅。门外火把晃动，赵德柱带着村民叫骂逼近。他迅速评估沉潭与流氓罪风险，原主烂摊子压顶。想死？他扣住柳如梅手腕：我不会再逃了，硬着头皮也得下。',
  900,
) + pad(
  '然后他推开木门。火把扑进来，赵德柱打头。他当众认亲：我跟柳如梅男未婚女未嫁，我认下这门亲事。人群哗然。不逃了。往后这条命，就拿来逆天改命。',
  1100,
)
const rComma = detectOutlineCompliance({
  content: commaBody,
  chapterOutline: commaOutline,
  chapterNumber: 1,
})
console.log('comma-beat overshoot:', rComma.reasons.map(x => x.code))
if (!rComma.reasons.some(r => r.code === 'outline_endpoint_overshoot')) {
  throw new Error('comma-containing beats must still detect outline_endpoint_overshoot')
}

// V2：末拍意译未覆盖 + 前段拍点早完成 + 开门后长尾（旧 55% 门槛会漏）
const doorOver = pad(
  '痛。林远撑开眼皮。破草垛。一个名字浮上来：柳如梅。这姑娘被拖来。身边那姑娘要去死。想死？唯一的活路不是逃。信。',
  1500,
) + pad(
  '砰。有人踹开半掩的门板闯进来。他站起朝门口走。门外火把通明二十几号人。你还敢出来。双方当众升级。这局他接了。',
  900,
)
const rDoor = detectOutlineCompliance({
  content: doorOver,
  chapterOutline: paraOutline,
  chapterNumber: 1,
})
console.log('door overshoot V2:', rDoor.reasons.map(x => x.code))
if (!rDoor.reasons.some(r => r.code === 'outline_endpoint_overshoot')) {
  throw new Error('door-after-decide must trigger outline_endpoint_overshoot (V2)')
}
if (!rDoor.reasons.some(r => r.code === 'named_as_generic')) {
  throw new Error('name then 那/这+泛称 must trigger named_as_generic')
}

// 换题材泛称：少年（证明未写死姑娘）
const youthOver = pad(
  '痛。主角撑开眼皮。一个名字浮上来：陈青。这少年被拖来。身边那少年要去死。他迅速理清现状，决定不再逃避。',
  800,
)
const youthOutline = '主角醒来 / 身边是陈青 / 门外脚步逼近 / 他迅速理清现状决定不再逃避'
const rYouth = detectOutlineCompliance({
  content: youthOver,
  chapterOutline: youthOutline,
  chapterNumber: 1,
})
if (!rYouth.reasons.some(r => r.code === 'named_as_generic')) {
  throw new Error('那少年/这少年 after 陈青 must trigger named_as_generic')
}

const namedOk = pad(
  '痛。林远撑开眼皮。草垛。一个名字浮上来：柳如梅。柳如梅泪流满面。门外火把通明，村民叫骂声逼近。',
  700,
) + '林远迅速理清现状，决定不再逃避。柳如梅抓住他的手。'
const rNamedOk = detectOutlineCompliance({
  content: namedOk,
  chapterOutline: paraOutline,
  chapterNumber: 1,
})
if (rNamedOk.reasons.some(r => r.code === 'named_as_generic')) {
  throw new Error('stable name usage must not flag named_as_generic')
}

// 「这么一 / 那么点」不得误判为名后泛称
const zheme = pad(
  '痛。林远撑开眼皮。一个名字浮上来：柳如梅。柳如梅咬唇。门外火把通明。这么一回事搅得他头疼。他那么一点也不敢大意。他迅速理清现状，决定不再逃避。',
  700,
)
const rZheme = detectOutlineCompliance({
  content: zheme,
  chapterOutline: paraOutline,
  chapterNumber: 1,
})
if (rZheme.reasons.some(r => r.code === 'named_as_generic')) {
  throw new Error('这么一/那么点 must not trigger named_as_generic')
}

if (weak.length >= 2500) throw new Error('weak draft should stay short')
if (buildChapter1WorldIntroBlock({}) !== '') throw new Error('empty world should return empty block')

const hardPriority = buildOutlineBeatHardBlock({
  chapterOutline: paraOutline,
  writingBrief: '说明目标可以写得比大纲更大，但不得越界。',
})
if (!/以大纲为准/.test(hardPriority)) {
  throw new Error('hard block must state outline priority over brief')
}
if (/化解|翻盘|坐实|捉奸|那姑娘|姑娘愣/.test(complianceSrc)) {
  throw new Error('compliance module must not contain scene-specific epithet tables')
}

// 空正文不得误判大纲通过（删毒全清后的回归）
const rEmpty = detectOutlineCompliance({
  content: '',
  chapterOutline: outline,
  chapterNumber: 4,
})
if (rEmpty.ok) throw new Error('empty content must not pass outline compliance')
if (!rEmpty.reasons.some(r => /为空|删毒/.test(r.message))) {
  throw new Error('empty content must explain 删毒/为空')
}
console.log('empty content not ok')

// 章末悬念未决：正文揭晓完成态（换皮「扎进套口」）须越界；下章起因亦须泄漏
const forestOutline = [
  '【局面变化】发现野兔踪迹',
  '【人物选择】冷静判断，设下陷阱',
  '【章末问题】陷阱能否奏效？',
].join('\n')
const nextKillOutline = [
  '【本章起因】陷阱成功捕获野兔',
  '【欲望】安全带猎物回家',
  '【人物选择】不与小人计较',
].join('\n')
// 结构：下章起因载荷「野兔」+ 持有（提着/手里），无场面专词表
const killOvershoot = pad(
  [
    '他冷静判断后设下陷阱，屏住呼吸等着。',
    '片刻后他提着那只还在蹬腿的兔子往回走，手里沉甸甸的，苏婉还在家里等着。',
  ].join(''),
  900,
)
const rKill = detectOutlineCompliance({
  content: killOvershoot,
  chapterOutline: forestOutline,
  nextChapterOutline: nextKillOutline,
  chapterNumber: 4,
})
if (rKill.ok) throw new Error('kill overshoot must fail')
if (!rKill.reasons.some(r => r.code === 'outline_endpoint_overshoot' && /章末悬念|下章起因|能否奏效/.test(r.message))) {
  throw new Error(`must flag suspense/next-cause resolve, got: ${rKill.reasons.map(x => x.message).join(' | ')}`)
}
if (!rKill.reasons.some(r => r.code === 'next_chapter_beat_leak' || /下章起因/.test(r.message))) {
  throw new Error(`must flag next-chapter cause leak, got: ${rKill.reasons.map(x => x.code + ':' + x.message).join(' | ')}`)
}
console.log('suspense resolve overshoot ok')

console.log('PASS')
