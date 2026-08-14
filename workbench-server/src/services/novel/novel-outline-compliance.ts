/**
 * 大纲/写作说明落实（题材无关）：
 * 规则只做机械项：拍点覆盖、末拍越界、下章泄漏、旧稿孤儿回灌等。
 * 章缝叙事/因果自洽（时辰、倒叙、先果后因、离场重开等）不走规则，见模型审
 * `auditOutlineBoundaryWithModel`（outline-compliance-fix 内合并）。
 */
import {
  detectForwardSeamCopyLexical,
  extractOutlineBeatPhrases,
  extractOutlineBeatItems,
  extractOutlineCatalystPhrases,
  extractOutlineBoundaryLastBeat,
  findStaleOutlineBeats,
  isSuspenseHookBeat,
} from './novel-chapter-seam.js'
import { detectBriefPendingStateOvershoot } from './novel-brief-compliance.js'
import { filterDraftByChapterOutline } from './novel-draft-outline-filter.js'
import { filterSubstantiveOutlineBeats, outlineBeatCoveredIn, beatAnchorTokens, outlineCatalystCoveredIn } from './novel-outline-beat-cover.js'

export { outlineBeatCoveredIn, filterSubstantiveOutlineBeats, outlineCatalystCoveredIn } from './novel-outline-beat-cover.js'

export type OutlineComplianceReasonCode =
  | 'early_beats_missing'
  | 'chapter_seam_cold_open'
  | 'chapter_event_replay'
  | 'draft_orphan_replay'
  | 'head_orphan_span'
  | 'outline_endpoint_overshoot'
  | 'next_chapter_beat_leak'
  | 'chapter_forward_seam_copy'
  | 'outline_boundary_model'
  | 'named_as_generic'
  | 'catalyst_agency_fail'
  | 'opening_mid_dialogue'
  | 'opening_unexplained_name'
  | 'brief_pacing'
  | 'brief_pending_overshoot'
  | 'weather_process_soft'

export type OutlineComplianceReason = {
  code: OutlineComplianceReasonCode
  message: string
  detail?: string
}

export type OutlineComplianceResult = {
  ok: boolean
  reasons: OutlineComplianceReason[]
}

const PACING_MARK = /前三分之一|前三份之一|前\s*1\s*\/\s*3|前1\/3|前⅓/

function normalizeLite(s: string): string {
  return s.replace(/\s+/g, '').replace(/[，。！？、；：…—\-~·"'「」『』“”']/g, '')
}

function charLen(s: string): number {
  return [...s].length
}

function headSlice(content: string): string {
  const n = charLen(content)
  const third = Math.floor(n / 3)
  const take = Math.min(2000, Math.max(400, third))
  return [...content].slice(0, take).join('')
}

function halfSlice(content: string): string {
  const n = charLen(content)
  const take = Math.max(200, Math.floor(n / 2))
  return [...content].slice(0, take).join('')
}

function splitChunks(text: string): string[] {
  const byPunct = text
    .split(/[。！？\n]+/)
    .map(s => s.trim())
    .filter(s => charLen(s) >= 8)
  const out = [...byPunct]
  const norm = text.replace(/\s+/g, '')
  if (charLen(norm) >= 120 && byPunct.every(c => charLen(c) < 120)) {
    for (let i = 0; i + 120 <= charLen(norm); i += 80) {
      out.push([...norm].slice(i, i + 160).join(''))
    }
  }
  return out
}

function chunkMissesAllBeats(chunk: string, beats: string[]): boolean {
  return beats.every(b => !outlineBeatCoveredIn(chunk, b))
}

/** 过短片段（常见为章名）不参与覆盖硬门槛 */
function substantiveBeats(beats: string[]): string[] {
  return filterSubstantiveOutlineBeats(beats)
}

function extractNameCandidates(text: string, max = 8): string[] {
  const re = /[\u4e00-\u9fff]{2,4}/g
  const counts = new Map<string, number>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const w = m[0]
    if (/^(但是|然后|因为|所以|已经|什么|这个|那个|自己|他们|我们|你们|一个|没有|不是|可以|还是|只是|只得|忽然|于是)$/.test(w)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, max)
}

function findLongestOrphanChunk(draft: string, beats: string[]): string | null {
  if (!beats.length) return null
  let best = ''
  for (const c of splitChunks(draft)) {
    if (charLen(c) < 120) continue
    if (!chunkMissesAllBeats(c, beats)) continue
    if (charLen(c) > charLen(best)) best = c
  }
  return best || null
}

function orphanChunkReplayed(contentHalf: string, orphan: string): boolean {
  const h = normalizeLite(contentHalf)
  const o = normalizeLite(orphan)
  if (o.length < 8 || h.length < 8) return false
  const maxW = Math.min(24, o.length)
  for (let w = maxW; w >= 8; w--) {
    for (let i = 0; i <= o.length - w; i++) {
      if (h.includes(o.slice(i, i + w))) return true
    }
  }
  return false
}

/** 写作说明中的篇幅比例句（通用） */
export function extractBriefPacingClause(brief?: string): string | null {
  if (!brief?.trim()) return null
  for (const raw of brief.split(/[。！？\n]+/)) {
    const t = raw.trim()
    if (t.length < 8) continue
    if (PACING_MARK.test(t)) return t.length > 160 ? `${t.slice(0, 160)}…` : t
  }
  return null
}

export function buildOutlineBeatHardBlock(args: {
  chapterOutline?: string
  writingBrief?: string
}): string {
  const outline = args.chapterOutline?.trim() || ''
  const brief = args.writingBrief?.trim() || ''
  if (!outline && !brief) return ''

  const beats = outline ? extractOutlineBeatPhrases(outline) : []
  const pacing = extractBriefPacingClause(brief)
  const lines = [
    '【大纲拍点硬性】',
    '1. 须覆盖下列拍点（顺序建议与大纲一致）；禁止把大纲未列出的后续情节铺成大段。',
  ]
  if (beats.length) {
    lines.push(...beats.slice(0, 10).map((b, i) => `  ${i + 1}) ${b}`))
    const last = beats[beats.length - 1]
    const { endingQuestion, actionBeat } = extractOutlineBoundaryLastBeat(outline)
    lines.push(`2. **章末边界**：正文须在大纲最后行动拍「${actionBeat || last}」附近收束；该拍一旦写完，禁止再展开大纲未写到的后续。`)
    if (endingQuestion && isSuspenseHookBeat(endingQuestion)) {
      lines.push(`   **【章末问题】须保持未决**：「${endingQuestion}」——禁止本章揭晓答案/完成态，答案留给下章。`)
    }
    lines.push('3. **优先级**：写作说明若目标超出大纲末拍，以大纲为准；未写进大纲的后续场面一律留给后章，不得本章写完。')
  } else if (outline) {
    lines.push(`  （大纲原文）${outline.slice(0, 200)}${outline.length > 200 ? '…' : ''}`)
    lines.push('2. 结构以大纲与写作说明为准；草稿有、大纲无的桥段不得主导篇幅；说明超出大纲时以大纲为准。')
  } else {
    lines.push('2. 结构以写作说明为准；草稿有、说明无的桥段不得主导篇幅。')
  }
  if (pacing) {
    lines.push(`${beats.length ? '4' : '3'}. 开篇节奏须对齐写作说明：${pacing}`)
  }
  return lines.join('\n')
}

/** 重写弱锚定草稿块（替换近全文 dump） */
export function formatWeakRewriteDraftBlock(args: {
  existingText: string
  chapterOutline?: string
}): string {
  const full = args.existingText.trim()
  if (!full) return ''
  const beats = extractOutlineBeatPhrases(args.chapterOutline || '')
  const names = extractNameCandidates(full)
  const hitSentences: string[] = []
  let hitBudget = 0
  for (const s of splitChunks(full)) {
    if (!beats.some(b => outlineBeatCoveredIn(s, b))) continue
    if (hitBudget + charLen(s) > 400) break
    hitSentences.push(s.slice(0, 80) + (s.length > 80 ? '…' : ''))
    hitBudget += charLen(s)
  }
  const orphan = findLongestOrphanChunk(full, beats)

  const parts = [
    '【本章大纲须落实拍点】',
    beats.length
      ? beats.slice(0, 10).map((b, i) => `${i + 1}. ${b}`).join('\n')
      : '（大纲拍点不足，请严格按【本章大纲】与【写作说明】结构重写）',
    '【旧稿可用信息（非结构模板）】',
    names.length ? `- 人名/称谓候选：${names.join('、')}` : '- （未抽出稳定称谓）',
    hitSentences.length
      ? `- 与大纲拍点相关的旧句（仅供信息，勿照抄结构）：\n${hitSentences.map(s => `  · ${s}`).join('\n')}`
      : '',
    orphan
      ? `【旧稿越界反例 — 禁止按此结构展开】\n${orphan.slice(0, 200)}${orphan.length > 200 ? '…' : ''}`
      : '',
    '【禁止】把旧稿当章节结构模板照抄篇幅比例；只展开大纲与写作说明已覆盖的拍点；章末停在大纲最后拍点附近。',
  ]
  return parts.filter(Boolean).join('\n')
}

function detectEarlyBeatsMissing(args: {
  content: string
  chapterOutline: string
  prevChapterTail?: string
  chapterNumber: number
}): OutlineComplianceReason | null {
  // 戏剧标签大纲：前段只逼「起因/局面/选择」，勿逼「欲望/阻碍」
  // （欲望常是全书目标，逼开篇覆盖会诱发提前完成击杀等下章结果）
  const items = extractOutlineBeatItems(args.chapterOutline)
  const tagged = items.filter(i => i.tag)
  let beats: string[]
  if (tagged.length >= 3) {
    const earlyTags = new Set(['本章起因', '局面变化', '人物选择'])
    beats = substantiveBeats(
      tagged.filter(i => earlyTags.has(i.tag!)).map(i => i.beat),
    )
  } else {
    beats = substantiveBeats(extractOutlineBeatPhrases(args.chapterOutline))
  }
  if (beats.length < 1) return null

  const early = beats.slice(0, Math.max(1, Math.ceil(beats.length / 2)))
  const stale = args.chapterNumber >= 2 && args.prevChapterTail?.trim()
    ? findStaleOutlineBeats(args.chapterOutline, args.prevChapterTail)
    : []
  const staleSet = new Set(stale.map(s => normalizeLite(s)))
  const required = early.filter(b => !staleSet.has(normalizeLite(b)) && !isSuspenseHookBeat(b))
  if (!required.length) return null

  const head = headSlice(args.content)
  const hitHead = required.filter(b => outlineBeatCoveredIn(head, b))
  const need = Math.max(1, Math.ceil(required.length / 2))
  if (hitHead.length >= need) return null

  // 前段拍点若已在**全文**落地，不再逼开篇重写（否则补拍易造成章内重复击杀/重复场面）
  const hitFull = required.filter(b => outlineBeatCoveredIn(args.content, b))
  if (hitFull.length >= required.length) return null
  if (hitFull.length >= need && hitFull.length > hitHead.length) return null

  const missing = required.filter(b => !outlineBeatCoveredIn(head, b))
  return {
    code: 'early_beats_missing',
    message: `开篇约前三分之一未落实大纲前段拍点（命中 ${hitHead.length}/${need}）。缺失：${missing.slice(0, 4).join('；')}`,
    detail: missing.slice(0, 6).join(' | '),
  }
}

function detectDraftOrphanReplay(args: {
  content: string
  existingText?: string
  chapterOutline: string
}): OutlineComplianceReason | null {
  const draft = args.existingText?.trim()
  if (!draft) return null
  const body = args.content.trim()
  // 同一次改写把自身当 existing 时跳过；勿用「前 400 字相同」误杀毒稿回灌检测
  if (
    Math.abs(charLen(draft) - charLen(body)) <= 40
    && normalizeLite(draft.slice(0, 160)) === normalizeLite(body.slice(0, 160))
    && normalizeLite(draft.slice(-120)) === normalizeLite(body.slice(-120))
  ) return null
  const beats = substantiveBeats(extractOutlineBeatPhrases(args.chapterOutline))
  if (beats.length < 1) return null
  const orphan = findLongestOrphanChunk(draft, beats)
  if (!orphan || charLen(orphan) < 120) return null
  const half = halfSlice(args.content)
  if (!orphanChunkReplayed(half, orphan)) return null
  return {
    code: 'draft_orphan_replay',
    message: '正文前半高重合回灌了旧稿中「大纲未覆盖」的长段，疑似按旧稿越界结构展开。',
    detail: orphan.slice(0, 80),
  }
}

/**
 * 待落地【本章起因】时：开篇若高重合续写上章末，且起因仍未覆盖 → 结构失败。
 * 题材无关：不使用第三方归属词表；只看 tipContinue + outlineBeatCoveredIn。
 */
export function detectCatalystAgencyFail(args: {
  content: string
  chapterOutline?: string
  prevChapterTail?: string
}): OutlineComplianceReason | null {
  const outline = args.chapterOutline?.trim() || ''
  if (!outline || charLen(args.content) < 120) return null
  const catalysts = extractOutlineCatalystPhrases(outline)
  if (!catalysts.length) return null

  const prev = args.prevChapterTail || ''
  // 与 findStaleOutlineBeats 一致：起因是否已在上章末落地，只看末短窗
  const prevTip = prev.trim().slice(-500)
  const pending = catalysts.filter(c =>
    !prevTip
    || !(outlineCatalystCoveredIn(prevTip, c) || outlineBeatCoveredIn(prevTip, c)),
  )
  if (!pending.length) return null

  const head = halfSlice(args.content)
  const covered = pending.some(c => outlineCatalystCoveredIn(head, c))
  if (covered) return null

  const headNorm = normalizeLite(head)
  const prevNorm = normalizeLite(prev.slice(-900))
  let tipContinue = false
  if (prevNorm.length >= 20) {
    for (let w = Math.min(16, prevNorm.length, headNorm.length); w >= 6; w--) {
      for (let i = 0; i <= prevNorm.length - w; i++) {
        if (headNorm.includes(prevNorm.slice(i, i + w))) {
          tipContinue = true
          break
        }
      }
      if (tipContinue) break
    }
    if (!tipContinue) {
      const tipHits = beatAnchorTokens(prev.slice(-500)).filter(t => t.length >= 2 && headNorm.includes(t))
      tipContinue = tipHits.length >= 2
    }
  }
  if (!tipContinue) return null

  const cat = pending[0] || catalysts[0] || '本章起因'
  return {
    code: 'catalyst_agency_fail',
    message: `本章起因「${cat}」尚未落地，开篇却沿上章末悬念续写（与上章末高度重合），未按大纲写出该起因。请从上章已发生事实之后起笔，先写清起因。`,
    detail: cat,
  }
}

function detectHeadOrphanSpan(args: {
  content: string
  chapterOutline: string
  earlyMissing: boolean
  requiredHitZero: boolean
}): OutlineComplianceReason | null {
  if (!args.earlyMissing && !args.requiredHitZero) return null
  const beats = substantiveBeats(extractOutlineBeatPhrases(args.chapterOutline))
  if (beats.length < 2) return null

  const head = headSlice(args.content)
  const chunks = splitChunks(head)
  let orphanLen = 0
  let run = 0
  for (const c of chunks) {
    if (chunkMissesAllBeats(c, beats)) {
      run += charLen(c)
    } else {
      if (run >= 150) orphanLen += run
      run = 0
    }
  }
  if (run >= 150) orphanLen += run

  if (orphanLen < charLen(head) * 0.45) return null
  return {
    code: 'head_orphan_span',
    message: '开篇大段未落入任何大纲拍点，且前段拍点落实不足，疑似开篇越级铺开。',
  }
}

/**
 * 章末照抄/高度重合下章开篇 → 正向章缝抄袭。
 * 题材无关：只比归一化连续片段，无对白/物件词表。
 */
export function detectChapterForwardSeamCopy(args: {
  content: string
  nextChapterHead?: string
}): OutlineComplianceReason | null {
  const hit = detectForwardSeamCopyLexical({
    content: args.content,
    nextChapterHead: args.nextChapterHead,
  })
  if (!hit) return null
  return {
    code: 'chapter_forward_seam_copy',
    message: `章末与下章开篇高度重合（摘录「${hit.excerpt}…」）。章末须停在下章开篇之前：可留下章可读得通的短落点，禁止复述或照抄下章开篇句群。`,
    detail: hit.excerpt,
  }
}

/**
 * 下章大纲拍点已在本章大段落实，而本章拍点覆盖不足 → 跨章抢戏/章界错位。
 */
export function detectNextChapterBeatLeak(args: {
  content: string
  chapterOutline?: string
  nextChapterOutline?: string
}): OutlineComplianceReason | null {
  const nextOutline = args.nextChapterOutline?.trim() || ''
  const curOutline = args.chapterOutline?.trim() || ''
  if (!nextOutline || !curOutline) return null
  const nextBeats = substantiveBeats(extractOutlineBeatPhrases(nextOutline))
  const curBeats = substantiveBeats(extractOutlineBeatPhrases(curOutline))
  if (nextBeats.length < 2 || curBeats.length < 1) return null

  const coveredLoose = (b: string) =>
    outlineBeatCoveredIn(args.content, b) || outlineResultBeatCoveredIn(args.content, b)

  const nextHits = nextBeats.filter(coveredLoose)
  const curHits = curBeats.filter(b => outlineBeatCoveredIn(args.content, b))
  const nextNeed = Math.max(2, Math.ceil(nextBeats.length * 0.45))
  const curNeed = Math.max(1, Math.ceil(curBeats.length * 0.5))

  // 下章【本章起因】单独命中也足以报警（常见：本章揭晓下章起因）
  const nextCause = extractOutlineBeatItems(nextOutline).find(i => i.tag === '本章起因')?.beat
  const causeHit = !!(nextCause && coveredLoose(nextCause))

  if (!causeHit && nextHits.length < nextNeed) return null
  // 本章拍点已够且下章命中不超过本章 → 视为正常交叉用词，不报（起因抢戏除外）
  if (!causeHit && curHits.length >= curNeed && nextHits.length <= curHits.length) return null

  const leaked = (causeHit && nextCause ? [nextCause, ...nextHits] : nextHits)
    .filter(Boolean)
    .slice(0, 3)
    .join('；')
  const curNote = causeHit
    ? '并提前写了下章【本章起因】'
    : curHits.length < curNeed
      ? `本章拍点覆盖不足（${curHits.length}/${curBeats.length}）`
      : `并抢写了下章主情节（下章命中 ${nextHits.length}/${nextBeats.length}）`
  return {
    code: 'next_chapter_beat_leak',
    message:
      `正文已大段落实下章大纲拍点（如「${leaked}」），${curNote}。请只写本章大纲，把下章情节留给下一章。`,
    detail: leaked,
  }
}

/** 抽象完成义（不绑场面：无套/勒/猎等专词） */
const OUTLINE_ABSTRACT_DONE_RE = /成功|得手|奏效|成了|终于|如愿|得偿|完成|到手|搞定/

/** 从结果态拍点抽出载荷名词（去掉抽象完成/达成壳，不绑场面手法） */
function extractResultPayloadNoun(phrase: string): string {
  const p = phrase.replace(/\s+/g, '')
  // 优先取「成功/终于…」之后的尾段作载荷；否则剥常见达成动词再取尾名词
  const afterDone = p.split(/成功|顺利|终于|得以|完成|达成/).pop() || p
  const stripped = afterDone.replace(/取得|获得|拿到|带回|击败|打败|抓到|抓住|逮住|捕获|套住|猎获|击杀|打死/g, '')
  const m = stripped.match(/([\u4e00-\u9fff]{2,4})$/)
  return m?.[1] || ''
}

/**
 * 下章起因/结果态是否已在正文落地（结构：载荷名词 + 抽象完成/持有，不枚举场面手法）。
 */
function pendingOutcomeCoveredIn(haystack: string, phrase: string): boolean {
  if (outlineBeatCoveredIn(haystack, phrase)) return true
  const p = phrase.replace(/\s+/g, '')
  if (p.length < 6) return false
  const h = haystack.replace(/\s+/g, '')
  const obj = extractResultPayloadNoun(phrase)
  if (!obj || obj.length < 2) return false
  // 载荷、其连续二字、或「X↔X子」类通名变体（野兔↔兔子），不绑猎场专词表
  const cores: string[] = [obj]
  if (obj.length >= 2) {
    for (let i = 0; i <= obj.length - 2; i++) cores.push(obj.slice(i, i + 2))
    const last = obj[obj.length - 1]!
    cores.push(`${last}子`, `野${last}`)
  }
  // 扫全部出现点（避免「野兔脚印」等早提抢先挡住后文完成态）
  const hits: number[] = []
  for (const c of [...new Set(cores)]) {
    if (c.length < 2) continue
    let from = 0
    while (from < h.length) {
      const i = h.indexOf(c, from)
      if (i < 0) break
      hits.push(i)
      from = i + c.length
    }
  }
  if (!hits.length) return false
  for (const objAt of hits) {
    const win = h.slice(Math.max(0, objAt - 28), Math.min(h.length, objAt + obj.length + 28))
    if (OUTLINE_ABSTRACT_DONE_RE.test(win)) return true
    if (/(?:手里|提着|怀里|拿到|带回|带着|拎着).{0,16}/.test(win)
      || /.{0,16}(?:手里|提着|怀里|拿到|带回|带着|拎着)/.test(win)) {
      return true
    }
  }
  return false
}

function outlineResultBeatCoveredIn(haystack: string, phrase: string): boolean {
  return pendingOutcomeCoveredIn(haystack, phrase)
}

/**
 * 【章末问题】悬念被正文揭晓（题材无关）：
 * 主路径——下章【本章起因】已在本章落地（即提前写出答案）；
 * 辅路径——行动拍之后出现抽象完成义且文末不再保持未决。
 */
export function detectSuspenseEndingResolved(args: {
  content: string
  chapterOutline?: string
  nextChapterOutline?: string
}): OutlineComplianceReason | null {
  const outline = args.chapterOutline?.trim() || ''
  if (!outline) return null
  const { endingQuestion, actionBeat } = extractOutlineBoundaryLastBeat(outline)
  const q = endingQuestion.trim()
  if (!q || !isSuspenseHookBeat(q)) return null

  const raw = args.content.trim()
  const total = charLen(raw)
  if (total < 80) return null

  const nextCause = extractOutlineBeatItems(args.nextChapterOutline || '')
    .find(i => i.tag === '本章起因')?.beat
  if (nextCause && pendingOutcomeCoveredIn(raw, nextCause)) {
    return {
      code: 'outline_endpoint_overshoot',
      message:
        `章末悬念「${q}」已在正文收束，并提前写下章起因「${nextCause}」。`
        + `本章应停在「${actionBeat || '悬念之前'}」，把答案留给下章；请删除揭晓后文。`,
      detail: q,
    }
  }

  const compact = raw.replace(/\s+/g, '')
  // 起势：优先大纲行动拍覆盖点；否则从中段起算（不绑场面词）
  let afterIdx = Math.floor(compact.length * 0.4)
  if (actionBeat) {
    const off = firstBeatCoverOffset(raw, actionBeat)
    if (off >= 0) afterIdx = Math.min(compact.length - 1, Math.max(0, Math.floor(off * 0.9)))
  }
  const afterSetup = compact.slice(afterIdx)
  if (charLen(afterSetup) < 24) return null

  const tail = afterSetup.slice(Math.floor(afterSetup.length * 0.35))
  if (/能否|会不会|还不知道|不知能否|还没|尚未|未能|没能|未果|落空|没有成功/.test(tail)) {
    return null
  }

  if (!OUTLINE_ABSTRACT_DONE_RE.test(afterSetup)) return null

  return {
    code: 'outline_endpoint_overshoot',
    message:
      `章末悬念「${q}」已被正文揭晓/收束。本章应停在「${actionBeat || '悬念之前'}」，把答案留给下章；请删除揭晓成功的后文。`,
    detail: q,
  }
}

/** 严匹配/锚点覆盖下的章末越界（V2，题材无关） */
function firstBeatCoverOffset(content: string, phrase: string): number {
  const chars = [...content]
  if (chars.length < 40) return outlineBeatCoveredIn(content, phrase) ? chars.length : -1
  const step = Math.max(24, Math.floor(chars.length / 80))
  let found = -1
  for (let end = Math.min(120, chars.length); end <= chars.length; end += step) {
    if (outlineBeatCoveredIn(chars.slice(0, end).join(''), phrase)) {
      found = end
      break
    }
  }
  if (found < 0) {
    if (outlineBeatCoveredIn(content, phrase)) return chars.length
    return -1
  }
  // 与删毒同源：粗步进收回到最小仍覆盖前缀，避免把末拍后一句毒尾算进「完成点」
  let lo = Math.max(0, found - step)
  let hi = found
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (outlineBeatCoveredIn(chars.slice(0, mid).join(''), phrase)) hi = mid
    else lo = mid + 1
  }
  return hi
}

function detectOutlineEndpointOvershoot(args: {
  content: string
  chapterOutline: string
}): OutlineComplianceReason | null {
  const boundary = extractOutlineBoundaryLastBeat(args.chapterOutline)
  const allBeats = substantiveBeats(extractOutlineBeatPhrases(args.chapterOutline))
  // 硬止点用行动拍；勿用悬念问句/信息注记当「须写完」的末拍
  const beats = boundary.actionBeat
    ? substantiveBeats([
      ...allBeats.filter(b => b !== boundary.endingQuestion && !isSuspenseHookBeat(b)),
      boundary.actionBeat,
    ].filter((b, i, arr) => arr.indexOf(b) === i))
    : allBeats.filter(b => !isSuspenseHookBeat(b))
  if (beats.length < 2 && !boundary.actionBeat) return null
  if (beats.length < 1) return null

  const total = charLen(args.content)
  const last = boundary.actionBeat || beats[beats.length - 1]!
  const finalCut = [...args.content].slice(Math.floor(total * 0.8)).join('')
  const lastInFinale = outlineBeatCoveredIn(finalCut, last)

  let offset = firstBeatCoverOffset(args.content, last)
  let boundaryLabel = last
  let mode: 'last' | 'early' = 'last'

  if (offset < 0) {
    // 末拍未覆盖：优先用大纲前段拍点定位；再回退到「全文已覆盖的最晚拍点」
    mode = 'early'
    const earlyN = Math.max(2, Math.min(Math.ceil(beats.length * 0.35), Math.max(2, Math.ceil(beats.length / 2) - 1)))
    const early = beats.slice(0, earlyN)
    let covered = early
      .map(b => ({ b, off: firstBeatCoverOffset(args.content, b) }))
      .filter(x => x.off >= 0)
    if (covered.length < Math.max(1, Math.ceil(early.length * 0.5))) {
      covered = beats
        .map(b => ({ b, off: firstBeatCoverOffset(args.content, b) }))
        .filter(x => x.off >= 0)
      if (!covered.length) return null
    }
    const latest = covered.reduce((a, c) => (c.off >= a.off ? c : a))
    offset = latest.off
    boundaryLabel = latest.b
  } else if (lastInFinale) {
    // 末拍在终段再出现一次（收束回响）时，勿用 0.45 过早短路：
    // 「中段立意 + 后文越界 + 末尾回扣末拍」会漏检。
    const ratio0 = offset / total
    if (ratio0 >= 0.72 || (total - offset) < total * 0.22) return null
  }

  const ratio = offset / total
  const tailLen = total - offset
  if (tailLen < total * 0.25) return null

  const tail = [...args.content].slice(offset).join('')
  const endBeats = beats.slice(-Math.min(2, beats.length))
  let orphan = 0
  for (const c of splitChunks(tail)) {
    if (chunkMissesAllBeats(c, endBeats)) orphan += charLen(c)
  }
  if (orphan < Math.max(160, tailLen * 0.25)) return null
  if (mode === 'last' && lastInFinale && orphan < tailLen * 0.45) return null

  return {
    code: 'outline_endpoint_overshoot',
    message:
      `大纲拍点「${boundaryLabel}」过早完成（约在全文 ${Math.round(ratio * 100)}% 处），其后仍有约 ${tailLen} 字展开大纲未写到的后续场面。请在大纲最后拍点「${last}」附近收束，删掉越界后文。`,
    detail: last,
  }
}

/** 「那/这+双字」里常见非人称载荷（时间/处所/虚指），不计入泛称 */
const DEMONSTRATIVE_NON_PERSON = new Set([
  '时候', '地方', '事情', '世界', '样子', '一夜', '一天', '一次', '一声', '一下', '一边', '一种',
  '一个', '一位', '一幕', '一路', '一回', '一刻', '一阵', '一些', '一切', '这里', '那里', '这么',
  '那么', '这样', '那样', '这次', '那次', '这事', '那事', '这边', '那边', '这般', '那般',
  '此时', '那时', '此前', '其后', '其间', '其中', '之外', '之内', '之上', '之下',
  '么一', '么个', '么点', '么些', '么样', '会儿',
])

function isNonPersonEpithet(epi: string): boolean {
  if (!epi || epi.length < 2) return true
  if (DEMONSTRATIVE_NON_PERSON.has(epi)) return true
  // 「这么一 / 那么点」：捕获组落在「么一」上，不是人称泛称
  if (epi.startsWith('么')) return true
  return false
}

/**
 * 大纲人名已引入后，叙述仍反复用「那/这+双字泛称」代替该姓名（不枚举姑娘/少年等场面词）。
 * 人名以正文「名字/叫作/叫做/正是」引入为准，避免大纲地名 n-gram 误伤。
 */
function detectNamedAsGenericEpithet(args: {
  content: string
  chapterOutline: string
}): OutlineComplianceReason | null {
  const outline = args.chapterOutline
  const introNames = [
    ...args.content.matchAll(
      /名字[^。！？\n]{0,20}[：:]\s*([\u4e00-\u9fff]{2,4})|(?:叫作|叫做|正是)[：:\s]*([\u4e00-\u9fff]{2,4})/g,
    ),
  ]
    .map(m => m[1] || m[2])
    .filter((n): n is string => !!n && outline.includes(n))
  const names = [...new Set(introNames)]
  if (!names.length) return null

  let best: { name: string; epithet: string; count: number } | null = null
  const re = /(?:身边|眼前|身旁|旁边)?(?:那|这)([\u4e00-\u9fff]{2})/g

  for (const name of names) {
    const idx = args.content.indexOf(name)
    if (idx < 0) continue

    const after = args.content.slice(idx + name.length)
    const counts = new Map<string, number>()
    let m: RegExpExecArray | null
    const local = new RegExp(re.source, 'g')
    while ((m = local.exec(after)) !== null) {
      const epi = m[1]
      if (!epi || epi === name.slice(0, 2) || epi === name.slice(-2)) continue
      if (name.includes(epi)) continue
      if (isNonPersonEpithet(epi)) continue
      counts.set(epi, (counts.get(epi) || 0) + 1)
    }
    for (const [epithet, count] of counts) {
      if (count < 2) continue
      if (!best || count > best.count) best = { name, epithet, count }
    }
  }
  if (!best) return null
  return {
    code: 'named_as_generic',
    message: `人名「${best.name}」已出场后，后文仍约 ${best.count} 次用「那/这+${best.epithet}」类指示泛称代替姓名，请改为姓名或稳定称谓。`,
    detail: `${best.name}|${best.epithet}`,
  }
}

function detectBriefPacing(args: {
  content: string
  writingBrief?: string
}): OutlineComplianceReason | null {
  const clause = extractBriefPacingClause(args.writingBrief)
  if (!clause) return null
  const payload = normalizeLite(clause.replace(PACING_MARK, '').replace(/需在|须在|要在|篇幅内|借|用/g, ''))
  if (payload.length < 4) return null
  const head = normalizeLite(headSlice(args.content))
  let hit = false
  const maxW = Math.min(12, payload.length)
  for (let w = maxW; w >= 4; w--) {
    for (let i = 0; i <= payload.length - w; i++) {
      if (head.includes(payload.slice(i, i + w))) {
        hit = true
        break
      }
    }
    if (hit) break
  }
  if (hit) return null
  return {
    code: 'brief_pacing',
    message: `开篇未对齐写作说明的篇幅节奏要求：「${clause.slice(0, 48)}…」`,
    detail: clause,
  }
}

export function detectOutlineCompliance(args: {
  content: string
  chapterOutline?: string
  writingBrief?: string
  existingText?: string
  prevChapterTail?: string
  nextChapterOutline?: string
  /** 下章已写开篇：章末须正向承接 */
  nextChapterHead?: string
  chapterNumber: number
  prevSnapshot?: import('../../common/novel/novel-continuity-state.js').ChapterEndSnapshot | null
}): OutlineComplianceResult {
  const reasons: OutlineComplianceReason[] = []
  const outline = args.chapterOutline?.trim() || ''
  const content = args.content?.trim() || ''
  // 空正文不得判通过（删毒全清后曾误走 ok，导致后续一致性审报 empty_content）
  if (!content) {
    return {
      ok: false,
      reasons: [{
        code: 'outline_endpoint_overshoot',
        message: '正文为空（可能已被大纲删毒清空），须按本章大纲重写',
      }],
    }
  }
  // 过短草稿跳过边界硬审，避免写作中途误拦
  if (charLen(content) < 200) {
    return { ok: true, reasons: [] }
  }

  // 章缝叙事/因果（时辰、倒叙、离场、天候、人名半路开口等）不走规则硬审，见模型审

  let earlyMissing = false
  let requiredHitZero = false
  if (outline) {
    const early = detectEarlyBeatsMissing({
      content,
      chapterOutline: outline,
      prevChapterTail: args.prevChapterTail,
      chapterNumber: args.chapterNumber,
    })
    if (early) {
      reasons.push(early)
      earlyMissing = true
      requiredHitZero = /命中 0\//.test(early.message)
    }

    const draftReplay = detectDraftOrphanReplay({
      content,
      existingText: args.existingText,
      chapterOutline: outline,
    })
    if (draftReplay) reasons.push(draftReplay)

    const orphanSpan = detectHeadOrphanSpan({
      content,
      chapterOutline: outline,
      earlyMissing,
      requiredHitZero,
    })
    if (orphanSpan) reasons.push(orphanSpan)

    const endpoint = detectOutlineEndpointOvershoot({ content, chapterOutline: outline })
    if (endpoint) reasons.push(endpoint)

    const suspenseResolved = detectSuspenseEndingResolved({
      content,
      chapterOutline: outline,
      nextChapterOutline: args.nextChapterOutline,
    })
    // 悬念揭晓优先保留（比「早期拍点比例越界」文案更贴本章止点）
    if (suspenseResolved) {
      const withoutGenericOvershoot = reasons.filter(
        r => !(r.code === 'outline_endpoint_overshoot' && !/章末悬念/.test(r.message)),
      )
      reasons.length = 0
      reasons.push(...withoutGenericOvershoot, suspenseResolved)
    }

    const nextLeak = detectNextChapterBeatLeak({
      content,
      chapterOutline: outline,
      nextChapterOutline: args.nextChapterOutline,
    })
    if (nextLeak) reasons.push(nextLeak)

    const forwardCopy = detectChapterForwardSeamCopy({
      content,
      nextChapterHead: args.nextChapterHead,
    })
    if (forwardCopy) reasons.push(forwardCopy)

    const named = detectNamedAsGenericEpithet({ content, chapterOutline: outline })
    if (named) reasons.push(named)
  }

  const pacing = detectBriefPacing({ content, writingBrief: args.writingBrief })
  if (pacing) reasons.push(pacing)

  const hook = detectBriefPendingStateOvershoot({
    content,
    writingBrief: args.writingBrief,
    chapterOutline: outline || undefined,
  })
  if (hook) {
    reasons.push({
      code: 'brief_pending_overshoot',
      message: hook.message,
      detail: hook.clause,
    })
  }

  return { ok: reasons.length === 0, reasons }
}

/** 冷开篇核修：旧稿只留人名，结构完全按上章结尾+大纲从零写 */
export function formatNuclearColdDraftBlock(args: {
  existingText: string
  chapterOutline?: string
}): string {
  const names = extractNameCandidates(args.existingText)
  const beats = extractOutlineBeatPhrases(args.chapterOutline || '')
  return [
    '【核修模式 — 旧稿结构作废】上一稿开篇时空早于上章末已发生事实，或未进入本章大纲前段；禁止沿用其开篇骨架与篇幅比例。',
    names.length ? `可用人名/称谓：${names.join('、')}` : '（沿用本章已出现人物）',
    '【须按序落实的大纲拍点】',
    beats.length
      ? beats.slice(0, 10).map((b, i) => `${i + 1}. ${b}`).join('\n')
      : '（严格按【本章大纲】）',
    '【开篇硬约束】',
    '1. 第一段用一句轻锚点明【上章结尾】场合/状态，禁止复述已闭合高潮；再进入本章新拍。',
    '2. 第二段起进入拍点1；开篇约前三分之一须覆盖大纲前段拍点。',
    '3. 禁止开篇时空早于上章末已发生事实；禁止倒退到上章已越过的更早情节节点重开。',
  ].join('\n')
}

export function buildOutlineComplianceFixPrompt(args: {
  content: string
  reasons: OutlineComplianceReason[]
  chapterOutline?: string
  writingBrief?: string
  orphanDraftExcerpt?: string
  nextChapterOutline?: string
  /** 下章已写开篇：章末须能正向承接 */
  nextChapterHead?: string
  prevChapterTail?: string
  chapterNumber?: number
  /** 冷开篇核修：旧稿只留人名，不贴弱锚定旧句 */
  nuclearCold?: boolean
}): string {
  const seamCold = args.nuclearCold || args.reasons.some(
    r => r.code === 'chapter_seam_cold_open' || r.code === 'early_beats_missing',
  )
  // 修正提示：按大纲裁定旧稿，禁止整段 dump 坏开篇进对照
  const draftBlock = seamCold && args.content.trim()
    ? filterDraftByChapterOutline({
      existingText: args.content,
      chapterOutline: args.chapterOutline,
      prevChapterTail: args.prevChapterTail,
      chapterNumber: args.chapterNumber ?? 2,
    }).promptBlock
    : [
      '【待修正正文（供对照，勿照抄错误结构）】',
      args.content.trim().slice(0, 6000),
    ].join('\n')
  const lines = [
    args.nuclearCold ? '【大纲落实修正 — 冷开篇核修重写】' : '【大纲落实修正 — 整章重写】',
    '上一稿未落实本章大纲/写作说明，请输出完整替换正文。硬性要求：',
    ...args.reasons.map((r, i) => `${i + 1}. ${r.message}`),
    args.reasons.some(r => r.code === 'catalyst_agency_fail')
      ? '【结构硬性】本章起因尚未落地时，禁止沿上章末悬念续写开篇；须先写清起因由【本章人物】完成，再进入欲望/阻碍。'
      : '',
    // 起因未落地时不喂上章 tip 原文（防续写诱饵）；其它原因仍给尾段承接
    args.reasons.some(r => r.code === 'catalyst_agency_fail')
      ? '【上章接缝】只承接已发生事实；禁止粘贴/续写上章末悬念原文。先写清本章起因，再进入欲望/阻碍。'
      : (args.prevChapterTail?.trim()
        ? `【上章结尾（必须承接；开篇不得早于此处已发生事实）】\n${args.prevChapterTail.trim().slice(-1200)}`
        : ''),
    args.chapterOutline?.trim()
      ? `【本章大纲】\n${args.chapterOutline.trim().slice(0, 800)}`
      : '',
    args.nextChapterOutline?.trim()
      ? `【下章大纲 — 禁止提前写】\n${args.nextChapterOutline.trim().slice(0, 500)}`
      : '',
    args.nextChapterHead?.trim()
      ? '【正向章缝】下章开篇已写（正文不粘贴进提示）。先完成本章末拍；章末停在下章开篇之前；禁止照抄/复述下章开篇句群；禁止另起下章未接的支线终局。'
      : '',
    args.reasons.some(r => r.code === 'chapter_forward_seam_copy')
      ? '【正向章缝硬性】章末与下章开篇高度重合：删掉章末照抄/复述下章开篇的句子，停在下章开篇之前；勿把下章第一句写进本章。'
      : '',
    args.writingBrief?.trim()
      ? (seamCold
        ? `【结构说明 — 写作说明起势已作废；只按大纲+上章结尾】\n${args.writingBrief.trim().slice(0, 600)}`
        : `【写作说明】（若超出大纲边界，以大纲为准）\n${args.writingBrief.trim().slice(0, 800)}`)
      : '',
    args.orphanDraftExcerpt?.trim() && !args.nuclearCold && !seamCold
      ? `【禁止再按此旧稿越界结构展开】\n${args.orphanDraftExcerpt.trim().slice(0, 200)}`
      : '',
    seamCold
      ? [
        '**【章缝硬性】**开篇时空点必须紧接【上章结尾】已发生事实之后；禁止倒退到上章已越过的更早情节节点。',
        '若上章末已在场共处，而大纲拍点1在屋外：须「室内承接 → 离场/隔夜 → 再写拍点1」，禁止开篇推门进来/提猎物归来硬凑。',
        '上章末已完成态收束、本章有外来冲突：开篇窗口内须交代来者/起势（顺叙或先果后因均可）；若开篇场合与上章末契约地点不同，须先有过渡；禁止「重新/又把」重做收束，禁止整段不交代来者。',
        '上章入夜→本章清晨为日循环正向，可接日间拍点；上章正午/午后后写清晨须开篇写明跨日。',
        '结构以大纲+上章结尾为准，禁止照抄已丢弃旧文。',
      ].join('')
      : '',
    '只输出简体中文小说正文；不要标题行、不要说明。',
    '章末须停在大纲最后行动拍附近；若有【章末问题】须保持未决，**禁止揭晓答案/完成态**（留给下章）。',
    '章末须停在大纲最后拍点附近；**删掉该拍点之后的全部越界后文**。',
    '正文完成态不得超过大纲最后拍点所允许的程度；下章情节禁止提前写。',
    '**字数**：须落在与生成相同的目标区间（见系统提示）；删掉越界后文后，**只在大纲已列拍点内**写厚/补场面与反应顶满区间，禁止把删掉的越界高潮再写回来，禁止灌水空话。',
    '人名一旦在正文中点明，后文叙述勿再用「那/这+双字泛称」反复代替该姓名。',
    '在场人物仅限上章末已出场与本章大纲点名者；禁止无交代使用「娘俩」「一家三口」等暗示未出场亲属的称谓。',
    draftBlock,
  ]
  return lines.filter(Boolean).join('\n\n')
}
