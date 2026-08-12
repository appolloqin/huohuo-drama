/**
 * 状态卡校验：章内接地 + 邻章缝（结构信号，无场面词表扩张）
 * 失败策略：标 invalid 并重抽卡，不拿错卡硬改正文。
 */
import {
  withStateCardValidation,
  type ChapterStateCard,
  type ChapterStateCardValidationStatus,
} from '../../common/novel/novel-state-card.js'
import { buildStateCardContentWindow } from './novel-state-card-extract.js'
import { classifyPlaceCategory } from './novel-chapter-end-snapshot.js'

export type StateCardValidationIssue = {
  code: string
  message: string
}

export type StateCardValidationResult = {
  ok: boolean
  status: ChapterStateCardValidationStatus
  issues: StateCardValidationIssue[]
}

/** 高频虚义二字（语言通用，非题材） */
const STOP = new Set([
  '一个', '没有', '已经', '自己', '什么', '这个', '那个', '可以', '因为', '所以',
  '然后', '于是', '时候', '地方', '东西', '起来', '下去', '过来', '过去', '不是',
  '就是', '还是', '未明', '明示', '持平',
])

/**
 * 常见姓氏首字（语言结构，跨题材通用；非场面/动作词表）
 * 含单姓；复姓取首字（欧/司/诸/皇…）亦落在集合内。
 */
const SURNAME_HEAD = new Set(
  (
    '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'
    + '戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐'
    + '费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄'
    + '和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁'
    + '杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍'
    + '虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚'
    + '程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓'
    + '牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙'
    + '叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻'
    + '莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温'
    + '别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡'
    + '国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾'
    + '毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公上官欧阳夏侯诸葛'
    + '闻人东方赫连皇甫尉迟公羊澹台公冶宗政濮阳淳于单于太叔申屠公孙仲孙'
    + '轩辕令狐钟离宇文长孙慕容鲜于闾丘司徒司空丌官司寇子车颛孙端木巫马'
    + '公西漆雕乐正壤驷公良拓跋夹谷宰父谷梁晋楚闫法汝鄢涂钦段干百里东郭'
    + '南门呼延归海羊舌微生岳帅缑亢况後有琴梁丘左丘东门西门商牟佘佴伯赏'
    + '南宫墨哈谯笪年爱阳佟萧'
  ).split(''),
)

/** 方位/趋向尾字：与姓氏首字拼成「马上/跟上」类，勿当全名 */
const PLACE_OR_DIR_TAIL = /[上中下里外前后左右东西南北内外旁边头间处]$/

/**
 * 结构判断是否像中文人名全名（无题材动作词表）。
 * - 2～4 汉字；代词边界否；体貌标记否；须姓氏首字；拒绝「姓+方位」伪名
 */
export function looksLikePersonName(s: string): boolean {
  if (s.length < 2 || s.length > 4) return false
  if (!/^[\u4e00-\u9fff]+$/.test(s)) return false
  if (STOP.has(s)) return false
  // 代词边界：「照着他」「她妈」等
  if (/^[他她我你它这那各每]$/.test(s[0]!)) return false
  if (/[他她我你它]$/.test(s)) return false
  // 体貌/可能补语标记：全名几乎不含「着了过得」
  if (/[着了过得]/.test(s)) return false
  if (/地$/.test(s)) return false
  if (!SURNAME_HEAD.has(s[0]!)) return false
  // 「马上」「跟上」：姓氏首字 + 方位
  if (s.length === 2 && PLACE_OR_DIR_TAIL.test(s[1]!)) return false
  return true
}

function compact(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：…—\-~·"'「」『』“”‘’＂＇]/g, '')
}

function contentBigrams(s: string): string[] {
  const t = compact(s)
  const out: string[] = []
  for (let i = 0; i + 2 <= t.length; i++) {
    const bg = t.slice(i, i + 2)
    if (STOP.has(bg)) continue
    out.push(bg)
  }
  return out
}

/** 句首代词省略变体：她低下头 ↔ 苏婉低下头（跨题材结构，非场面词） */
function compactFieldVariants(fc: string): string[] {
  const out = [fc]
  if (/^[他她你我其]$/.test(fc[0] || '')) {
    const rest = fc.slice(1)
    if (rest.length >= 4) out.push(rest)
  }
  return out
}

function groundedCompact(fc: string, hay: string): boolean {
  if (!fc) return true
  if (hay.includes(fc.slice(0, Math.min(6, fc.length)))) return true
  // 长字段：任取若干四字片，命中≥2 即过
  if (fc.length > 16) {
    let hits4 = 0
    for (let i = 0; i + 4 <= fc.length; i += 3) {
      if (hay.includes(fc.slice(i, i + 4))) hits4++
      if (hits4 >= 2) return true
    }
  }
  const grams = contentBigrams(fc)
  if (grams.length < 2) {
    return [...fc].some(ch => /[\u4e00-\u9fff]/.test(ch) && hay.includes(ch))
  }
  const hits = grams.filter(g => hay.includes(g)).length
  const need = fc.length > 16
    ? Math.max(2, Math.ceil(grams.length * 0.1))
    : Math.max(2, Math.ceil(grams.length * 0.28))
  return hits >= need
}

/** 字段是否在正文中有足够锚点（结构重合，非题材词表） */
export function fieldGroundedInText(field: string, haystack: string): boolean {
  const f = (field || '').trim().replace(/^[“”"＇＇]+|[“”"＇＇]+$/g, '')
  if (!f || f === '未明示' || f === '无' || f === '持平') return true
  const hay = compact(haystack)
  if (!hay) return false
  const fc = compact(f)
  if (!fc) return true
  return compactFieldVariants(fc).some(v => groundedCompact(v, hay))
}

/** 抽取像人名的 token；过滤动作碎片 */
export function castNames(cast: string): string[] {
  return cast
    .split(/[、，,/与和\s]+/)
    .map(s => s.trim().replace(/^[“”"＇]+|[“”"＇]+$/g, ''))
    .filter(s => s !== '未明示' && looksLikePersonName(s))
}

/**
 * 章内：卡字段须能在本章正文窗口中接地。
 */
export function validateStateCardAgainstContent(
  card: ChapterStateCard,
  content: string,
): StateCardValidationResult {
  const window = buildStateCardContentWindow(content)
  const full = content.replace(/\s+/g, ' ').trim()
  const tip = full.slice(-1200)
  // 刚发生：用整章正文（短篇可全文；避免中段收束句落在 tip/窗口夹缝外）
  const eventHay = full || tip || window
  const placeHay = `${tip}\n${window}`
  const issues: StateCardValidationIssue[] = []

  if (!fieldGroundedInText(card.progress.last_event, eventHay)) {
    issues.push({
      code: 'last_event_ungrounded',
      message: `刚发生「${card.progress.last_event}」在章末正文中找不到对应锚点`,
    })
  }
  // 地点/场景：用章末+窗口；摘要可佐证
  const placeOk = fieldGroundedInText(card.place, placeHay)
    || fieldGroundedInText(card.scene, placeHay)
    || fieldGroundedInText(card.summary_line || '', placeHay)
  if (!placeOk) {
    issues.push({
      code: 'place_scene_ungrounded',
      message: `地点/场景「${card.place}/${card.scene}」与章末正文不吻合`,
    })
  }
  // cast 抽成动作碎片时：结构过滤后无人名候选 → 跳过（不因抽卡噪声失败）
  const names = castNames(card.cast)
  if (names.length) {
    const blob = compact(window)
    const missing = names.filter(n => !blob.includes(compact(n)))
    if (missing.length === names.length) {
      issues.push({
        code: 'cast_ungrounded',
        message: `人物「${missing.slice(0, 3).join('、')}」未在本章正文窗口出现`,
      })
    }
  }
  if (card.props && card.props !== '未明示' && !fieldGroundedInText(card.props, window)) {
    // 道具软一点：仅当完全无锚点时记一条
    const grams = contentBigrams(card.props)
    const hay = compact(window)
    if (grams.length >= 2 && grams.filter(g => hay.includes(g)).length === 0) {
      issues.push({
        code: 'props_ungrounded',
        message: `道具/衣着「${card.props}」在正文中找不到锚点`,
      })
    }
  }

  const ok = issues.length === 0
  return { ok, status: ok ? 'ok' : 'invalid', issues }
}

const CROSS_DAY_RE = /次日|翌日|第二天|隔日|一夜过|过了一夜|一觉醒|赶回|回到[了家]?|返回[了家]?/

/** 章末已落脚/接人（结构）：勿被同字段里更早的途中摘要盖过 */
const ARRIVAL_END_RE =
  /接人|赶回|回到|归家|回院|回了家|到家|进门|进屋|推门|跨进|进了屋|院门|自家院|屋檐|炕上|门边|门口等候|站在.{0,12}(?:下|旁|边).{0,8}(?:等|接)/

function fieldTailSegments(s: string, n = 2): string {
  const parts = s.split(/[；;。！？\n]+/).map(x => x.trim()).filter(x => x.length >= 2)
  if (parts.length <= n) return s
  return parts.slice(-n).join('；')
}

/** 邻章缝看上章「末场合」：刚发生 + 地点/场景尾段，不用全章旅程表 */
export function prevCardEndLocusBlob(card: ChapterStateCard): string {
  const last = (card.progress?.last_event || '').trim()
  const placeTail = fieldTailSegments(card.place || '')
  const sceneTail = fieldTailSegments(card.scene || '')
  return [last, placeTail, sceneTail].filter(Boolean).join(' ')
}

export function resolvePrevEndPlaceCategory(card: ChapterStateCard): ReturnType<typeof classifyPlaceCategory> {
  const endBlob = prevCardEndLocusBlob(card)
  const endCompact = compact(endBlob)
  if (ARRIVAL_END_RE.test(endCompact)) {
    const endCat = classifyPlaceCategory(endBlob)
    if (endCat === 'enclosed' || endCat === 'threshold') return endCat
    return 'threshold'
  }
  const endCat = classifyPlaceCategory(endBlob)
  if (endCat !== 'unknown') return endCat
  return classifyPlaceCategory(`${card.scene} ${card.place} ${card.progress.last_event}`)
}

/**
 * 邻章缝：上章卡末场合 vs 下章卡/开篇（途中→封闭倒退须有跨日/归来）
 */
export function validateStateCardNeighborSeam(args: {
  prevCard: ChapterStateCard
  nextCard?: ChapterStateCard | null
  nextOpening?: string
}): StateCardValidationResult {
  const { prevCard, nextCard, nextOpening } = args
  const issues: StateCardValidationIssue[] = []
  const prevCat = resolvePrevEndPlaceCategory(prevCard)
  const nextBlob = [
    nextCard?.scene,
    nextCard?.place,
    nextCard?.timeline,
    nextCard?.progress.last_event,
    (nextOpening || '').slice(0, 500),
  ].filter(Boolean).join(' ')
  const nextCat = classifyPlaceCategory(nextBlob)
  const crossDay = CROSS_DAY_RE.test(compact(nextBlob))
  // 同日归家/进门也算合法承接（猎归、下工回屋）
  const returnHome = /赶回|回到|归家|进门|进屋|推门|跨进|进了屋|回院|回了家|扛.{0,8}回/.test(compact(nextBlob))

  if (prevCat === 'away' && (nextCat === 'enclosed' || nextCat === 'threshold') && !crossDay && !returnHome) {
    issues.push({
      code: 'seam_place_rewind',
      message:
        `邻章缝：第${prevCard.chapter_number}章末为途中/离场（${prevCard.place}/${prevCard.scene}），`
        + `第${(nextCard?.chapter_number ?? prevCard.chapter_number + 1)}章却回到封闭/门口且无跨日归来明示`,
    })
  }

  // 下章卡时间线若声称「才开始」类初起，而上一卡场景已含同一过程字根——软记
  if (nextCard?.timeline && /才开始|刚开始|起初/.test(nextCard.timeline)) {
    const prevEnv = compact(`${prevCard.scene}${prevCard.place}${prevCard.progress.last_event}`)
    const roots = ['雪', '雨', '雾', '风', '沙']
    for (const r of roots) {
      if (prevEnv.includes(r) && compact(nextCard.timeline).includes(r)) {
        issues.push({
          code: 'seam_process_onset',
          message: `邻章缝：上章已涉及「${r}」，下章时间线却写「${nextCard.timeline}」（过程初起可疑）`,
        })
        break
      }
    }
  }

  const ok = issues.length === 0
  return { ok, status: ok ? 'ok' : 'invalid', issues }
}

export function applyValidationToCard(
  card: ChapterStateCard,
  result: StateCardValidationResult,
): ChapterStateCard {
  return withStateCardValidation(
    card,
    result.status,
    result.issues.map(i => i.message),
  )
}

/** 合并多路校验 */
export function mergeValidationResults(
  ...parts: StateCardValidationResult[]
): StateCardValidationResult {
  const issues = parts.flatMap(p => p.issues)
  const ok = issues.length === 0
  return { ok, status: ok ? 'ok' : 'invalid', issues }
}
