/**
 * 统一项目风格名（中英文/别名 -> 规范名），并提供前端可用的风格目录与生图提示词指令。
 */
type DramaStyleItem = {
  value: string
  cn: string
  en: string
  group: string
  aliases?: string[]
  preview?: string
}

export type DramaStylePromptLang = 'zh' | 'en'

export type DramaStylePromptDirectives = {
  canonical: string
  family: 'realistic' | 'anime' | 'illustrated' | 'other'
  positiveZh: string
  positiveEn: string
  avoidZh: string
  avoidEn: string
}

export const DRAMA_STYLE_CATALOG: DramaStyleItem[] = [
  {
    value: 'realistic',
    cn: '写实/真人',
    en: 'Realistic / Live-action',
    group: '基础',
    aliases: ['realism', '写实', '写实风', '真人', '真人写实', '实拍', 'photorealistic', 'photo realistic', 'live action', 'live-action', 'xieshi', 'zhenren'],
  },
  {
    value: 'cinematic',
    cn: '电影感',
    en: 'Cinematic',
    group: '基础',
    aliases: ['film still', '电影风格', 'filmstill', '电影质感'],
  },
  {
    value: 'anime',
    cn: '动漫',
    en: 'Anime / Manga',
    group: '基础',
    aliases: ['二次元', '漫画', '日系动漫', 'manga', 'dongman', 'erciyuan', '卡通动漫'],
  },
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
  // 复合中文标签（写实/真人）归一化后可能带斜杠残留，补一条
  map[normalizeStyleKey('写实真人')] = 'realistic'
  return map
})()

const ANIME_TOKEN_RE = /anime|manga|cartoon|cel\s*shading|2d\s*illustration|二次元|动漫|日系动漫|赛璐璐|漫画风|卡通风/gi
const REALISTIC_TOKEN_RE = /photoreal(?:istic)?|live[\s-]*action|real\s*human|photography|真人|写实|实拍|照片级|真实皮肤|实拍电影/gi
const GENERIC_STYLE_NOISE_RE = /电影感|cinematic(?:\s+(?:portrait|scene|quality|lighting|realism|film(?:\s+still)?))?|consistent art style/gi

function normalizeStyleKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"“”‘’`]/g, '')
    .replace(/[\s\-_./:()（）[\]{}／/]+/g, '')
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

export function dramaStylePreviewSlug(styleValue: string): string {
  return normalizeStyleKey(styleValue) || 'default'
}

export function dramaStylePreviewPath(styleValue: string): string {
  return `static/style-previews/${dramaStylePreviewSlug(styleValue)}.png`
}

export function dramaStyleReferenceImagePath(styleInput: unknown): string | undefined {
  const canonical = normalizeDramaStyle(styleInput)
  if (!canonical) return undefined
  return dramaStylePreviewPath(canonical)
}

export function getDramaStyleCatalog() {
  return DRAMA_STYLE_CATALOG.map((item) => ({
    value: item.value,
    cn: item.cn,
    en: item.en,
    group: item.group,
    aliases: item.aliases || [],
    preview: dramaStylePreviewPath(item.value),
  }))
}

function resolveStyleFamily(canonical: string): DramaStylePromptDirectives['family'] {
  if (canonical === 'realistic' || canonical === 'cinematic') return 'realistic'
  if (canonical === 'anime') return 'anime'
  if (
    canonical === 'digital art'
    || canonical === 'watercolor'
    || canonical === 'pixel art'
    || canonical === 'paper cutout illustration'
    || canonical === 'sumi-e'
    || canonical === 'pop art'
  ) {
    return 'illustrated'
  }
  return 'other'
}

/** 将项目风格解析为生图正/负向指令，避免真人与动漫互相串味。 */
export function resolveDramaStylePromptDirectives(input: unknown): DramaStylePromptDirectives | null {
  const canonical = normalizeDramaStyle(input)
  if (!canonical) return null

  const family = resolveStyleFamily(canonical)
  const catalogItem = DRAMA_STYLE_CATALOG.find((item) => item.value === canonical)
  const labelEn = catalogItem?.en || canonical
  const labelZh = catalogItem?.cn || canonical

  if (family === 'realistic') {
    const cinematicBoost = canonical === 'cinematic'
      ? {
          positiveZh: '真人写实电影质感，实拍摄影，真实皮肤毛孔与材质，电影布光',
          positiveEn: 'photorealistic cinematic film still, live-action photography, real human skin texture, movie lighting',
        }
      : {
          positiveZh: '真人写实，照片级真实皮肤与材质，实拍摄影质感',
          positiveEn: 'photorealistic live-action, real human skin texture, realistic photography',
        }
    return {
      canonical,
      family,
      positiveZh: cinematicBoost.positiveZh,
      positiveEn: cinematicBoost.positiveEn,
      avoidZh: '禁止动漫、二次元、漫画、赛璐璐、卡通插画',
      avoidEn: 'not anime, not manga, not cartoon, not cel shading, not 2d illustration',
    }
  }

  if (family === 'anime') {
    return {
      canonical,
      family,
      positiveZh: '日系动漫风格，二次元赛璐璐上色，漫画插画质感',
      positiveEn: 'japanese anime style, manga cel shading, 2d anime illustration',
      avoidZh: '禁止真人写实、照片级皮肤、实拍摄影',
      avoidEn: 'not photorealistic, not live-action, not real human photography',
    }
  }

  return {
    canonical,
    family,
    positiveZh: `${labelZh}风格，保持统一画风`,
    positiveEn: `consistent art style: ${labelEn}`,
    avoidZh: family === 'illustrated' ? '禁止真人写实照片与实拍电影质感' : '',
    avoidEn: family === 'illustrated' ? 'not photorealistic live-action photography' : '',
  }
}

function scrubConflictingStyleTokens(prompt: string, family: DramaStylePromptDirectives['family']) {
  let next = String(prompt || '')
  // 去掉旧链路硬编码的 cinematic / 电影感，避免与选定风格冲突
  next = next.replace(GENERIC_STYLE_NOISE_RE, ' ')
  if (family === 'realistic') next = next.replace(ANIME_TOKEN_RE, ' ')
  if (family === 'anime' || family === 'illustrated') next = next.replace(REALISTIC_TOKEN_RE, ' ')
  return next.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,+/g, ',').trim().replace(/^,|,$/g, '').trim()
}

/**
 * 将项目风格强制注入提示词：清洗冲突风格词 + 追加正/负向风格约束。
 */
export function applyDramaStyleToPrompt(
  prompt: string,
  styleInput: unknown,
  lang: DramaStylePromptLang = 'zh',
): string {
  const base = String(prompt || '').trim()
  const directives = resolveDramaStylePromptDirectives(styleInput)
  if (!directives) return base

  const cleaned = scrubConflictingStyleTokens(base, directives.family) || base
  const positive = lang === 'en' ? directives.positiveEn : directives.positiveZh
  const avoid = lang === 'en' ? directives.avoidEn : directives.avoidZh
  const parts = [cleaned, positive, avoid].filter(Boolean)
  return parts.join(', ')
}

/** Agent / 提取步骤可读的风格约束说明 */
export function formatDramaStyleBriefForAgent(styleInput: unknown): string {
  const directives = resolveDramaStylePromptDirectives(styleInput)
  if (!directives) return '未设置项目视觉风格，请保持本项目内画风一致，勿混用真人与动漫。'
  return [
    `项目视觉风格（canonical）：${directives.canonical}`,
    `正向约束：${directives.positiveZh} / ${directives.positiveEn}`,
    directives.avoidZh ? `负向约束：${directives.avoidZh} / ${directives.avoidEn}` : '',
    'appearance、场景 prompt、道具 prompt 必须严格遵循上述风格，禁止真人写实与动漫二次元混用。',
  ].filter(Boolean).join('\n')
}
