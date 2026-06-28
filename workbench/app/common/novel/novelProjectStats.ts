import { countNovelChars } from './novelCharCount'

export type NovelProjectStats = {
  total: number
  written: number
  totalChars: number
}

export function computeNovelProjectStats(
  episodes: Array<{ content?: string | null }> | null | undefined,
): NovelProjectStats {
  const list = episodes || []
  const total = list.length
  const written = list.filter(e => (e.content || '').trim()).length
  const totalChars = list.reduce((sum, e) => sum + countNovelChars(e.content), 0)
  return { total, written, totalChars }
}
