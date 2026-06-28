type DramaStyleItem = {
  value: string
  cn: string
  en: string
  group: string
  aliases?: string[]
}

export const DRAMA_STYLE_CATALOG: DramaStyleItem[] = [
  { value: 'realistic', cn: '写实', en: 'Realistic', group: '基础', aliases: ['realism', '写实风'] },
  { value: 'cinematic', cn: '电影感', en: 'Cinematic', group: '基础', aliases: ['film still', '电影风格'] },
  { value: 'anime', cn: '动漫', en: 'Anime / Manga', group: '基础', aliases: ['二次元', '漫画', '日系动漫'] },
  { value: 'digital art', cn: '数字艺术', en: 'Digital Art', group: '基础', aliases: [] },
  { value: 'watercolor', cn: '水彩', en: 'Watercolor', group: '基础', aliases: ['水彩画'] },
  { value: 'pixel art', cn: '像素艺术', en: 'Pixel Art', group: '基础', aliases: [] },
  { value: 'paper cutout illustration', cn: '剪纸插画', en: 'Paper Cutout Illustration', group: '基础', aliases: ['剪纸插画风格'] },

  { value: 'cyberpunk', cn: '赛博朋克', en: 'Cyberpunk', group: '朋克/未来', aliases: ['赛博朋克风格'] },
  { value: 'steampunk', cn: '蒸汽朋克', en: 'Steampunk', group: '朋克/未来', aliases: [] },
  { value: 'dieselpunk', cn: '柴油朋克', en: 'Dieselpunk', group: '朋克/未来', aliases: [] },
  { value: 'solarpunk', cn: '太阳朋克', en: 'Solarpunk', group: '朋克/未来', aliases: ['serpunk'] },
  { value: 'lunarpunk', cn: '月亮朋克', en: 'Lunarpunk', group: '朋克/未来', aliases: [] },
  { value: 'biopunk', cn: '生物朋克', en: 'Biopunk', group: '朋克/未来', aliases: [] },
  { value: 'atompunk', cn: '原子朋克', en: 'Atompunk', group: '朋克/未来', aliases: [] },
  { value: 'gothpunk', cn: '哥特朋克', en: 'Gothpunk', group: '朋克/未来', aliases: [] },
  { value: 'retrofuturism', cn: '复古未来主义', en: 'Retrofuturism', group: '朋克/未来', aliases: [] },
  { value: 'synthwave', cn: '合成波', en: 'Synthwave', group: '朋克/未来', aliases: [] },
  { value: 'vaporwave', cn: '蒸发波', en: 'Vaporwave', group: '朋克/未来', aliases: [] },
  { value: 'science fiction', cn: '科幻', en: 'Science Fiction', group: '朋克/未来', aliases: ['科幻小说', 'sci-fi'] },

  { value: 'fantasy', cn: '幻想', en: 'Fantasy', group: '幻想/氛围', aliases: [] },
  { value: 'dark fantasy', cn: '黑暗幻想', en: 'Dark Fantasy', group: '幻想/氛围', aliases: [] },
  { value: 'gothic', cn: '哥特', en: 'Gothic', group: '幻想/氛围', aliases: [] },
  { value: 'surrealism', cn: '超现实主义', en: 'Surrealism', group: '幻想/氛围', aliases: [] },
  { value: 'chinoiserie', cn: '中国风', en: 'Chinoiserie', group: '幻想/氛围', aliases: [] },
  { value: 'dunhuang art', cn: '敦煌艺术', en: 'Dunhuang Art', group: '幻想/氛围', aliases: [] },
  { value: 'sumi-e', cn: '日本水墨画', en: 'Sumi-e', group: '幻想/氛围', aliases: ['水墨风'] },

  { value: 'impressionism', cn: '印象派', en: 'Impressionism', group: '艺术史', aliases: [] },
  { value: 'expressionism', cn: '表现主义', en: 'Expressionism', group: '艺术史', aliases: [] },
  { value: 'cubism', cn: '立体派', en: 'Cubism', group: '艺术史', aliases: [] },
  { value: 'pop art', cn: '波普艺术', en: 'Pop Art', group: '艺术史', aliases: ['popart'] },
  { value: 'minimalism', cn: '极简主义', en: 'Minimalism', group: '艺术史', aliases: ['minimalist design'] },
  { value: 'maximalism', cn: '极致主义', en: 'Maximalism', group: '艺术史', aliases: [] },
]

export function buildDramaStyleSelectOptions() {
  const grouped = new Map<string, Array<{ value: string; label: string; searchText?: string }>>()
  for (const item of DRAMA_STYLE_CATALOG) {
    if (!grouped.has(item.group)) grouped.set(item.group, [])
    grouped.get(item.group)!.push({
      value: item.value,
      label: `${item.cn} · ${item.en}`,
      searchText: [item.cn, item.en, ...(item.aliases || [])].join(' '),
    })
  }
  return Array.from(grouped.entries()).map(([label, options]) => ({ label, options }))
}

export function mergeDramaStyleCatalog(remote: any[] | null | undefined): DramaStyleItem[] {
  if (!Array.isArray(remote) || !remote.length) return DRAMA_STYLE_CATALOG
  const normalized = remote
    .map((item) => ({
      value: String(item?.value || '').trim(),
      cn: String(item?.cn || item?.value || '').trim(),
      en: String(item?.en || item?.value || '').trim(),
      group: String(item?.group || '其它').trim(),
      aliases: Array.isArray(item?.aliases) ? item.aliases.map((s: any) => String(s || '').trim()).filter(Boolean) : [],
    }))
    .filter((item) => !!item.value)
  return normalized.length ? normalized : DRAMA_STYLE_CATALOG
}

export function buildDramaStyleSelectOptionsFromCatalog(catalog: DramaStyleItem[]) {
  const grouped = new Map<string, Array<{ value: string; label: string; searchText?: string }>>()
  for (const item of catalog) {
    if (!grouped.has(item.group)) grouped.set(item.group, [])
    grouped.get(item.group)!.push({
      value: item.value,
      label: `${item.cn} · ${item.en}`,
      searchText: [item.cn, item.en, ...(item.aliases || [])].join(' '),
    })
  }
  return Array.from(grouped.entries()).map(([label, options]) => ({ label, options }))
}

export function dramaStyleLabelFromCatalog(catalog: DramaStyleItem[], value: string | null | undefined) {
  const v = String(value || '').trim()
  if (!v) return ''
  const found = catalog.find((o) => o.value === v)
  return found ? found.cn : v
}

export function dramaStyleLabel(value: string | null | undefined) {
  const v = String(value || '').trim()
  if (!v) return ''
  const found = DRAMA_STYLE_CATALOG.find((o) => o.value === v)
  return found ? found.cn : v
}

