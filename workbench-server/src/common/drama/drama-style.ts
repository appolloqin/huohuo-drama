/**
 * 统一项目风格名（中英文/别名 -> 规范名），并提供前端可用的风格目录。
 */
type DramaStyleItem = {
  value: string
  cn: string
  en: string
  group: string
  aliases?: string[]
}

export const DRAMA_STYLE_CATALOG: DramaStyleItem[] = [
  { value: 'realistic', cn: '写实', en: 'Realistic', group: '基础', aliases: ['realism', '写实风', 'xieshi'] },
  { value: 'cinematic', cn: '电影感', en: 'Cinematic', group: '基础', aliases: ['film still', '电影风格', 'filmstill'] },
  { value: 'anime', cn: '动漫', en: 'Anime / Manga', group: '基础', aliases: ['二次元', '漫画', '日系动漫', 'manga', 'dongman', 'erciyuan'] },
  { value: 'digital art', cn: '数字艺术', en: 'Digital Art', group: '基础', aliases: ['digitalart'] },
  { value: 'watercolor', cn: '水彩', en: 'Watercolor', group: '基础', aliases: ['水彩画', 'shuicai'] },
  { value: 'pixel art', cn: '像素艺术', en: 'Pixel Art', group: '基础', aliases: ['pixelart'] },
  { value: 'paper cutout illustration', cn: '剪纸插画', en: 'Paper Cutout Illustration', group: '基础', aliases: ['剪纸插画风格', 'papercutoutillustration'] },

  { value: 'cyberpunk', cn: '赛博朋克', en: 'Cyberpunk', group: '朋克/未来', aliases: ['赛博朋克风格', 'saibopengke'] },
  { value: 'steampunk', cn: '蒸汽朋克', en: 'Steampunk', group: '朋克/未来', aliases: ['zhengqipengke'] },
  { value: 'dieselpunk', cn: '柴油朋克', en: 'Dieselpunk', group: '朋克/未来', aliases: ['chaiyoupengke'] },
  { value: 'solarpunk', cn: '太阳朋克', en: 'Solarpunk', group: '朋克/未来', aliases: ['serpunk', 'taiyangpengke'] },
  { value: 'lunarpunk', cn: '月亮朋克', en: 'Lunarpunk', group: '朋克/未来', aliases: ['yueliangpengke'] },
  { value: 'biopunk', cn: '生物朋克', en: 'Biopunk', group: '朋克/未来', aliases: [] },
  { value: 'atompunk', cn: '原子朋克', en: 'Atompunk', group: '朋克/未来', aliases: [] },
  { value: 'gothpunk', cn: '哥特朋克', en: 'Gothpunk', group: '朋克/未来', aliases: [] },
  { value: 'retrofuturism', cn: '复古未来主义', en: 'Retrofuturism', group: '朋克/未来', aliases: [] },
  { value: 'synthwave', cn: '合成波', en: 'Synthwave', group: '朋克/未来', aliases: [] },
  { value: 'vaporwave', cn: '蒸发波', en: 'Vaporwave', group: '朋克/未来', aliases: [] },
  { value: 'science fiction', cn: '科幻', en: 'Science Fiction', group: '朋克/未来', aliases: ['科幻小说', 'sci-fi', 'scifi', 'sciencefiction'] },

  { value: 'fantasy', cn: '幻想', en: 'Fantasy', group: '幻想/氛围', aliases: ['huanxiang'] },
  { value: 'dark fantasy', cn: '黑暗幻想', en: 'Dark Fantasy', group: '幻想/氛围', aliases: ['darkfantasy'] },
  { value: 'gothic', cn: '哥特', en: 'Gothic', group: '幻想/氛围', aliases: [] },
  { value: 'surrealism', cn: '超现实主义', en: 'Surrealism', group: '幻想/氛围', aliases: ['chaoshixianshizhuyi'] },
  { value: 'chinoiserie', cn: '中国风', en: 'Chinoiserie', group: '幻想/氛围', aliases: [] },
  { value: 'dunhuang art', cn: '敦煌艺术', en: 'Dunhuang Art', group: '幻想/氛围', aliases: ['dunhuangart'] },
  { value: 'sumi-e', cn: '日本水墨画', en: 'Sumi-e', group: '幻想/氛围', aliases: ['水墨风', 'sumie'] },

  { value: 'impressionism', cn: '印象派', en: 'Impressionism', group: '艺术史', aliases: [] },
  { value: 'expressionism', cn: '表现主义', en: 'Expressionism', group: '艺术史', aliases: [] },
  { value: 'cubism', cn: '立体派', en: 'Cubism', group: '艺术史', aliases: [] },
  { value: 'pop art', cn: '波普艺术', en: 'Pop Art', group: '艺术史', aliases: ['popart'] },
  { value: 'minimalism', cn: '极简主义', en: 'Minimalism', group: '艺术史', aliases: ['minimalist design', 'jianzhuzhuyi', 'minimalistdesign'] },
  { value: 'maximalism', cn: '极致主义', en: 'Maximalism', group: '艺术史', aliases: [] },
]

const STYLE_ALIAS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const item of DRAMA_STYLE_CATALOG) {
    map[normalizeStyleKey(item.value)] = item.value
    map[normalizeStyleKey(item.cn)] = item.value
    map[normalizeStyleKey(item.en)] = item.value
    for (const alias of item.aliases || []) map[normalizeStyleKey(alias)] = item.value
  }
  return map
})()

function normalizeStyleKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"“”‘’`]/g, '')
    .replace(/[\s\-_./:()（）[\]{}]+/g, '')
}

/**
 * 归一化风格名；空值返回 undefined，未知值保留原文（trim 后）。
 */
export function normalizeDramaStyle(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined
  const raw = String(input).trim()
  if (!raw) return undefined
  const key = normalizeStyleKey(raw)
  return STYLE_ALIAS[key] || raw
}

export function getDramaStyleCatalog() {
  return DRAMA_STYLE_CATALOG.map((item) => ({
    value: item.value,
    cn: item.cn,
    en: item.en,
    group: item.group,
    aliases: item.aliases || [],
  }))
}

