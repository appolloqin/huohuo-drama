/** 单行展示用截断，超出 max 字符追加 … */
export function truncateText(text: string | null | undefined, max = 72): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}
