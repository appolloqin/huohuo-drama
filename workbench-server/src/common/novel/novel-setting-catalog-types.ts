/** 立项设定目录条目类型与过滤 */

export type NovelSettingCatalogEntry = {
  id: string
  label: string
  summary: string
  /** 适用主题材 skillKey；空数组 = 全题材可用 */
  genreSkillKeys: string[]
  injectPrompt: string
  status: 'active' | 'planned' | 'deprecated'
}

export function filterCatalogByGenre(
  entries: NovelSettingCatalogEntry[],
  genreSkillKey?: string,
): NovelSettingCatalogEntry[] {
  const key = (genreSkillKey || '').trim()
  return entries.filter(e => {
    if (e.status !== 'active') return false
    if (!e.genreSkillKeys.length) return true
    if (!key) return true
    return e.genreSkillKeys.includes(key)
  })
}

export function findActiveCatalogEntry(
  entries: NovelSettingCatalogEntry[],
  id?: string,
): NovelSettingCatalogEntry | undefined {
  const i = (id || '').trim()
  if (!i) return undefined
  return entries.find(e => e.id === i && e.status === 'active')
}
