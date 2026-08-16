/**
 * 第1～8章爽型反同构：正文强信号簇对比上章
 * （章号上限与 APPEAL_L1_EXTENDED_MAX_CHAPTER 对齐，勿反向 import audit 以免环依赖）
 */

export const SHUANG_TYPE_SET = new Set([
  '硬撕',
  '拒签',
  '揭穿假账',
  '示弱钓鱼',
  '当众对赌',
  '借力第三方',
])

export const SHUANG_BODY_CLUSTERS: Record<string, RegExp> = {
  硬撕: /撕.{0,4}契|一撕两半|撕了契/,
  拒签: /拒签|不签|我不签/,
  揭穿假账: /假账|账对不上|造假/,
  示弱钓鱼: /示弱|先认|钓/,
  当众对赌: /对赌|(?:[一二两三四五六七八九十半]|[0-9]{1,2})天.*修|当着.{0,6}面/,
  借力第三方: /队长作证|会计|公社|派出所/,
}

/** 正文首次命中的爽型簇；无命中返回 null */
export function detectShuangCluster(content: string): string | null {
  const body = (content || '').replace(/\s+/g, '')
  for (const type of SHUANG_TYPE_SET) {
    const re = SHUANG_BODY_CLUSTERS[type]
    if (re && re.test(body)) return type
  }
  return null
}

/**
 * 第2～8章：与上章正文同爽型簇 → 硬拦。
 * 第1章跳过；缺 prior 时跳过正文对比。
 */
export function detectAppealShuangIsomorph(
  content: string,
  chapterNumber = 1,
  priorContent?: string,
): string | null {
  if (chapterNumber < 2 || chapterNumber > 8) return null
  if (!priorContent?.trim()) return null
  const cur = detectShuangCluster(content)
  const prior = detectShuangCluster(priorContent)
  if (cur && prior && cur === prior) {
    return `与上章爽型同构【${cur}】，须换打法`
  }
  return null
}
