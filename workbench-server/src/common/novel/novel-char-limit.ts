/** 与前端 countNovelChars 一致：按 Unicode 码点计字 */
export function countNovelChars(text: string | null | undefined): number {
  if (!text) return 0
  return [...text].length
}

/**
 * 目标字数区间硬门槛（与提示/补写 softMin≈0.97×minLen 对齐）。
 * 明显短于下限则抛错，禁止把半成品当成功交付。
 */
export function assertNovelChapterLengthBand(args: {
  text: string
  minLen: number
  maxLen?: number
  chapterNumber?: number
  /** 默认 false：过短硬拒；超上限不在此拦（另有压缩路径） */
  rejectOverMax?: boolean
}): void {
  const n = countNovelChars(args.text)
  const minLen = Math.max(0, Math.floor(Number(args.minLen) || 0))
  const maxLen = Math.max(0, Math.floor(Number(args.maxLen) || 0))
  if (minLen <= 0) return
  const softMin = Math.round(minLen * 0.97)
  if (n < softMin) {
    const ch = args.chapterNumber != null ? `第${args.chapterNumber}章` : '本章'
    throw new Error(
      `${ch}正文过短（${n} 字，目标区间至少约 ${minLen} 字），未达字数要求，已拒绝交付`,
    )
  }
  if (args.rejectOverMax && maxLen > 0 && n > Math.round(maxLen * 1.12)) {
    const ch = args.chapterNumber != null ? `第${args.chapterNumber}章` : '本章'
    throw new Error(
      `${ch}正文过长（${n} 字，上限约 ${maxLen} 字），超出字数区间，已拒绝交付`,
    )
  }
}

/**
 * M4 字数地板：禁止相对拼稿腰斩交付。
 * assembled 为润色/剥尾前基准；过短则回退 assembled。
 */
export function enforceAssembledLengthFloor(args: {
  assembled: string
  candidate: string
  minLen?: number
}): { text: string; rejected: boolean; floor: number } {
  const assembled = args.assembled?.trim() || ''
  const candidate = args.candidate?.trim() || ''
  if (!assembled) {
    return { text: candidate, rejected: false, floor: 0 }
  }
  const assembledChars = countNovelChars(assembled)
  const minLen = Math.max(0, Math.floor(Number(args.minLen) || 0))
  const floor = Math.max(
    minLen > 0 ? Math.round(minLen * 0.75) : 0,
    Math.round(assembledChars * 0.85),
  )
  // 短拼稿不触发（避免误伤本来就短的章）
  if (assembledChars < 800 || floor <= 0) {
    return { text: candidate || assembled, rejected: false, floor }
  }
  const outChars = countNovelChars(candidate)
  if (outChars < floor) {
    return { text: assembled, rejected: true, floor }
  }
  return { text: candidate, rejected: false, floor }
}
