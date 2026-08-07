/** 与前端 countNovelChars 一致：按 Unicode 码点计字 */
export function countNovelChars(text: string | null | undefined): number {
  if (!text) return 0
  return [...text].length
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
