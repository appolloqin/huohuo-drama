/**
 * 分拍写前合同：状态相容 + 有效起点 + 本拍 mustLand。
 * 主路径引导模型生成；不靠桥接词表，不点名书情。
 */
import type { ChapterEndSnapshot } from '../../common/novel/novel-continuity-state.js'
import { prevImpliesStableCopresence } from './novel-chapter-end-snapshot.js'
import {
  extractOutlineCatalystPhrases,
  findStaleOutlineBeats,
} from './novel-chapter-seam.js'
import {
  extractOutlineInfoDelta,
  infoDeltaPointCovered,
  outlineCatalystCoveredIn,
  splitInfoDeltaPointsForCover,
} from './novel-outline-beat-cover.js'

/** 从本拍任务文案解析【须本拍落地·大纲原文】条目 */
export function parseMustLandFromBeatText(beat: string): string[] {
  const t = beat || ''
  const m = t.match(/【须本拍落地[·・]?大纲原文】\s*\n([\s\S]*?)(?=\n【|\n以上 mustLand|\n硬性|$)/)
  const block = m?.[1] || ''
  if (!block.trim()) {
    // 兼容编号列表夹在任务里
    const lines = t.split('\n')
    const start = lines.findIndex(l => /须本拍落地/.test(l))
    if (start < 0) return []
    const out: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i]!.trim()
      if (!line || /^【/.test(line) || /^以上/.test(line) || /^硬性/.test(line)) break
      const body = line.replace(/^\d+[\.、．)]\s*/, '').trim()
      if ([...body].length >= 2) out.push(body)
    }
    return out
  }
  return block
    .split('\n')
    .map(l => l.replace(/^\d+[\.、．)]\s*/, '').trim())
    .filter(l => [...l].length >= 2 && !/^【/.test(l))
}

/**
 * 全章信息增量分拍说明（替代「每拍都塞全量须逐条落地」）。
 * 具体条目只出现在各拍【须本拍落地】里。
 */
export function buildChapterInfoDeltaDispatchNote(chapterOutline?: string): string {
  const delta = extractOutlineInfoDelta(chapterOutline)
  const points = splitInfoDeltaPointsForCover(delta)
  if (!points.length) return ''
  return [
    '【信息增量·分拍落地】',
    `本章共 ${points.length} 条信息增量；各条已挂到对应拍的【本拍写前合同·须落地】（【信息增量】标签本身不单独占拍）。`,
    '硬性：只场面化「本拍合同」列出的条目；未列入本拍的禁止抢写完成态；禁止第一拍写完全章增量。',
    '结果态条目须写已发生，禁止用尚未/仍欠/还没等旧态冒充。',
  ].join('\n')
}

export function buildBeatWriteContractBlock(args: {
  beatIndex: number
  beatTotal: number
  chapterNumber: number
  chapterOutline?: string
  mustLand?: string[]
  beatText?: string
  prevTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): string {
  const {
    beatIndex,
    beatTotal,
    chapterNumber,
    chapterOutline,
    prevTail,
    prevSnapshot,
  } = args
  const mustLand = (args.mustLand?.length
    ? args.mustLand
    : parseMustLandFromBeatText(args.beatText || ''))
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => [...s].length >= 2)
  const isFirst = beatIndex === 0
  const lines: string[] = [
    `【本拍写前合同 — 第 ${beatIndex + 1}/${beatTotal} 拍】`,
  ]

  if (isFirst && chapterNumber >= 2) {
    const snap = prevSnapshot
    const hasSnap = !!(
      snap?.time?.trim()
      || snap?.place?.trim()
      || snap?.cast?.trim()
      || snap?.last_event?.trim()
    )
    if (hasSnap && snap) {
      lines.push(
        '【上章末状态 — 开篇须相容】',
        `时间：${snap.time || '未明示'}；地点：${snap.place || '未明示'}；在场：${snap.cast || '未明示'}；刚发生：${snap.last_event || '未明示'}`,
        snap.closed_beats?.trim()
          ? `已闭合：${snap.closed_beats.trim()}（同场合勿再演完成态）`
          : '',
      )
    }
    lines.push(
      '【状态相容（手法自选）】',
      '开篇相对上章末须逻辑说得通：可同场续写、可切场/跨日/补叙框，也可进入大纲新起点。',
      '禁止：无任何使链条闭合的交代，以当前时把上章已完成的抵达/共处/收束再当「首次开场」重演。',
      '不要求固定桥接套话；只要求读者能明白「从上章末到此刻」如何接上。',
    )
    if (prevImpliesStableCopresence(prevTail, prevSnapshot)) {
      lines.push(
        '【在场提示】上章末已有稳定共处：开篇勿把已在场者写成尚未到达的首次登场；其新动作须建立在已在场或已交代离/回之后。',
      )
    }

    const stale = findStaleOutlineBeats(chapterOutline || '', prevTail || '')
    const catalysts = extractOutlineCatalystPhrases(chapterOutline || '')
    const pending = catalysts.filter(c =>
      !(prevTail || '').trim() || !outlineCatalystCoveredIn(prevTail || '', c),
    )
    const staleSet = new Set(stale.map(s => s.replace(/\s+/g, '')))
    const effectiveStart = pending.filter(c => !staleSet.has(c.replace(/\s+/g, '')))
    if (stale.length) {
      lines.push(
        '【已越过·勿重演】',
        ...stale.slice(0, 6).map((s, i) => `${i + 1}. ${s}`),
      )
    }
    if (effectiveStart.length) {
      lines.push(
        '【本章有效起点 — 须本拍推进】',
        ...effectiveStart.slice(0, 3).map((s, i) => `${i + 1}. ${s}`),
        '在状态相容前提下推进上述起点；禁止为命中字面而倒带上章已越过相位。',
      )
    } else if (stale.length || catalysts.length) {
      lines.push(
        '【本章有效起点】起因类要点已在前序落地或无可待落起点：轻锚状态后进入本拍 mustLand / 欲望阻碍，勿重演起因过程。',
      )
    }
  }

  if (mustLand.length) {
    lines.push(
      '【本拍须落地（只写这些）】',
      ...mustLand.map((m, i) => `${i + 1}. ${m}`),
      '以上须场面化；未列出的信息增量/后拍完成态禁止抢写。',
    )
  } else {
    lines.push('【本拍须落地】本拍无额外 mustLand 清单：只演本拍情绪职与任务文案，勿提前写后拍增量完成态。')
  }

  return lines.filter(Boolean).join('\n')
}

/** 本拍 mustLand 中属于信息增量的点是否已在正文覆盖（轻验收） */
export function beatMustLandInfoDeltaCovered(args: {
  content: string
  mustLand: string[]
  chapterOutline?: string
  amountContext?: string
}): { ok: boolean; missing: string[] } {
  const delta = extractOutlineInfoDelta(args.chapterOutline)
  const deltaPoints = new Set(splitInfoDeltaPointsForCover(delta).map(p => p.replace(/\s+/g, '')))
  if (!deltaPoints.size) return { ok: true, missing: [] }
  const contexts = [args.chapterOutline || '', args.amountContext || '']
  const missing: string[] = []
  for (const m of args.mustLand) {
    const key = m.replace(/\s+/g, '')
    if (!key) continue
    const isDelta = deltaPoints.has(key)
      || [...deltaPoints].some(d => d.includes(key) || key.includes(d))
    if (!isDelta) continue
    if (!infoDeltaPointCovered(args.content, m, { amountContexts: contexts })) {
      missing.push(m)
    }
  }
  return { ok: missing.length === 0, missing }
}
