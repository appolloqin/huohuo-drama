/**
 * 大纲边界对齐（生成前）：裁剪与大纲末拍冲突的写作说明，剔除与本章大纲零重叠的情节子句，
 * 标记重写旧稿越界，产出边界硬块。题材无关。
 */
import { extractOutlineBeatPhrases, phraseAppearsIn } from './novel-chapter-seam.js'
import { detectOutlineCompliance } from './novel-outline-compliance.js'

/** 大纲末拍：尚未落地的进行态（章末宜停在此处） */
const PENDING_MARK = /决定|准备|打算|即将|尚未|还没|暂时|正要|快要/

/** 写作说明子句：已收束/已办成（易写出大纲未列的后续） */
const DONE_MARK = /完成|解决|收场|了结|写完|落地|办妥|结束/

/** 风格/参数类子句：可保留（即使不与大纲字面重叠） */
const BRIEF_META_KEEP = /情绪|氛围|基调|口语|文风|字数|目标字|续写|上下文|建议出场|出场人物|场景氛围/

/** 情节驱动子句：无大纲重叠时剔除（防把他章起势说明塞进本章） */
const BRIEF_PLOT_DRIVE = /情节目标|篇幅侧重|须写|重点刻画|破局|第一步|建议结构|本章须|开场铺垫|环境适应|追踪过程/

/**
 * 旧章起势骨架（题材无关）：出门/叮嘱/居家准备等——无大纲重叠时一律剔除。
 * 不列举猎物/陷阱等场面词。
 */
const BRIEF_STRUCTURAL_SETUP =
  /离别|叮嘱|出门前|出门|离家|锁门|居家|门槛|炕上|刚醒|穿好|准备停当|开场铺垫|目送|送别|喝口再走/

/** 元说明里易诱发「日循环重开」的时空/送别措辞（无大纲重叠时剔除或清洗） */
const BRIEF_SETUP_CUE = /目送|送别|叮嘱|清晨|黎明|天没亮|刚醒|炕沿|门槛|离家时|出门前/

export type NovelOutlineBoundaryAlignment = {
  lastBeat: string
  endpointPending: boolean
  boundaryBlock: string
  alignedBrief: string
  conflictNotes: string[]
  draftConflictsOutline: boolean
}

function splitBriefClauses(brief: string): string[] {
  return brief
    .split(/[。！？\n]+|(?=\d+[\.．、]\s*)/)
    .map(s => s.trim())
    .filter(s => s.length >= 4)
}

function briefClauseOverlapsOutline(clause: string, beats: string[]): boolean {
  return beats.some(b => phraseAppearsIn(clause, b) || phraseAppearsIn(b, clause))
}

/** 清洗出场/氛围句中的送别与日循环起势括注 */
function sanitizeMetaClause(clause: string): string {
  let s = clause
    .replace(/[（(][^）)]{0,40}(?:目送|送别|叮嘱|锁门|出门)[^）)]{0,20}[）)]/g, '')
    .replace(/从离家时的[^，。；]{0,24}/g, '')
    .replace(/，?\s*清晨至上午/g, '')
    .replace(/，?\s*清晨/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return s
}

/**
 * 结构作废时：只留无起势污染的人物/情绪；禁止目送/清晨等把开篇拽回离家。
 */
export function extractBriefNonStructuralMeta(brief: string): string {
  const lines: string[] = []
  for (const clause of splitBriefClauses(brief)) {
    if (BRIEF_PLOT_DRIVE.test(clause) || BRIEF_STRUCTURAL_SETUP.test(clause)) continue
    if (!BRIEF_META_KEEP.test(clause)) continue
    if (BRIEF_SETUP_CUE.test(clause) && !/情绪基调|专注|冷冽|口语|文风/.test(clause)) {
      const cleaned = sanitizeMetaClause(clause)
      if (!cleaned || BRIEF_SETUP_CUE.test(cleaned) || [...cleaned].length < 6) continue
      if ([...cleaned].length > 100) continue
      lines.push(cleaned)
    } else {
      const cleaned = sanitizeMetaClause(clause)
      if (!cleaned || [...cleaned].length < 6) continue
      if ([...cleaned].length > 100) continue
      lines.push(cleaned)
    }
    if (lines.length >= 4) break
  }
  if (!lines.length) return ''
  return ['【文风/人物参考（无结构效力）】', ...lines].join('\n')
}

/** 旧稿/说明结构作废时：只用大纲拍点驱动开篇与骨架 */
export function buildOutlineOnlyWritingStub(outline?: string): string {
  const beats = outline?.trim()
    ? extractOutlineBeatPhrases(outline).slice(0, 10)
    : []
  return [
    '【结构以本章大纲为准 — 写作说明结构段已作废】',
    beats.length
      ? `须按序落实：\n${beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
      : '须严格按【本章大纲】拍点推进。',
    '开篇承接上章结尾已发生事实之后；禁止按已作废的写作说明起势重开。',
  ].join('\n')
}

/**
 * 剔除与本章大纲拍点零重叠的情节子句（题材无关）。
 * 保留氛围/人物/字数等元说明；情节目标与篇幅侧重须能挂上大纲拍点。
 */
export function pruneBriefToOutlineBeats(brief: string, outline: string): {
  brief: string
  dropped: string[]
} {
  const beats = extractOutlineBeatPhrases(outline)
  const src = brief.trim()
  if (!src || !beats.length) return { brief: src, dropped: [] }

  const clauses = splitBriefClauses(src)
  if (clauses.length < 2) return { brief: src, dropped: [] }

  const kept: string[] = []
  const dropped: string[] = []
  for (const clause of clauses) {
    const setup = BRIEF_STRUCTURAL_SETUP.test(clause)
    const plot = BRIEF_PLOT_DRIVE.test(clause)
    const meta = BRIEF_META_KEEP.test(clause)
    const overlap = briefClauseOverlapsOutline(clause, beats)

    // 起势骨架 / 情节驱动：无大纲重叠则丢
    if ((setup || plot) && !overlap) {
      dropped.push(clause.slice(0, 48))
      continue
    }
    // 元说明若夹带起势骨架/日循环线索且无重叠 → 丢或清洗
    if (meta && (setup || BRIEF_SETUP_CUE.test(clause)) && !overlap) {
      const cleaned = sanitizeMetaClause(clause)
      if (cleaned && [...cleaned].length >= 8 && !BRIEF_SETUP_CUE.test(cleaned) && !BRIEF_STRUCTURAL_SETUP.test(cleaned)) {
        kept.push(cleaned)
      } else {
        dropped.push(clause.slice(0, 48))
      }
      continue
    }
    if (meta && !plot) {
      const cleaned = sanitizeMetaClause(clause)
      if (cleaned) kept.push(cleaned)
      continue
    }
    if (overlap) {
      kept.push(clause)
      continue
    }
    if (plot || [...clause].length >= 16) {
      dropped.push(clause.slice(0, 48))
      continue
    }
    kept.push(clause)
  }

  if (!dropped.length) return { brief: src, dropped: [] }

  const stub = [
    '【写作说明已按本章大纲裁剪】与大纲拍点无关的旧起势/过期情节要求已剔除；结构以本章大纲为准。',
    `须落实拍点：${beats.slice(0, 8).join('；')}`,
  ].join('\n')

  if (!kept.length) return { brief: stub, dropped }

  return {
    brief: `${kept.join('。')}。\n${stub}`,
    dropped,
  }
}

function isEndpointPending(lastBeat: string): boolean {
  if (!lastBeat.trim()) return false
  return PENDING_MARK.test(lastBeat)
}

function buildBoundaryBlock(args: {
  beats: string[]
  lastBeat: string
}): string {
  const { beats, lastBeat } = args
  if (!lastBeat && !beats.length) return ''
  const lines = ['【本章大纲边界】']
  if (beats.length) {
    lines.push('- 须覆盖：')
    lines.push(...beats.slice(0, 10).map((b, i) => `  ${i + 1}) ${b}`))
  }
  if (lastBeat) {
    lines.push(`- **章末硬止点**：「${lastBeat}」——写到该拍点的完成程度即收束，禁止再写其后场面`)
    lines.push('- **完成态上限**：正文不得越过该拍点所允许的完成程度；大纲未写的下一阶段结果禁止提前写')
    lines.push('- **勿展开**：该拍点之后、本章大纲未列的后续（含新人物登门、新冲突收束、新完成态）')
    lines.push('- **人物**：仅上章末已出场者与本章大纲点名者；禁止无交代的「娘俩/一家三口」等未出场亲属称谓')
    lines.push('- **字数**：只在本章大纲已列拍点内写到目标附近；宁可略短，禁止用大纲未列情节凑字')
    lines.push('- **自检**：若去掉末拍之后的全部后文，本章情节是否仍完整？若是，那些后文即越界，勿写')
  }
  lines.push('- 写作说明或旧稿与上冲突时，一律以本章大纲边界为准；有下章大纲时只作禁写边界，禁止提前写')
  return lines.join('\n')
}

/**
 * 对齐本章大纲边界与写作说明；重写时可检测旧稿是否越出大纲。
 */
export function alignNovelChapterOutlineBoundary(args: {
  chapterOutline?: string
  writingBrief?: string
  existingText?: string
  mode?: 'generate' | 'rewrite' | 'continue'
  chapterNumber?: number
}): NovelOutlineBoundaryAlignment {
  const outline = args.chapterOutline?.trim() || ''
  const brief = args.writingBrief?.trim() || ''
  const beats = outline ? extractOutlineBeatPhrases(outline) : []
  const lastBeat = beats.length ? beats[beats.length - 1]! : (outline.slice(0, 40) || '')
  const endpointPending = isEndpointPending(lastBeat)
  const conflictNotes: string[] = []

  let alignedBrief = brief
  if (brief && endpointPending) {
    const kept: string[] = []
    const dropped: string[] = []
    for (const clause of splitBriefClauses(brief)) {
      if (DONE_MARK.test(clause) && !PENDING_MARK.test(clause)) {
        dropped.push(clause)
        continue
      }
      kept.push(clause)
    }
    if (dropped.length) {
      conflictNotes.push(
        `写作说明含已收束目标，与大纲末拍「${lastBeat}」冲突，已降级：${dropped.slice(0, 2).join('；')}`,
      )
      const stub = `本章止于大纲末拍「${lastBeat}」；下列目标留后章，本章不得写完：${dropped.join('；')}`
      alignedBrief = kept.length
        ? `${kept.join('。')}。\n${stub}`
        : stub
    }
  }

  // 与本章大纲零重叠的情节子句（常见：他章写作说明误挂到本章）
  if (alignedBrief && outline) {
    const pruned = pruneBriefToOutlineBeats(alignedBrief, outline)
    if (pruned.dropped.length) {
      conflictNotes.push(
        `写作说明含与本章大纲无关的情节要求，已剔除：${pruned.dropped.slice(0, 3).join('；')}`,
      )
      alignedBrief = pruned.brief
    }
  }

  let draftConflictsOutline = false
  const existing = args.existingText?.trim() || ''
  if (existing && outline && (args.mode === 'rewrite' || args.mode === 'continue')) {
    const check = detectOutlineCompliance({
      content: existing,
      chapterOutline: outline,
      writingBrief: brief || undefined,
      existingText: existing,
      chapterNumber: args.chapterNumber ?? 1,
    })
    if (check.reasons.some(r =>
      r.code === 'outline_endpoint_overshoot'
      || r.code === 'next_chapter_beat_leak'
      || r.code === 'outline_boundary_model',
    )) {
      draftConflictsOutline = true
      conflictNotes.push(
        args.mode === 'continue'
          ? '已有正文超出本章大纲边界，续写以大纲为准，勿再展开大纲未列的后续'
          : '旧稿超出本章大纲边界，重写以大纲为准，勿按旧稿越界结构展开',
      )
    }
  }

  const boundaryBlock = buildBoundaryBlock({ beats, lastBeat })

  return {
    lastBeat,
    endpointPending,
    boundaryBlock,
    alignedBrief: alignedBrief || brief,
    conflictNotes,
    draftConflictsOutline,
  }
}
