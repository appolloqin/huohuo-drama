/**
 * 大纲拍点字数预算：把用户目标拆到拍点上，边界内写厚，末拍后 0 字。
 * 题材无关（相位名仅作提示标签；戏剧标签大纲优先用标签名，避免把「起因」误标成「铺垫」）。
 */
import { extractOutlineBeatItems } from './novel-chapter-seam.js'

const PHASE_LABELS_5 = ['铺垫', '起因', '发展', '高潮', '收束'] as const

function substantiveBeatItems<T extends { beat: string }>(items: T[]): T[] {
  return items.filter(b => [...b.beat].length >= 6)
}

/** 戏剧标签 → 提示相位（勿用序号硬套「铺垫/起因」） */
export function phaseLabelFromDramaTag(tag: string | undefined): string | null {
  if (!tag) return null
  const map: Record<string, string> = {
    本章起因: '起因',
    欲望: '欲望',
    阻碍: '阻碍',
    局面变化: '局面变化',
    人物选择: '人物选择',
    章末问题: '收束',
    信息增量: '信息增量',
  }
  return map[tag] || null
}

/** 按拍点数返回归一化前权重 */
export function beatWeightTemplate(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [1]
  if (n === 2) return [0.4, 0.6]
  if (n === 3) return [0.2, 0.45, 0.35]
  if (n === 4) return [0.15, 0.25, 0.4, 0.2]
  // ≥5：前 4 个用经典比例，其余并入「发展」均分
  const base = [0.12, 0.18, 0.35, 0.22, 0.13]
  if (n === 5) return base
  const mid = base[2]!
  const extra = n - 5
  const midEach = mid / (1 + extra)
  const out = [base[0]!, base[1]!, midEach]
  for (let i = 0; i < extra; i++) out.push(midEach)
  out.push(base[3]!, base[4]!)
  return out
}

function phaseLabelForIndex(i: number, n: number): string {
  if (n === 1) return '收束'
  if (n === 2) return i === 0 ? '铺垫' : '收束'
  if (n === 3) return (['铺垫', '发展', '收束'] as const)[i]!
  if (n === 4) return (['铺垫', '起因', '发展', '收束'] as const)[i]!
  if (n === 5) return PHASE_LABELS_5[i]!
  // ≥6：首=铺垫，次=起因，末=收束，末二=高潮，中间=发展
  if (i === 0) return '铺垫'
  if (i === 1) return '起因'
  if (i === n - 1) return '收束'
  if (i === n - 2) return '高潮'
  return '发展'
}

export type ChapterBeatBudgetItem = {
  index: number
  phase: string
  beat: string
  /** 戏剧标签（若有） */
  tag?: string
  targetChars: number
  minChars: number
  maxChars: number
}

export type ChapterBeatBudget = {
  beatCount: number
  userTarget: number
  items: ChapterBeatBudgetItem[]
  promptBlock: string
}

/**
 * 将 userTarget 分配到大纲拍点；无拍点时返回空预算（仅总目标提示）。
 */
export function resolveChapterBeatBudgets(args: {
  chapterOutline?: string
  userTarget: number
  endpointPending?: boolean
}): ChapterBeatBudget {
  const userTarget = Math.min(20000, Math.max(500, Math.round(Number(args.userTarget)) || 3000))
  const beatItems = substantiveBeatItems(extractOutlineBeatItems(args.chapterOutline || ''))
  const n = beatItems.length
  if (n === 0) {
    return {
      beatCount: 0,
      userTarget,
      items: [],
      promptBlock: `【篇幅预算】目标合计 ${userTarget} 字；本章大纲拍点不足，请严格按【本章大纲】写厚，禁止发明大纲未列后续；写到大纲末拍即停。`,
    }
  }

  const weights = beatWeightTemplate(n)
  const sumW = weights.reduce((a, b) => a + b, 0) || 1
  const raw = weights.map(w => Math.round(userTarget * (w / sumW)))
  // 微调合计为 userTarget
  let diff = userTarget - raw.reduce((a, b) => a + b, 0)
  let cursor = Math.floor(n / 2)
  while (diff !== 0 && n > 0) {
    const step = diff > 0 ? 1 : -1
    raw[cursor] = Math.max(50, (raw[cursor] || 0) + step)
    diff -= step
    cursor = (cursor + 1) % n
  }

  const pending = !!args.endpointPending
  const items: ChapterBeatBudgetItem[] = beatItems.map((item, i) => {
    const targetChars = raw[i] || 50
    const isLast = i === n - 1
    const lo = Math.max(40, Math.floor(targetChars * 0.85))
    const hi = Math.max(lo + 20, Math.ceil(targetChars * (pending && isLast ? 1.08 : 1.15)))
    const phase = phaseLabelFromDramaTag(item.tag) || phaseLabelForIndex(i, n)
    return {
      index: i + 1,
      phase,
      beat: item.beat,
      tag: item.tag,
      targetChars,
      minChars: lo,
      maxChars: hi,
    }
  })

  const lines = items.map(
    it => `${it.index}. [${it.phase}] ${it.beat} → 约 ${it.minChars}～${it.maxChars} 字（目标 ${it.targetChars}）`,
  )
  const firstPhase = items[0]?.phase || '首拍'
  const promptBlock = [
    '【篇幅预算 — 须遵守】',
    `用户目标合计 ${userTarget} 字；只允许在下列拍点内按序写厚；写完最后一拍即停；最后一拍之后预算为 0 字（禁止新场面/新人物登门/新完成态）。`,
    ...lines,
    `第2章起：开篇轻锚（一句点场合）合计 ≤ ${firstPhase}拍约 8%，禁止为接缝复述上章闭合场面。`,
    '相位标签与拍点文案一致：标「起因」的拍必须写该起因由本章人物落地；待落地起因时接缝不喂上章末原文。',
    '优先级：已发生事实（勿回放）> 大纲边界 > 本预算 > 旧稿结构；某拍写不够可在该拍内加反应与细节，禁止挪用「末拍之后」的篇幅。',
  ].join('\n')

  return { beatCount: n, userTarget, items, promptBlock }
}

/** 超预算时截到最近句末；找不到则硬切。 */
export function truncateProseToCharBudget(text: string, maxChars: number): string {
  const raw = (text || '').trim()
  if (!raw) return ''
  const limit = Math.max(8, Math.round(maxChars))
  const chars = [...raw]
  if (chars.length <= limit) return raw
  const head = chars.slice(0, limit).join('')
  const sentence = head.match(/^[\s\S]*[。！？…」』》】]/)
  if (sentence && [...sentence[0]].length >= Math.floor(limit * 0.55)) {
    return sentence[0].trim()
  }
  const soft = head.match(/^[\s\S]*[，；、]/)
  if (soft && [...soft[0]].length >= Math.floor(limit * 0.5)) {
    return soft[0].trim()
  }
  return head.trim()
}

/** 是否走按拍顺序生成（P1） */
export function shouldUseBeatSequentialGenerate(args: {
  beatCount: number
  enabled?: boolean
}): boolean {
  if (args.enabled === false) return false
  return args.beatCount >= 2
}
