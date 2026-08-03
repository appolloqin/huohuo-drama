/** 文内标签解析（Skill 契约，无 DB schema） */

export type ChapterRole = 'hook_setup' | 'pressure' | 'payoff' | 'breath' | 'travel'

export type ChapterCraftTags = {
  role: ChapterRole | null
  emotionDebt: string | null
  promise: string | null
  stage: string | null
  endingQuestion: string | null
}

const ROLE_SET = new Set<string>(['hook_setup', 'pressure', 'payoff', 'breath', 'travel'])

function matchLine(text: string, label: string): string | null {
  const re = new RegExp(`【${label}】\\s*([^\\n]+)`)
  const m = text.match(re)
  return m?.[1]?.trim() || null
}

export function parseChapterCraftTags(...chunks: Array<string | null | undefined>): ChapterCraftTags {
  const blob = chunks.filter(Boolean).join('\n')
  const roleRaw = matchLine(blob, '章职')
  const role = roleRaw && ROLE_SET.has(roleRaw.split(/[\s|/]/)[0]!)
    ? (roleRaw.split(/[\s|/]/)[0] as ChapterRole)
    : (roleRaw && ROLE_SET.has(roleRaw) ? roleRaw as ChapterRole : null)

  return {
    role,
    emotionDebt: matchLine(blob, '情绪债'),
    promise: matchLine(blob, '承诺'),
    stage: matchLine(blob, '舞台'),
    endingQuestion: matchLine(blob, '章末问题'),
  }
}

/** breath/travel 建议更短目标字数系数 */
export function lengthFactorForRole(role: ChapterRole | null): number {
  if (role === 'breath' || role === 'travel') return 0.55
  if (role === 'pressure' || role === 'hook_setup') return 0.9
  return 1
}
