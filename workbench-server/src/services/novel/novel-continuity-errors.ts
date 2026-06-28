/** 一致性修正无法继续 — 批量撰写须整批终止 */

export type ContinuityAbortReason = 'max_attempts' | 'same_issue_loop' | 'stagnant_rewrite'

export class ContinuityRewriteAbortError extends Error {
  readonly chapterNumber: number
  readonly rewriteAttempts: number
  readonly score: number
  readonly conflicts: string[]
  readonly summary: string
  readonly reason: ContinuityAbortReason

  constructor(args: {
    chapterNumber: number
    rewriteAttempts: number
    score: number
    conflicts: string[]
    summary: string
    reason: ContinuityAbortReason
    rewriteMax?: number
    sameIssueStreak?: number
  }) {
    const conflictText = formatConflictsBrief(args.conflicts)
    const message = args.reason === 'max_attempts'
      ? [
        `批量撰写已停止：第 ${args.chapterNumber} 章一致性修正已达上限（${args.rewriteMax ?? args.rewriteAttempts} 次）仍未通过（${args.score} 分）。`,
        conflictText ? `须修正：${conflictText}` : '',
        args.summary ? `审校结论：${args.summary}` : '',
      ].filter(Boolean).join(' ')
      : args.reason === 'stagnant_rewrite'
        ? [
          `批量撰写已停止：第 ${args.chapterNumber} 章修正后正文连续 ${args.sameIssueStreak ?? 5} 轮未变化（已修正 ${args.rewriteAttempts} 次，${args.score} 分；上限 ${args.rewriteMax ?? 30} 次/章）。`,
          conflictText ? `须修正：${conflictText}` : '',
          args.summary ? `审校结论：${args.summary}` : '',
        ].filter(Boolean).join(' ')
        : [
          `批量撰写已停止：第 ${args.chapterNumber} 章同一审校问题且正文未变已连续 ${args.sameIssueStreak ?? 3} 轮（已修正 ${args.rewriteAttempts} 次，${args.score} 分；上限 ${args.rewriteMax ?? 30} 次/章）。`,
          conflictText ? `须修正：${conflictText}` : '',
          args.summary ? `审校结论：${args.summary}` : '',
        ].filter(Boolean).join(' ')

    super(message)
    this.name = 'ContinuityRewriteAbortError'
    this.chapterNumber = args.chapterNumber
    this.rewriteAttempts = args.rewriteAttempts
    this.score = args.score
    this.conflicts = args.conflicts
    this.summary = args.summary
    this.reason = args.reason
  }
}

export function formatConflictsBrief(conflicts: string[]): string {
  if (!conflicts.length) return ''
  return conflicts.map((c, i) => `${i + 1}. ${c}`).join(' ')
}

export function isContinuityRewriteAbortError(err: unknown): err is ContinuityRewriteAbortError {
  return err instanceof ContinuityRewriteAbortError
}

/** 修正耗尽 / 同一问题死循环：必须终止整个批量流程（不受 batch_stop_on_error 影响） */
export function mustAbortBatchOnContinuityError(err: unknown): boolean {
  return isContinuityRewriteAbortError(err)
}
