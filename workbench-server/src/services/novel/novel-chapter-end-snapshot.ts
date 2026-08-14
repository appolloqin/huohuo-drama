/**
 * 章末状态契约：从账本+章末正文派生短快照，供下章开篇注入与对照。
 * 不扩场面词表；时辰粗检复用 chapter-seam 的相位逻辑。
 */
import {
  formatChapterEndSnapshotBlock,
  normalizeChapterEndSnapshot,
  type ChapterEndSnapshot,
  type NovelContinuityFields,
  type NovelContinuityLedger,
} from '../../common/novel/novel-continuity-state.js'
import {
  mergeEpisodeMetadata,
  readEpisodeChapterEndSnapshotMeta,
} from '../../common/drama/episode-meta.js'
import { splitProseAndChangeRecord } from '../../common/novel/novel-change-record.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../../common/http/response.js'
import type { AuditConflict } from './novel-continuity-precheck.js'
import {
  computeSeamStructureVerdict,
  hasSeamBridge,
} from './novel-seam-structure-verdict.js'

export { formatChapterEndSnapshotBlock, normalizeChapterEndSnapshot }
export type { ChapterEndSnapshot }

function truncTail(s: string, n: number): string {
  const t = s.trim()
  if ([...t].length <= n) return t
  return [...t].slice(-n).join('')
}

function firstSentence(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const m = t.match(/^.{8,80}?[。！？]/)
  const one = (m?.[0] || t).trim()
  return [...one].length > max ? `${[...one].slice(0, max).join('')}…` : one
}

/** 章末「刚发生」须取尾句，勿取 truncTail 窗口首句（易把章中高潮当成章末契约） */
function lastSentence(s: string, max = 100): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const parts = t
    .split(/(?<=[。！？])/)
    .map(x => x.trim())
    .filter(x => [...x].length >= 6)
  const one = (parts.length ? parts[parts.length - 1]! : t).trim()
  return [...one].length > max ? `${[...one].slice(0, max).join('')}…` : one
}

function normCompact(s: string): string {
  return s.replace(/\s+/g, '')
}

/** 账本字段若像旅程/人物表倾倒，优先用章末正文猜测（避免污染章缝契约） */
function ledgerFieldBloated(v?: string | null, softMax = 40): boolean {
  const t = (v || '').replace(/\s+/g, ' ').trim()
  if (!t) return true
  if ([...t].length > softMax) return true
  return /→|伏笔|提醒|严禁|；.*;|\/|、.{2,}、.{2,}、/.test(t)
}

/** 从账本 + 章末正文派生快照（无额外 LLM；finalize 时与账本同写） */
export function deriveChapterEndSnapshot(args: {
  chapterNumber: number
  content: string
  ledger?: NovelContinuityFields | null
  contentHash?: string
}): ChapterEndSnapshot | null {
  const { chapterNumber, content, ledger, contentHash } = args
  // 章末契约只看正文，勿把【变更记录】/一致性提醒算进尾部
  let prose = splitProseAndChangeRecord(content).prose || content
  prose = prose.replace(/【[*＊]?一致性提醒[*＊]?】[\s\S]*$/, '').trim() || prose
  const tail = truncTail(prose, 900)
  if ([...tail].length < 40) return null

  const timeFromLedger = clean(ledger?.timeline, 80)
  const placeFromLedger = clean(ledger?.environment, 80)
  const castFromLedger = clean(ledger?.relations, 80)
  const time = (!ledgerFieldBloated(ledger?.timeline) && timeFromLedger)
    || guessTimeLabel(tail)
    || timeFromLedger
    || '未明示'
  const place = (!ledgerFieldBloated(ledger?.environment) && placeFromLedger)
    || guessPlaceLabel(tail)
    || placeFromLedger
    || '未明示'
  const cast = (!ledgerFieldBloated(ledger?.relations, 36) && castFromLedger)
    || guessCastLabel(tail)
    || castFromLedger
    || '未明示'
  const proseLast = lastSentence(tail, 120)
  const actionClean = clean(ledger?.actions, 160)
  // 账本 actions 仅当出现在真正章末附近才采用，避免章中高潮写入契约
  const actionNearEnd = !!(
    actionClean
    && !ledgerFieldBloated(ledger?.actions, 80)
    && normCompact(prose.slice(-560)).includes(normCompact(actionClean).slice(0, 8))
  )
  const last_event = (actionNearEnd && actionClean)
    || proseLast
    || clean(ledger?.delta, 160)
    || firstSentence(tail, 100)
    || '未明示'
  const open_threads = clean(ledger?.foreshadowing, 120)
  const closedList = extractClosedDeliveryBeats(prose)
  const closed_beats = closedList.length
    ? closedList.slice(0, 6).map(p => `交付:${p}`).join('；')
    : undefined

  return normalizeChapterEndSnapshot({
    chapter_number: chapterNumber,
    time,
    place,
    cast,
    last_event,
    open_threads,
    closed_beats,
    updated_at: new Date().toISOString(),
    content_hash: contentHash,
  }, chapterNumber)
}

function clean(v: string | undefined, max: number): string | undefined {
  if (!v?.trim() || v === '无' || v === '持平') return undefined
  const t = v.replace(/\s+/g, ' ').trim()
  return [...t].length > max ? `${[...t].slice(0, max).join('')}…` : t
}

function guessTimeLabel(text: string): string | undefined {
  const cues: { label: string; re: RegExp }[] = [
    { label: '黎明/晨光', re: /晨光|拂晓|黎明|破晓|天没亮|蒙蒙亮/ },
    { label: '清晨', re: /清晨|清早|大清早/ },
    { label: '正午', re: /日头[^。！？\n]{0,16}(正中|中央|当顶)|正午|中午|日上三竿/ },
    { label: '午后', re: /午后|下午|日头西[斜沉]/ },
    { label: '傍晚', re: /黄昏|傍晚|暮色|夕阳/ },
    { label: '夜里', re: /夜里|夜色|月色|掌灯|深夜|半夜|入夜|夜间/ },
  ]
  let best: { label: string; idx: number } | null = null
  for (const c of cues) {
    const m = c.re.exec(text)
    if (!m || m.index == null) continue
    if (!best || m.index >= best.idx) best = { label: c.label, idx: m.index }
  }
  return best?.label
}

/** 无场面词表：仅从章末近句抽一短场景短语供契约展示 */
export function guessPlaceLabel(text: string): string | undefined {
  const tail = text.trim().slice(-240)
  if (/屋里|屋内|房间里|灶房|茅屋/.test(tail)) return '屋里'
  const m = tail.match(/在([\u4e00-\u9fff]{2,8})(?:里|上|中|旁|边)/)
    || tail.match(/([\u4e00-\u9fff]{2,6})(?:路口|门外|门口|道上)/)
  return m?.[1] ? `${m[1]}一带` : undefined
}

function guessCastLabel(text: string): string | undefined {
  const names = text.match(/[\u4e00-\u9fff]{2,3}(?=连|却|把|将|从|在|蹲|趴|说|道|盯|退)/g)
  if (!names?.length) return undefined
  const stop = new Set([
    '耳朵', '眼睛', '嘴巴', '鼻子', '手指', '手心', '掌心', '胸口',
    '自己', '什么', '这个', '那个', '东西', '么东', '好是', '一声',
    '手里', '怀里', '眼前', '心里', '脸上', '身上', '门口', '屋里',
  ])
  const uniq = [...new Set(names)].filter(n => !stop.has(n)).slice(0, 3)
  return uniq.length ? uniq.join('、') : undefined
}

/** 交付/呈递类动作（结构信号，非场面剧本） */
const DELIVERY_ACTION_RE = /掏出|摸出|拿出|捧出|递过|递给|塞给|塞回|掰成|掰开|省下来|端给|解开.{0,10}露出|从怀里/

const DELIVERY_PROP_STOP = new Set([
  '自己', '什么', '这个', '那个', '他们', '她们', '我们', '东西', '一声', '一下',
  '手里', '怀里', '眼前', '心里', '脸上', '身上', '门口', '屋里', '炕上', '一半', '那边',
  '秦卫', '苏婉', '卫国', // 常见人名碎片；完整名由 cast 再滤
])

/**
 * 从正文抽取「已闭合交付」物件名（供章末契约 / 下章禁演）。
 * 信号：交付动词句中的 2～4 字物件，不绑糠饼等专名。
 */
export function extractClosedDeliveryBeats(content: string): string[] {
  if (!content?.trim() || [...content].length < 40) return []
  const sentences = content.split(/(?<=[。！？\n])/).map(s => s.trim()).filter(Boolean)
  const found: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    let prop = raw.replace(/^(那|这|半|块|个|只|条|点)/, '').trim()
    if ([...prop].length < 2) prop = raw
    if ([...prop].length < 2 || [...prop].length > 4) return
    if (DELIVERY_PROP_STOP.has(prop)) return
    // 拒「她手里 / 大的一半」等身体部位或计量碎片
    if (/(手里|怀里|身上|脸上|一半|那边)$/.test(prop)) return
    if (prop.includes('的') && [...prop].length > 3) return
    if (seen.has(prop)) return
    seen.add(prop)
    found.push(prop)
  }
  for (const s of sentences) {
    if (!DELIVERY_ACTION_RE.test(s)) continue
    const afterVerb = s.match(/(?:掏出|摸出|拿出|捧出|递过|递给|塞给|塞回|端给|露出)([^。！？]{2,28})/)
    if (afterVerb?.[1]) {
      const chunk = afterVerb[1]
      const afterDe = chunk.match(/的([\u4e00-\u9fff]{2,4})/)
      if (afterDe) push(afterDe[1]!)
      else {
        const tail = chunk.match(/([\u4e00-\u9fff]{2,4})[，。！？、；：\s]*$/)
        if (tail) push(tail[1]!)
      }
    }
    const half = s.matchAll(/半块([\u4e00-\u9fff]{2,4})/g)
    for (const m of half) push(m[1]!)
    const objVerb = s.matchAll(/([\u4e00-\u9fff]{2,4})(?:递给|递过|塞给|塞回|掰成|掰开)/g)
    for (const m of objVerb) push(m[1]!)
    if (found.length >= 8) break
  }
  return found
}

export function parseClosedBeatProps(closedBeats?: string | null): string[] {
  if (!closedBeats?.trim()) return []
  const out: string[] = []
  for (const part of closedBeats.split(/[；;、|/]/)) {
    const t = part.replace(/^交付[:：]?/, '').trim()
    if ([...t].length >= 2 && [...t].length <= 6) out.push(t)
  }
  return out
}

/** 与章缝时辰粗检同源（避免 import seam 循环依赖） */
const DELIVERY_DAY_PHASE_CUES: { phase: number; label: string; re: RegExp }[] = [
  { phase: 0, label: '黎明/晨光', re: /晨光|拂晓|黎明|破晓|天没亮|天尚未亮|蒙蒙亮|东方刚[白亮]/ },
  { phase: 1, label: '清晨', re: /清晨|清早|大清早|一大早|早上(?!午)/ },
  { phase: 2, label: '正午', re: /日头[^。！？\n]{0,16}(正中|中央|当顶)|正午|中午|日上三竿/ },
  { phase: 3, label: '午后', re: /午后|下午|日头西[斜沉]/ },
  { phase: 4, label: '傍晚', re: /黄昏|傍晚|暮色|夕阳|擦黑|日头坠/ },
  { phase: 5, label: '夜里', re: /夜里|夜色|月色|掌灯|深夜|黑灯瞎火|夜深|半夜|入夜|夜间/ },
]

/** 跨日明示 + 场合话术（结构词；勿含又掏/又拿等交付动词本身） */
const DELIVERY_OCCASION_JUMP_RE =
  /次日|翌日|第二天|隔日|数日|几天|过了几天|过了几日|隔了几天|一夜过|过了一夜|一觉醒|睡到天亮|天又亮|第二日|隔夜|天亮(?:了|以后)?|换(?:了)?地方|另一次|又一次|再一次|后来|过了一会儿|过了片刻|片刻后|不久后|随后到了/

function findDeliveryDayPhases(text: string): { phase: number; label: string }[] {
  const hits: { phase: number; label: string }[] = []
  for (const cue of DELIVERY_DAY_PHASE_CUES) {
    if (cue.re.test(text)) hits.push({ phase: cue.phase, label: cue.label })
  }
  return hits
}

export function normalizePlaceKey(place?: string | null): string {
  const t = (place || '').replace(/\s+/g, '').trim()
  if (!t || t === '未明示') return ''
  if (/屋里|屋内|房间|灶房|茅屋|炕上/.test(t)) return '室内'
  if (/门外|门口|院|路口|道上|路上|外头|村口/.test(t)) return '室外'
  return t.slice(0, 6)
}

/**
 * 开篇是否已有章缝过渡（跨日/离场/位移/补叙框）。
 * 与章缝结构卡 `hasSeamBridge` 同源（避免双标准）。
 */
export function openingHasSeamBridge(content: string, maxChars = 1200): boolean {
  return hasSeamBridge(content, maxChars)
}

/**
 * 章缝场合跳切（通用）：读结构卡 place_continuity===jump。
 * 不绑来客/自家/题材场面；本地硬审用，不依赖上章原文进模型。
 */
export function detectSeamPlaceJump(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
  chapterOutline?: string
}): AuditConflict | null {
  const v = computeSeamStructureVerdict(args)
  if (!v || v.place_continuity !== 'jump') return null
  return {
    layer: 'hard',
    rule: 'chapter_seam_place_jump',
    message:
      `章缝场合跳切：上章末场合「${v.prev_place}」与本章开篇场合「${v.open_place}」不一致，且开篇窗口内无离场/位移/跨日/补叙等过渡交代。`
      + '请先承接上章末场合并写明过渡，再进入新场合；禁止无交代跳切。',
  }
}

/**
 * 章首→命中句窗口相对上章末是否已换场合（有一即放行再交付）。
 */
export function hasDeliveryOccasionJump(args: {
  windowText: string
  prevChapterBody?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): boolean {
  const window = args.windowText.trim()
  if (!window) return false
  if (DELIVERY_OCCASION_JUMP_RE.test(window)) return true

  const prevRef = [
    args.prevSnapshot?.time || '',
    truncTail(args.prevChapterBody || '', 900),
  ].join('\n')
  const prevPhases = findDeliveryDayPhases(prevRef)
  const curPhases = findDeliveryDayPhases(window)
  if (prevPhases.length && curPhases.length) {
    const prevLate = prevPhases.reduce((a, b) => (b.phase > a.phase ? b : a))
    const curLate = curPhases.reduce((a, b) => (b.phase > a.phase ? b : a))
    const curEarly = curPhases.reduce((a, b) => (b.phase < a.phase ? b : a))
    if (curLate.phase > prevLate.phase) return true
    // 夜→晨：次日正向
    if (prevLate.phase >= 5 && curEarly.phase <= 1) return true
  }

  const prevPlace = normalizePlaceKey(
    args.prevSnapshot?.place || guessPlaceLabel(truncTail(args.prevChapterBody || '', 400)),
  )
  const curPlace = normalizePlaceKey(guessPlaceLabel(window) || args.prevSnapshot?.place)
  if (prevPlace && curPlace && prevPlace !== curPlace) return true

  return false
}

/**
 * 同场合「交付重演」硬检（一饼两吃）。
 * 回忆不拦；换日/换场/场合话术后的再交付不拦。
 */
export function detectChapterBodyEventReplay(args: {
  content: string
  chapterNumber: number
  prevChapterBody?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterBody, prevSnapshot } = args
  if (chapterNumber < 2) return null
  const body = content.trim()
  if ([...body].length < 80) return null

  const fromSnap = parseClosedBeatProps(prevSnapshot?.closed_beats)
  const fromPrev = extractClosedDeliveryBeats(prevChapterBody || '')
  const props = [...new Set([...fromSnap, ...fromPrev])].slice(0, 10)
  if (!props.length) return null

  const sentences = body.split(/(?<=[。！？\n])/).map(s => s.trim()).filter(s => s.length >= 8)
  let prefix = ''
  for (const s of sentences) {
    prefix = prefix ? `${prefix}${s}` : s
    for (const prop of props) {
      if (!s.includes(prop)) continue
      // 回忆/旁述：前世/想起/记得 + 物件，无交付动词 → 放行
      if (/前世|想起|记得|那时候|曾经/.test(s) && !DELIVERY_ACTION_RE.test(s)) continue
      // 残余食用/提及（渣子、咽下剩的）不算重新交付
      if (/(渣子|剩的|牙缝|咽下|咽了|嚼着)/.test(s) && !/(掏出|摸出|拿出|递给|塞给|掰开|掰成)/.test(s)) continue
      if (!DELIVERY_ACTION_RE.test(s)) continue
      // 须同句出现真正交付动词，避免摸刀等误伤
      if (!/(掏出|摸出|拿出|捧出|递给|递过|塞给|塞回|掰开|掰成|端给)/.test(s)) continue
      if (hasDeliveryOccasionJump({
        windowText: prefix,
        prevChapterBody,
        prevSnapshot,
      })) continue
      return {
        layer: 'rule',
        rule: 'chapter_seam_replay',
        message:
          `章缝情节重演：上章已闭合的交付「${prop}」，本章在同一时间/场地场合再次写出掏出/递给/掰开等交付动作（同场合一物两吃）。`
          + '请删除该重演，或先写明换日/换场/另一次再写新交付；可一句带过回忆。',
      }
    }
  }
  return null
}

export function readEpisodeChapterEndSnapshot(
  raw: string | null | undefined,
  chapterNumber: number,
): ChapterEndSnapshot | null {
  return readEpisodeChapterEndSnapshotMeta(raw, chapterNumber)
}

export async function loadPrevChapterEndSnapshot(
  dramaId: number,
  beforeChapter: number,
): Promise<ChapterEndSnapshot | null> {
  if (beforeChapter < 2) return null
  const prevNum = beforeChapter - 1
  if (prevNum < 1) return null
  const ep = await episodesRepo.findEpisodeByDramaAndNumber(dramaId, prevNum)
  if (!ep) return null
  const stored = readEpisodeChapterEndSnapshot(ep.metadata, ep.episodeNumber)

  const { resolveNovelEpisodeStoryProse } = await import('./novel-chapter-prose.js')
  const prose = resolveNovelEpisodeStoryProse(ep)
  if (!prose) return stored

  const { hashNovelContent } = await import('../ai/ai-text-detection.js')
  const hash = hashNovelContent(prose)
  const eventOk = snapshotLastEventAlignedWithProse(stored, prose)
  if (stored?.content_hash && stored.content_hash === hash && eventOk) return stored

  // hash 不一致，或 last_event 不在当前正文尾（常见：账本 actions 污染）→ 仅按正文重算
  const fresh = deriveChapterEndSnapshot({
    chapterNumber: ep.episodeNumber,
    content: prose,
    contentHash: hash,
  })
  if (fresh) {
    try {
      await persistChapterEndSnapshot({ episodeId: ep.id, snapshot: fresh })
    } catch {
      // 读路径尽力刷新；写失败仍返回 fresh 供本轮章缝使用
    }
    return fresh
  }
  return stored
}

/** last_event 须能在真正章末附近找到痕迹；否则视为过期契约 */
function snapshotLastEventAlignedWithProse(
  snap: ChapterEndSnapshot | null | undefined,
  prose: string,
): boolean {
  const last = snap?.last_event?.trim()
  if (!last || last === '未明示') return true
  const norm = (s: string) => s.replace(/\s+/g, '')
  const tip = norm(prose.slice(-560))
  const key = norm(last).slice(0, 16)
  if (key.length < 6) return true
  if (tip.includes(key)) return true
  for (let w = Math.min(12, key.length); w >= 6; w--) {
    if (tip.includes(key.slice(0, w))) return true
  }
  return false
}

export async function persistChapterEndSnapshot(args: {
  episodeId: number
  snapshot: ChapterEndSnapshot
}): Promise<void> {
  const ep = await episodesRepo.findEpisodeById(args.episodeId)
  if (!ep) return
  const metadata = mergeEpisodeMetadata(ep.metadata, { chapter_end_snapshot: args.snapshot })
  await episodesRepo.updateEpisode(args.episodeId, { metadata, updatedAt: now() })
}

function contentBigrams(s: string): string[] {
  const t = s.replace(/\s+/g, '').replace(/[，。！？、；：…—\-~·"'「」『』“”']/g, '')
  const out: string[] = []
  for (let i = 0; i + 2 <= t.length; i++) out.push(t.slice(i, i + 2))
  return out
}

/**
 * 开篇对照上章末契约：地点/刚发生均未承接 → 疑似换场重开（题材无关，不扫炕/林词表）。
 * （时辰倒退由 chapter-seam 用 snapshot.time + 上章末正文拼接后检测，避免循环依赖）
 */
export function detectOpeningAgainstChapterEndSnapshot(args: {
  content: string
  chapterNumber: number
  prevSnapshot?: ChapterEndSnapshot | null
}): AuditConflict | null {
  const { content, chapterNumber, prevSnapshot } = args
  if (chapterNumber < 2 || !prevSnapshot) return null

  const snap = prevSnapshot
  const opening = content.trim().slice(0, Math.min(content.trim().length, 500))
  if ([...opening].length < 40) return null

  const place = snap.place?.trim()
  const last = snap.last_event?.trim()
  if ((!place || place === '未明示') && (!last || last === '未明示')) return null

  const openNorm = opening.replace(/\s+/g, '')
  const placeGrams = place && place !== '未明示' ? contentBigrams(place) : []
  const eventGrams = last && last !== '未明示' ? contentBigrams(last) : []
  const placeHits = placeGrams.filter(g => openNorm.includes(g)).length
  const eventHits = eventGrams.filter(g => openNorm.includes(g)).length
  const placeMiss = placeGrams.length >= 2 && placeHits === 0
  const eventMiss = eventGrams.length >= 3 && eventHits < Math.max(1, Math.ceil(eventGrams.length * 0.15))

  // 地点与刚发生都接不上 → 开篇未承接契约（换场/重开）
  if (placeMiss && eventMiss) {
    return {
      layer: 'hard',
      rule: 'chapter_seam_replay',
      message:
        `章缝冷开篇（地点/经过倒退）：上章末契约为地点「${place}」、刚发生「${last}」，`
        + '本章开篇均未承接。请紧接上章末场景与已发生事实之后起笔，禁止换场重开。',
    }
  }

  return null
}

/**
 * 章缝「在场状态」通用硬检（题材无关）：
 * A. 上章末已稳定共处 → 开篇又写抵达/进门/归来
 * B. 上章末已共处且无离场 → 开篇声称在外过夜/外出一宿
 *
 * 不靠猎场词表；共处/离场/抵达用结构信号。离场后再「幽灵在场」误伤面大，暂不自动硬拦。
 */

/** 开篇：抵达/进门/归来（进入已占据空间） */
const OPENING_ARRIVAL_RE = new RegExp([
  '推门进来', '推门而入', '推开门进来', '推门进了', '进门来了', '推门进屋',
  '推开门进', '推门进入', '走了进来', '走进来了', '进了屋', '进了门',
  '跨进门', '跨进门槛', '回到家', '赶回了家', '赶回家', '赶回来',
  '从外头.{0,8}进来', '从外面.{0,8}进来', '从门外.{0,6}进来',
  '回来了', '归来时', '返回(?:家|屋|房)',
].join('|'))

/** 开篇：声称外出过夜/一宿（需上章先有离场） */
const OPENING_ABSENCE_CLAIM_RE = /进山一宿|在外过[夜宿]|外头过[夜宿]|出去了一[夜宿整]|山里过[夜宿]|一夜没回|在外过了一[夜宿]/

/** 场合类别：封闭内 / 出入口 / 已在途外（题材无关，不绑林场茅屋等专名） */
export type PlaceCategory = 'enclosed' | 'threshold' | 'away' | 'unknown'

/**
 * 从短文本判场合类别。优先出入口，再封闭内，再途外。
 * 用位类词（门/屋/路/外）而非具体地名。
 */
export function classifyPlaceCategory(text?: string | null): PlaceCategory {
  const t = (text || '').replace(/\s+/g, '')
  if (!t) return 'unknown'
  if (/门槛|门口|门外|门边|门框|城门|营门|舱门|店门|楼道口|房门|屋门|家门/.test(t)) return 'threshold'
  if (/屋里|屋内|室内|房里|厅里|殿内|舱内|帐内|店内|炕上|灶旁|房内/.test(t)) return 'enclosed'
  if (/外头|室外|路上|道上|途中|城外|营外|野外|阵前|雪地|坡上|深处|巷|街/.test(t)) return 'away'
  // 开放地貌二字（林/山/河等）仅作途外弱信号，须与位移或「外/上/里」同位才强化——此处出现即途外
  if (/(?:林|山|河|海|野|漠|原|坡)(?:子|里|上|中|外|下|头)?/.test(t)) return 'away'
  const key = normalizePlaceKey(t)
  if (key === '室内') return 'enclosed'
  if (key === '室外') return 'away'
  return 'unknown'
}

/** 外向位移（离开封闭场合）；不绑进山/打猎 */
const OUTBOUND_MOTION_RE =
  /离开|出去|走了|迈出|动身|启程|没入|深入|往前|一步步往|不再回头|头也不回|走远|远去|走向|走进|走入|往.{0,12}(?:走|去)|辨认着前方|人影没入/

/** 开篇前段是否落在封闭内/出入口（只看头段，避免后文入林掩盖倒退） */
function openingEarlyHomeLocus(opening: string): boolean {
  const head = opening.replace(/\s+/g, '').slice(0, 420)
  if ([...head].length < 10) return false
  const cat = classifyPlaceCategory(head)
  if (cat === 'enclosed' || cat === 'threshold') return true
  return /门槛|门口|门框|门边|房门|屋门|家门|屋里|屋内|室内|房里|厅里|帐内|舱内|炕上|回屋|转身回屋/.test(head)
}

/** 开篇「从封闭/出入口再出发」：场合在内或门口 + 外向离场/封门/取物再上路 */
function openingStagesExitRitual(opening: string): boolean {
  const h = opening.replace(/\s+/g, '').slice(0, 1200)
  if ([...h].length < 12) return false
  const locus =
    openingEarlyHomeLocus(opening)
    || classifyPlaceCategory(h) === 'enclosed'
    || classifyPlaceCategory(h) === 'threshold'
    || /门槛|门口|门框|门边|房门|屋门|家门|屋里|屋内|室内|房里|厅里|帐内|舱内|炕上/.test(h)
  const sealOrLeave =
    /门.{0,8}(?:合|关|带上|锁|插)|(?:合|关|带上|锁|插).{0,6}门|推门|推开.{0,8}门|出了门|迈步出门|出门去|出门了|离开|出去|动身|启程|迈出|走了出去|去一趟/.test(h)
  // 无「出门」字样：门口/回屋取物后「往林/山走」「进山」等同重演出发
  const gearThenOutbound =
    /(?:回屋|屋里|捡了|揣怀|塞进|披上|带上).{0,40}(?:往|向).{0,10}(?:林|山|坡|外).{0,6}(?:走|去)|进山|进林|去山里|去林子|沿着屋后/.test(h)
  return locus && (sealOrLeave || gearThenOutbound)
}

function tipLooksDeparted(tip: string): boolean {
  const t = tip.replace(/\s+/g, '')
  if (!t) return false
  const cat = classifyPlaceCategory(t)
  if (cat === 'away' && OUTBOUND_MOTION_RE.test(t)) return true
  // 明确外向离开，且尾尖不像仍困在封闭内
  if (OUTBOUND_MOTION_RE.test(t) && cat !== 'enclosed') return true
  if (/不再回头|头也不回|走了出去|离开了这|出去一趟|迈出|动身|启程/.test(t)) return true
  return false
}

/** 上章末：稳定共处/对坐/同场收束 */
const PREV_COPRESENCE_RE = /坐在.{0,10}对面|对面坐着|坐在她对面|坐在他对面|坐在.{0,6}跟前|屋里只有|在屋里|同屋|并肩坐|并排坐|守在旁边|坐在灶|坐在炕/

function castLooksMulti(cast?: string): boolean {
  if (!cast?.trim() || cast === '未明示') return false
  return /[、，,/与和]|[\u4e00-\u9fff]{2,}.*[\u4e00-\u9fff]{2,}/.test(cast)
}

function placeLooksEnclosed(place?: string): boolean {
  if (!place?.trim() || place === '未明示') return false
  return classifyPlaceCategory(place) === 'enclosed' || /屋|炕|灶|房|屋内|室内|屋里/.test(place)
}

/** 上章末最后一段是否已写离场/在途（优先看尾部，避免章中离场又返回后的误判） */
export function prevEndsWithDeparture(prevChapterTail?: string): boolean {
  const tip = (prevChapterTail || '').trim().slice(-320)
  return tipLooksDeparted(tip)
}

/**
 * 上章末是否已呈「稳定共处」收束（结构信号）。
 * @deprecated 名称保留；语义已扩展为共处，不限于室内用词
 */
export function prevImpliesIndoorCopresence(
  prevChapterTail?: string,
  prevSnapshot?: ChapterEndSnapshot | null,
): boolean {
  return prevImpliesStableCopresence(prevChapterTail, prevSnapshot)
}

export function prevImpliesStableCopresence(
  prevChapterTail?: string,
  prevSnapshot?: ChapterEndSnapshot | null,
): boolean {
  if (prevEndsWithDeparture(prevChapterTail)) return false
  const blob = [
    (prevChapterTail || '').trim().slice(-900),
    prevSnapshot?.place || '',
    prevSnapshot?.last_event || '',
    prevSnapshot?.cast || '',
  ].join('\n')
  if (!blob.trim()) return false
  if (PREV_COPRESENCE_RE.test(blob)) return true
  // 契约：封闭场所 + 多人在场 + 刚发生不像离场
  const last = prevSnapshot?.last_event || ''
  if (placeLooksEnclosed(prevSnapshot?.place) && castLooksMulti(prevSnapshot?.cast)) {
    if (!tipLooksDeparted(last) && !tipLooksDeparted((prevChapterTail || '').slice(-200))) return true
  }
  return false
}

function snapHint(prevSnapshot?: ChapterEndSnapshot | null): string {
  const last = prevSnapshot?.last_event?.trim()
  const place = prevSnapshot?.place?.trim()
  return [place && place !== '未明示' ? `地点「${place}」` : '', last && last !== '未明示' ? `刚发生「${last}」` : '']
    .filter(Boolean)
    .join('、')
}

/**
 * 在场状态吃书（通用）：共处后再抵达 / 共处后声称外宿 / 已在途又重演「从封闭场合出发」。
 */
export function detectChapterSeamPresenceReentry(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterTail, prevSnapshot } = args
  if (chapterNumber < 2) return null
  if (!prevChapterTail?.trim() && !prevSnapshot) return null

  const opening = content.trim().slice(0, Math.min(content.trim().length, 1100))
  // 开篇抵达句可能很短；过严会漏「推门进来」类硬伤
  if ([...opening].length < 16) return null

  const hint = snapHint(prevSnapshot)
  const tip = (prevChapterTail || '').trim().slice(-320)
  const prevPlaceCat = (() => {
    for (const t of [prevSnapshot?.place, tip, prevSnapshot?.last_event]) {
      const c = classifyPlaceCategory(t)
      if (c !== 'unknown') return c
    }
    return 'unknown' as PlaceCategory
  })()
  const copresent = prevImpliesStableCopresence(prevChapterTail, prevSnapshot)
  const departed = prevEndsWithDeparture(prevChapterTail) || prevPlaceCat === 'away'
  // 已在途却开篇落回门内/门口：须有跨日/归来明示才放行（避免「门口看天再出发」漏检）
  const homeRewindExempt =
    /次日|翌日|第二天|隔日|数日|几天|过了几天|过了几日|隔了几天|一夜过|过了一夜|一觉醒|赶回[了家]?|回到[了家]?|返回[了家]?|昨[晚夜].{0,6}回/.test(
      opening.replace(/\s+/g, '').slice(0, 500),
    )

  // C) 上章末已在途/离场 → 开篇又搭「封闭内/出入口 + 外向出发」骨架（高置信才硬拦；仅落门口不硬拦以免误杀跨日回家）
  if (departed && openingStagesExitRitual(opening) && !homeRewindExempt) {
    return {
      layer: 'hard',
      rule: 'chapter_seam_replay',
      message:
        `章缝离场吃书：上章末主角已离场/在途${hint ? `（${hint}）` : ''}，`
        + '本章开篇又从封闭场合/出入口重演出发。请从上章末已在途状态之后承接；禁止倒退重写出门戏。',
    }
  }

  // A) 已共处 → 开篇又抵达/进门/归来
  if (copresent && OPENING_ARRIVAL_RE.test(opening)) {
    return {
      layer: 'hard',
      rule: 'chapter_seam_replay',
      message:
        `章缝在场吃书：上章末人物已在场共处${hint ? `（${hint}）` : ''}，`
        + '本章开篇又写进门/归来/抵达。请从上章末已在场状态之后承接，或先写离场/隔夜外出再写归来；禁止未离场再进场。',
    }
  }

  // B) 已共处且无离场 → 开篇声称在外过夜/一宿
  if (copresent && !departed && OPENING_ABSENCE_CLAIM_RE.test(opening)) {
    return {
      layer: 'hard',
      rule: 'chapter_seam_replay',
      message:
        `章缝在场吃书：上章末人物仍在场共处${hint ? `（${hint}）` : ''}，`
        + '本章开篇却声称在外过夜/外出一宿。请先承接离场或改写时间跨度，禁止凭空隔夜外出。',
    }
  }

  return null
}

/** 虚词/高频无信息二字组：不算动作重合 */
const SEAM_STOP_BIGRAMS = new Set([
  '一个', '没有', '已经', '自己', '什么', '这个', '那个', '我们', '他们', '她们',
  '可以', '因为', '所以', '然后', '于是', '时候', '地方', '东西', '起来', '下去',
  '过来', '过去', '一点', '一些', '不是', '就是', '还是', '什么',
])

function seamContentBigrams(text: string): string[] {
  const t = text.replace(/\s/g, '').replace(/[，。！？、；：…—\-~·"'「」『』“”'0-9a-zA-Z]/g, '')
  const out: string[] = []
  for (let i = 0; i + 2 <= t.length; i++) {
    const bg = t.slice(i, i + 2)
    if (SEAM_STOP_BIGRAMS.has(bg)) continue
    out.push(bg)
  }
  return out
}

function lastSentencesBlob(text: string, n: number): string {
  const parts = text.replace(/\s+/g, ' ').split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean)
  return parts.slice(-n).join('')
}

/** 结构：新冲突/他者起势（敲/叫/来人/推闯），非场面词表 */
function hasNewBeatIntroCue(text: string): boolean {
  return /敲|叫门|拍门|来人|门外有人|有人来|推门|闯进|破门|有人喊|来人喊/.test(text)
}

/** 结构：开篇在与「门外/外头他者」互动（空间+声迹），却可能未点名 */
function hasExternalAgentCue(text: string): boolean {
  return /门外|外头|门缝/.test(text) && /脚步|声音|人影|远下去|远去|贴着门/.test(text)
}

function namesFromCastAndTip(cast?: string, tip?: string): Set<string> {
  const set = new Set<string>()
  for (const part of (cast || '').split(/[、，,/与和\s]+/)) {
    const t = part.trim()
    if (t.length >= 2 && t.length <= 4 && t !== '未明示') set.add(t)
  }
  const blob = tip || ''
  const re = /([\u4e00-\u9fff]{2,3})(?=把|将|说|道|问|走|坐|听|看|站|应|回)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(blob)) !== null) {
    if (!SEAM_STOP_BIGRAMS.has(m[1]!)) set.add(m[1]!)
  }
  return set
}

/** 开篇「动词前二字/三字」易误当成新人名的场所/虚指/介词结构 */
const OPENING_NAME_FALSE_POS = new Set([
  '炕角', '门外', '外头', '门缝', '原地', '在原地', '在炕角', '灶边', '炕沿', '屋里', '窗外',
  '一声', '一句', '一下', '什么', '怎么', '那个', '这个', '有人', '来人',
])

function openingHasNewNamedActor(head: string, known: Set<string>): boolean {
  if (/来人|那人|门外那/.test(head)) return true
  const re = /([\u4e00-\u9fff]{2,3})(?=说|道|问|笑|喊|叫|站|推|闯|敲|应)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(head)) !== null) {
    const n = m[1]!
    if (known.has(n) || OPENING_NAME_FALSE_POS.has(n)) continue
    // 「在××站/问」类介词结构，不是人名
    if (/^[在从向往对跟和与]/.test(n)) continue
    if (n.length < 2) continue
    return true
  }
  return false
}

/**
 * C) 完成态动作被「重新/又/再」重做：用上章末句与开篇重做小句的二字组重合判定（不绑门闩等词）。
 */
function detectCompletedActionReplay(
  prevTip: string,
  lastEvent: string,
  opening: string,
): AuditConflict | null {
  const endBlob = `${lastSentencesBlob(prevTip, 3)}\n${lastEvent || ''}`.trim()
  if ([...endBlob].length < 16) return null
  // 上章末须有完成态收束
  if (!/[了死好妥]/.test(endBlob.slice(-100))) return null
  const endGrams = new Set(seamContentBigrams(endBlob))
  if (endGrams.size < 4) return null

  const head = opening.slice(0, 600)
  // 只认明确重做：重新 / 又把|再把|又将|再将。勿用裸「又/再」（「再无其他」「又是」误杀）
  const redoRe = /[^。！？\n]{0,16}(?:重新|又把|再把|又将|再将)[^。！？\n]{4,48}/g
  let m: RegExpExecArray | null
  while ((m = redoRe.exec(head)) !== null) {
    const clause = m[0]
    // 叙述否定/惯用，不是动作重做
    if (/再[无也不没]|又不|又是|又在|再次出现/.test(clause)) continue
    const hits = seamContentBigrams(clause).filter(g => endGrams.has(g)).length
    if (hits >= 2) {
      return {
        layer: 'hard',
        rule: 'chapter_seam_replay',
        message:
          '章缝动作吃书：上章末已完成的收束动作，本章开篇用「重新/又把/再把」等重做同一收束。'
          + '请承接完成态之后的新信息；叙事可用顺叙或先果后因，但禁止重做已完成收束。',
      }
    }
  }
  return null
}

/** 开篇「补清起势/来者」窗口：约前 900 字（短章看全文） */
function seamOpeningResolveWindow(opening: string): string {
  const chars = [...opening.trim()]
  if (!chars.length) return ''
  return chars.slice(0, Math.min(900, chars.length)).join('')
}

function openingResolvesExternalAgent(
  window: string,
  cast: string | undefined,
  tip: string,
): boolean {
  // 后置起势/点名即可（先果后因、倒叙补叙）；不要求第一段就敲门
  if (hasNewBeatIntroCue(window)) return true
  const known = namesFromCastAndTip(cast, tip)
  return openingHasNewNamedActor(window, known)
}

/**
 * D) 开篇进入「与外部他者互动」却始终未引入来者/起势（没头没尾）。
 * 允许先果后因：窗口内后置起势或倒叙补叙即可，不要求第一段就敲门。
 */
function detectOrphanExternalBeat(
  prevTip: string,
  cast: string | undefined,
  opening: string,
): AuditConflict | null {
  const tip = prevTip.slice(-420)
  // 上章末已有他者起势 → 开篇续写合法
  if (hasNewBeatIntroCue(tip) || hasExternalAgentCue(tip)) return null

  const window = seamOpeningResolveWindow(opening)
  if (!hasExternalAgentCue(window)) return null
  if (openingResolvesExternalAgent(window, cast, tip)) return null

  return {
    layer: 'hard',
    rule: 'chapter_seam_replay',
    message:
      '章缝叙事跳切：上章末无外来冲突，本章开篇窗口内却在与未点名的外部他者互动，且未补清起势/来者（顺叙或先果后因均可，但须交代）。'
      + '请在开篇内写清新冲突起势与来者；禁止整段没头没尾半路接戏。',
  }
}

/**
 * 章缝状态跳切（通用，不绑场面词表）：
 * C) 完成态收束被「重新/又/再」重做
 * D) 开篇与未出场他者半路互动
 *
 * @deprecated 名称保留；请优先理解语义为状态跳切
 */
export function detectChapterSeamQuietCloseJump(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): AuditConflict | null {
  return detectChapterSeamStateJump(args)
}

export function detectChapterSeamStateJump(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterTail, prevSnapshot } = args
  if (chapterNumber < 2) return null
  const tip = (prevChapterTail || '').trim().slice(-560)
  if (!tip && !prevSnapshot?.last_event) return null

  const opening = content.trim().slice(0, Math.min(content.trim().length, 900))
  if ([...opening].length < 24) return null

  const head = opening.slice(0, Math.min(opening.length, 520))
  // 开篇已有新冲突起势 → 允许随后再收束，不报 C
  const introOk = hasNewBeatIntroCue(head)

  if (!introOk) {
    const replay = detectCompletedActionReplay(tip, prevSnapshot?.last_event || '', opening)
    if (replay) return replay
  }

  const orphan = detectOrphanExternalBeat(tip, prevSnapshot?.cast, opening)
  if (orphan) return orphan

  return null
}

/** 供时辰检测：把契约时间拼进上章末文本 */
export function prevTailWithSnapshotTime(
  prevChapterTail?: string,
  prevSnapshot?: ChapterEndSnapshot | null,
): string {
  return [prevSnapshot?.time ? `时间：${prevSnapshot.time}` : '', prevChapterTail || '']
    .filter(Boolean)
    .join('\n')
}

export function buildSnapshotFromLedger(
  ledger: NovelContinuityLedger,
  content: string,
): ChapterEndSnapshot | null {
  return deriveChapterEndSnapshot({
    chapterNumber: ledger.chapter_number,
    content,
    ledger,
    contentHash: ledger.content_hash,
  })
}
