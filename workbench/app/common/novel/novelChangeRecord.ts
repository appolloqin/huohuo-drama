/** 编辑区只展示小说正文，【变更记录】为系统元数据 */
export function stripNovelChangeRecord(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const idx = trimmed.search(/^【变更记录】/m)
  if (idx < 0) return text
  return trimmed.slice(0, idx).replace(/\s+$/, '')
}
