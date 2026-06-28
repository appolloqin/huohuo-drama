/** 章节展示标题：优先 episode.title，过滤默认「第N章」 */
export function isGenericChapterTitle(title: string | null | undefined, chapterNumber: number) {
  const t = (title || '').trim()
  if (!t) return true
  return new RegExp(`^第\\s*${chapterNumber}\\s*章\\s*$`).test(t)
}

export function chapterDisplayTitle(ep: {
  title?: string
  episode_number?: number
  episodeNumber?: number
  display_title?: string
}) {
  if (ep.display_title?.trim()) return ep.display_title.trim()
  const num = ep.episode_number ?? ep.episodeNumber ?? 0
  const t = (ep.title || '').trim()
  if (t && !isGenericChapterTitle(t, num)) return t
  return t || (num ? `第${num}章` : '')
}
