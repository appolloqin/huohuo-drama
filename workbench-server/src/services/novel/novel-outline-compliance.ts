/**
 * 大纲/写作说明落实（题材无关）：
 * Prompt 硬块 + 拍点覆盖（字面/锚点）+ 末拍越界 V2 + 名后「那/这+泛称」；
 * 越界/名后泛称复检失败则硬失败（见 outline-compliance-fix）。
 * 不含场面词规则表、不含启发式截断。
 */
import {
  detectChapterSeamColdOpen,
  extractOutlineBeatPhrases,
  findStaleOutlineBeats,
} from './novel-chapter-seam.js'
import { detectChapterBodyEventReplay } from './novel-chapter-end-snapshot.js'
import { detectBriefPendingStateOvershoot } from './novel-brief-compliance.js'
import { filterDraftByChapterOutline } from './novel-draft-outline-filter.js'
import { filterSubstantiveOutlineBeats, outlineBeatCoveredIn } from './novel-outline-beat-cover.js'

export { outlineBeatCoveredIn, filterSubstantiveOutlineBeats } from './novel-outline-beat-cover.js'

export type OutlineComplianceReasonCode =
  | 'early_beats_missing'
  | 'chapter_seam_cold_open'
  | 'chapter_event_replay'
  | 'draft_orphan_replay'
  | 'head_orphan_span'
  | 'outline_endpoint_overshoot'
  | 'next_chapter_beat_leak'
  | 'outline_boundary_model'
  | 'named_as_generic'
  | 'brief_pacing'
  | 'brief_pending_overshoot'

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
    lines.push(`2. **章末边界**：正文须在大纲最后拍点「${last}」附近收束；该拍一旦写完，禁止再展开大纲未写到的后续。`)
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
  const beats = substantiveBeats(extractOutlineBeatPhrases(args.chapterOutline))
  if (beats.length < 2) return null

  const early = beats.slice(0, Math.ceil(beats.length / 2))
  const stale = args.chapterNumber >= 2 && args.prevChapterTail?.trim()
    ? findStaleOutlineBeats(args.chapterOutline, args.prevChapterTail)
    : []
  const staleSet = new Set(stale.map(s => normalizeLite(s)))
  const required = early.filter(b => !staleSet.has(normalizeLite(b)))
  if (!required.length) return null

  const head = headSlice(args.content)
  const hit = required.filter(b => outlineBeatCoveredIn(head, b))
  const need = Math.max(1, Math.ceil(required.length / 2))
  if (hit.length >= need) return null

  const missing = required.filter(b => !outlineBeatCoveredIn(head, b))
  return {
    code: 'early_beats_missing',
    message: `开篇约前三分之一未落实大纲前段拍点（命中 ${hit.length}/${need}）。缺失：${missing.slice(0, 4).join('；')}`,
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

  const nextHits = nextBeats.filter(b => outlineBeatCoveredIn(args.content, b))
  const curHits = curBeats.filter(b => outlineBeatCoveredIn(args.content, b))
  const nextNeed = Math.max(2, Math.ceil(nextBeats.length * 0.45))
  const curNeed = Math.max(1, Math.ceil(curBeats.length * 0.5))

  if (nextHits.length < nextNeed) return null
  // 本章拍点已够且下章命中不超过本章 → 视为正常交叉用词，不报
  if (curHits.length >= curNeed && nextHits.length <= curHits.length) return null

  const leaked = nextHits.slice(0, 3).join('；')
  const curNote = curHits.length < curNeed
    ? `本章拍点覆盖不足（${curHits.length}/${curBeats.length}）`
    : `并抢写了下章主情节（下章命中 ${nextHits.length}/${nextBeats.length}）`
  return {
    code: 'next_chapter_beat_leak',
    message:
      `正文已大段落实下章大纲拍点（如「${leaked}」），${curNote}。请只写本章大纲，把下章情节留给下一章。`,
    detail: leaked,
  }
}

/** 严匹配/锚点覆盖下的章末越界（V2，题材无关） */
function firstBeatCoverOffset(content: string, phrase: string): number {
  const chars = [...content]
  if (chars.length < 40) return outlineBeatCoveredIn(content, phrase) ? chars.length : -1
  const step = Math.max(24, Math.floor(chars.length / 80))
  for (let end = Math.min(120, chars.length); end <= chars.length; end += step) {
    if (outlineBeatCoveredIn(chars.slice(0, end).join(''), phrase)) return end
  }
  if (outlineBeatCoveredIn(content, phrase)) return chars.length
  return -1
}

function detectOutlineEndpointOvershoot(args: {
  content: string
  chapterOutline: string
}): OutlineComplianceReason | null {
  const beats = substantiveBeats(extractOutlineBeatPhrases(args.chapterOutline))
  if (beats.length < 2) return null

  const total = charLen(args.content)
  const last = beats[beats.length - 1]
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
  chapterNumber: number
  prevSnapshot?: import('../../common/novel/novel-continuity-state.js').ChapterEndSnapshot | null
}): OutlineComplianceResult {
  const reasons: OutlineComplianceReason[] = []
  const outline = args.chapterOutline?.trim() || ''
  const content = args.content?.trim() || ''
  if (!content || charLen(content) < 200) {
    return { ok: true, reasons: [] }
  }

  // 无大纲时仍可做章末契约时辰/地点对照
  if (args.chapterNumber >= 2 && (args.prevChapterTail || args.prevSnapshot)) {
    const seamOnly = detectChapterSeamColdOpen({
      content,
      chapterNumber: args.chapterNumber,
      prevChapterTail: args.prevChapterTail,
      chapterOutline: outline || undefined,
      prevSnapshot: args.prevSnapshot,
    })
    if (seamOnly && /时辰倒退|地点\/经过倒退/.test(seamOnly.message)) {
      reasons.push({ code: 'chapter_seam_cold_open', message: seamOnly.message })
    }
    const eventReplay = detectChapterBodyEventReplay({
      content,
      chapterNumber: args.chapterNumber,
      prevChapterBody: args.prevChapterTail,
      prevSnapshot: args.prevSnapshot,
    })
    if (eventReplay) {
      reasons.push({ code: 'chapter_event_replay', message: eventReplay.message })
    }
  }

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

    const coldOpen = detectChapterSeamColdOpen({
      content,
      chapterNumber: args.chapterNumber,
      prevChapterTail: args.prevChapterTail,
      chapterOutline: outline,
      prevSnapshot: args.prevSnapshot,
    })
    if (coldOpen && !reasons.some(r => r.code === 'chapter_seam_cold_open' && r.message === coldOpen.message)) {
      reasons.push({
        code: 'chapter_seam_cold_open',
        message: coldOpen.message,
      })
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

    const nextLeak = detectNextChapterBeatLeak({
      content,
      chapterOutline: outline,
      nextChapterOutline: args.nextChapterOutline,
    })
    if (nextLeak) reasons.push(nextLeak)

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
    '1. 第一段必须紧接【上章结尾】的时空与事态（同场景续写或合理短过渡）。',
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
    args.prevChapterTail?.trim()
      ? `【上章结尾（必须承接；开篇不得早于此处已发生事实）】\n${args.prevChapterTail.trim().slice(-1200)}`
      : '',
    args.chapterOutline?.trim()
      ? `【本章大纲】\n${args.chapterOutline.trim().slice(0, 800)}`
      : '',
    args.nextChapterOutline?.trim()
      ? `【下章大纲 — 禁止提前写】\n${args.nextChapterOutline.trim().slice(0, 500)}`
      : '',
    args.nextChapterHead?.trim()
      ? `【下章开篇（已写，本章章末须能承接）】\n${args.nextChapterHead.trim().slice(0, 800)}\n硬性：章末时空不得与下章开篇打架（如下章开篇在炕上，本章勿写成已出门远行）。`
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
        '上章末已完成态收束、本章有外来冲突：开篇窗口内须交代来者/起势（顺叙或先果后因均可）；禁止「重新/又把」重做收束，禁止整段不交代来者。',
        '上章入夜→本章清晨为日循环正向，可接日间拍点；上章正午/午后后写清晨须开篇写明跨日。',
        '结构以大纲+上章结尾为准，禁止照抄已丢弃旧文。',
      ].join('')
      : '',
    '只输出简体中文小说正文；不要标题行、不要说明。',
    '章末须停在大纲最后拍点附近；**删掉该拍点之后的全部越界后文**。',
    '正文完成态不得超过大纲最后拍点所允许的程度；下章情节禁止提前写。',
    '**字数**：须落在与生成相同的目标区间（见系统提示）；删掉越界后文后，**只在大纲已列拍点内**写厚/补场面与反应顶满区间，禁止把删掉的越界高潮再写回来，禁止灌水空话。',
    '人名一旦在正文中点明，后文叙述勿再用「那/这+双字泛称」反复代替该姓名。',
    '在场人物仅限上章末已出场与本章大纲点名者；禁止无交代使用「娘俩」「一家三口」等暗示未出场亲属的称谓。',
    draftBlock,
  ]
  return lines.filter(Boolean).join('\n\n')
}
