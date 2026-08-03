/**
 * 本章大纲 / 写作说明落实：章末钩子与「未完成态」不得被正文提前写完。
 *
 * 题材无关：只认说明里的未完成标记（即将/还没/准备…）与章末是否仍保留该标记；
 * 不针对具体物件、人物或场面词。
 */

function normalizeLite(s: string): string {
  return s.replace(/\s+/g, '').replace(/[，。！？、；：…—\-~·"'「」『』“”]/g, '')
}

const PENDING_MARK = /即将|正要|准备|还没|尚未|快要/g

/** 从大纲/说明中抽出须对齐的硬性句子（按标签/未完成态，不按题材词） */
export function extractWritingSpecKeyLines(brief?: string, outline?: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const src of [brief, outline]) {
    if (!src?.trim()) continue
    for (const raw of src.split(/\n+/)) {
      const t = raw.trim()
      if (t.length < 6) continue
      if (!/章末钩子|情节目标|章末|钩子|即将|还没|尚未|准备|不得|禁止|必须|勿|不要/.test(t)) continue
      const key = normalizeLite(t).slice(0, 40)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t.length > 140 ? `${t.slice(0, 140)}…` : t)
      if (out.length >= 10) return out
    }
  }
  return out
}

/**
 * 写作规格硬块：注入生成/重写 prompt（规则通用，举例仅说明「未完成→已完成」关系）。
 */
export function buildWritingSpecHardBlock(args: {
  writingBrief?: string
  chapterOutline?: string
}): string {
  const brief = args.writingBrief?.trim() || ''
  const outline = args.chapterOutline?.trim() || ''
  if (!brief && !outline) return ''

  const keys = extractWritingSpecKeyLines(brief, outline)
  return [
    '【本章写作规格 — 硬性（高于自由发挥）】',
    '1. 【本章大纲】与【写作说明】中的情节目标、场景状态、**章末钩子**必须落实；禁止擅自改结局或提前完成钩子指向的动作。',
    '2. 正文完成态不得超过大纲最后拍点所允许的程度（过程态不得写成结果态）；禁止提前写下章主情节。',
    '3. 若说明/大纲用「即将 / 还没 / 尚未 / 准备 / 正要」标出未完成态，章末必须仍停在该未完成态；禁止写成已经发生。',
    '4. 写作说明中的章末钩子优先于「写得更刺激」的冲动；大纲较简时不得用更强高潮覆盖钩子。',
    keys.length
      ? `5. 须对齐要点（摘自本章说明/大纲）：\n${keys.map((l, i) => `  ${i + 1}) ${l}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n')
}

/**
 * 轻量检测：说明要求「即将/还没…」而章末已写成完成态。
 * 仅用说明原文片段是否在章末出现、且章末已无未完成标记——不依赖题材词表。
 */
export function detectBriefPendingStateOvershoot(args: {
  content: string
  writingBrief?: string
  chapterOutline?: string
}): { clause: string; message: string } | null {
  const spec = [args.writingBrief, args.chapterOutline].filter(Boolean).join('\n')
  const ending = args.content.trim().slice(-900)
  if (!spec.trim() || ending.length < 40) return null

  const clauses = [...spec.matchAll(/([^。！？\n]{4,48}(?:即将|正要|准备|还没|尚未|快要)[^。！？\n]{0,36})/g)]
    .map(m => m[1]?.trim())
    .filter((x): x is string => !!x && x.length >= 6)

  if (!clauses.length) return null

  const endTail = ending.slice(-500)
  const endNorm = normalizeLite(endTail)
  // 章末仍带未完成标记 → 钩子保留
  if (PENDING_MARK.test(endTail)) {
    PENDING_MARK.lastIndex = 0
    return null
  }

  for (const clause of clauses) {
    // 只取「未完成标记」前后的载荷（去掉标签前缀噪音），再在章末找同一载荷
    const focusRaw = clause
      .replace(/^[^：:]{0,12}[：:]\s*/, '')
      .replace(PENDING_MARK, '')
      .replace(/的瞬间|之时|的一刻/g, '')
    PENDING_MARK.lastIndex = 0
    const core = normalizeLite(focusRaw)
    if (core.length < 4) continue

    let hit = false
    const maxW = Math.min(12, core.length)
    for (let w = maxW; w >= 4; w--) {
      for (let i = 0; i <= core.length - w; i++) {
        if (endNorm.includes(core.slice(i, i + w))) {
          hit = true
          break
        }
      }
      if (hit) break
    }
    if (hit) {
      return {
        clause,
        message:
          `写作规格未落实：说明要求「${clause.slice(0, 36)}…」停在未完成态，但章末已写成完成态。请改回钩子瞬间，勿提前写完。`,
      }
    }
  }
  return null
}
