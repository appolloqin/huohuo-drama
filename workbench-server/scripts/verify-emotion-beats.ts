/**
 * npx tsx scripts/verify-emotion-beats.ts
 * 第三版三刀：爽=震慑+露尖；急=天数；盼=短缺一环 + 种子截断
 */
import {
  buildEmotionBeatHardRule,
  buildEmotionBeatSpecs,
  clipEmotionOutlineSeed,
  EMOTION_BEAT_WEIGHTS,
  EMOTION_PAN_SEED_MAX_CHARS,
  isEmotionBeatPhase,
  shouldBindEmotionBeats,
} from '../src/services/novel/novel-chapter-emotion-beats.js'
import { resolveChapterBeatBudgets } from '../src/services/novel/novel-chapter-beat-budget.js'

if (!shouldBindEmotionBeats(1) || !shouldBindEmotionBeats(8)) throw new Error('1-8 must bind')
if (shouldBindEmotionBeats(9) || shouldBindEmotionBeats(0)) throw new Error('outside 1-8 must not')

const outline = `第1章 开篇
【本章时间】清晨
【本章地点】破屋
【本章人物】秦卫国、王瘸子
【本章起因】王瘸子踹门催债
【欲望】保住房契与尊严
【阻碍】王瘸子逼签抵房契并当众羞辱
【局面变化】契被撕、债主变脸
【人物选择】当场撕契硬刚
【冲突层】外部、人际
【情绪手法】极限压迫后短打脸
【章末问题】三天内拿什么翻本？
【信息增量】他会修柴油机
【主题回响】穷不交骨气
【恨】王瘸子踹门逼签抵房契并当众羞辱（冲突当场）
【爽】当场撕契硬刚，把假账页拍在炕沿上点出一处让王瘸子愣住变脸
【急】六天内拿什么翻本？王瘸子折返甩下盖章催缴单
【盼】柴油机可翻身；气缸盖螺丝被人拧松留隐患
【爽型】硬撕`

const specs = buildEmotionBeatSpecs({ chapterOutline: outline, chapterNumber: 1 })
if (specs.length !== 4) throw new Error(`specs ${specs.length}`)
if (specs.map(s => s.phase).join('') !== '恨爽急盼') throw new Error('phase order')
if (!specs[0]!.beat.includes('王瘸子') && !specs[0]!.beat.includes('逼签')) throw new Error('hate missing')
if (!specs[0]!.beat.includes('大纲恨场')) throw new Error('hate should prefer explicit tag')
if (!specs[1]!.beat.includes('撕契') && !specs[1]!.beat.includes('硬撕')) throw new Error('shuang missing')
if (!specs[2]!.beat.includes('六天') && !specs[2]!.beat.includes('期限')) throw new Error('ji missing')
if (!specs[3]!.beat.includes('柴油机')) throw new Error('pan missing')

for (const p of ['恨', '爽', '急', '盼'] as const) {
  if (!isEmotionBeatPhase(p)) throw new Error(`phase ${p}`)
  const hard = buildEmotionBeatHardRule(p)
  if (!hard.includes(p)) throw new Error(`hard ${p}`)
}

if (!buildEmotionBeatHardRule('恨').includes('冲突前置')) throw new Error('hate fierce')
if (!buildEmotionBeatHardRule('爽').includes('动作震慑')) throw new Error('shuang action')
if (!buildEmotionBeatHardRule('爽').includes('本事露尖') && !buildEmotionBeatHardRule('爽').includes('越界')) {
  throw new Error('shuang tip')
}
if (!buildEmotionBeatHardRule('急').includes('拢共天数')) throw new Error('ji day count')
if (!buildEmotionBeatHardRule('盼').includes('缺一环')) throw new Error('pan missing link')

if (!specs[1]!.beat.includes('三刀') && !specs[1]!.beat.includes('动作震慑')) {
  throw new Error('shuang spec must carry V3 core')
}
if (!specs[2]!.beat.includes('拢共天数')) throw new Error('ji spec day count')
if (!specs[3]!.beat.includes('种子') || !specs[3]!.beat.includes('禁止展开')) {
  throw new Error('pan spec must be seed + no process expand')
}

{
  const longPan = '秦建国翻遍原主记忆想起后院柴堆底下压着老契他摸黑去翻果然翻出发黄的纸写着后罩房归长子但纸角被老鼠啃掉缺一个能作证的人还要去找连襟石匠'
  const seed = clipEmotionOutlineSeed('盼', longPan)
  if (!seed.includes('种子') || !seed.includes('禁止展开')) throw new Error('clip pan label')
  const body = seed.replace(/^.*?：/, '')
  if ([...body].length > EMOTION_PAN_SEED_MAX_CHARS + 2) throw new Error('pan seed too long')
  if (seed === `大纲盼场：${longPan}`) throw new Error('must not inject raw long pan')
}

const wSum = EMOTION_BEAT_WEIGHTS.reduce((a, b) => a + b, 0)
if (Math.abs(wSum - 1) > 1e-9) throw new Error(`weights ${wSum}`)

const b = resolveChapterBeatBudgets({
  chapterOutline: outline,
  userTarget: 2000,
  chapterNumber: 1,
})
if (b.beatCount !== 4) throw new Error('budget count')
if (b.items[0]!.phase !== '恨' || b.items[3]!.phase !== '盼') throw new Error('budget phases')

const late = resolveChapterBeatBudgets({
  chapterOutline: outline.replace('第1章', '第9章'),
  userTarget: 2000,
  chapterNumber: 9,
})
if (late.items[0]?.phase === '恨' && late.beatCount === 4 && late.promptBlock.includes('硬绑定')) {
  throw new Error('ch9 must not emotion-bind')
}

console.log('verify-emotion-beats OK', {
  phases: b.items.map(i => i.phase),
  targets: b.items.map(i => i.targetChars),
})
