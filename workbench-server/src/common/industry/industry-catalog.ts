/**
 * 行业目录（slug + 关键词）。单一权威源，用于：
 *  - `/showcase/industry/:slug` 接口根据 slug 找到关键词列表，做 SQL LIKE 过滤
 *  - 全站展示行业标签、SEO 长尾词匹配
 *
 * 设计原则：
 *  - slug 用 kebab-case 的稳定英文短码，便于 i18n prefix URL 与 sitemap
 *  - 关键词列表是中英文混合的字符串碎片，prompt 里只要包含任意一个就归入该行业
 *  - 与 site 端 `utils/industry.ts` 的 INDUSTRY_KEYS 保持 1:1 对应（slug 即 key）
 *  - 新增行业必须同时改本文件 + site 端 INDUSTRY_KEYS，避免漂移
 */
export type IndustrySlug =
  | 'apparel' | 'jewelry' | 'beauty' | 'food' | 'motherBaby' | 'home' | 'digital' | 'auto'
  | 'medical' | 'sport' | 'pet' | 'edu' | 'localLife' | 'travel' | 'finance' | 'entertainment'
  | 'gaming' | 'books' | 'music' | 'news' | 'agriculture' | 'business' | 'government' | 'generic'

export const INDUSTRY_SLUGS: readonly IndustrySlug[] = [
  'apparel', 'jewelry', 'beauty', 'food', 'motherBaby', 'home', 'digital', 'auto',
  'medical', 'sport', 'pet', 'edu', 'localLife', 'travel', 'finance', 'entertainment',
  'gaming', 'books', 'music', 'news', 'agriculture', 'business', 'government', 'generic',
] as const

export type IndustryEntry = {
  slug: IndustrySlug
  /** 触发该行业归类的 prompt 关键词（中英文混合，含同义词） */
  keywords: readonly string[]
}

/**
 * 关键词列表与 site `utils/industry.ts` 的 `inferIndustry()` 完全一致。
 * 改这里务必同步改 site。
 */
export const INDUSTRY_CATALOG: Record<IndustrySlug, IndustryEntry> = {
  apparel:     { slug: 'apparel',     keywords: ['dress', 'shirt', 'jacket', 'skirt', '鞋', '服装', '穿搭', '连衣裙', '上衣', '裤'] },
  jewelry:     { slug: 'jewelry',     keywords: ['jewel', 'ring', 'necklace', 'diamond', '珠宝', '钻石', '项链', '戒指'] },
  beauty:      { slug: 'beauty',      keywords: ['lipstick', 'makeup', 'skincare', 'cosmetic', 'beauty', '口红', '护肤', '化妆', '美妆'] },
  food:        { slug: 'food',        keywords: ['food', 'meal', 'snack', 'fruit', 'drink', '餐', '零食', '水果', '饮料', '生鲜'] },
  motherBaby:  { slug: 'motherBaby',  keywords: ['baby', 'kids', 'diaper', 'mother', '育儿', '母婴', '宝宝', '儿童'] },
  home:        { slug: 'home',        keywords: ['sofa', 'kitchen', 'home', 'furniture', '装修', '家居', '厨房', '客厅'] },
  digital:     { slug: 'digital',     keywords: ['phone', 'laptop', 'camera', 'digital', 'appliance', '手机', '电脑', '数码', '家电'] },
  auto:        { slug: 'auto',        keywords: ['car', 'vehicle', 'automotive', 'engine', '汽车', '车载', '轮胎'] },
  medical:     { slug: 'medical',     keywords: ['hospital', 'medical', 'health', 'doctor', '药', '医疗', '健康', '医生'] },
  sport:       { slug: 'sport',       keywords: ['sport', 'fitness', 'outdoor', 'gym', '运动', '健身', '户外'] },
  pet:         { slug: 'pet',         keywords: ['pet', 'dog', 'cat', '宠物', '猫粮', '狗粮'] },
  edu:         { slug: 'edu',         keywords: ['course', 'class', 'teacher', 'education', '学习', '课程', '培训', '老师'] },
  localLife:   { slug: 'localLife',   keywords: ['hotel', 'restaurant', '团购', '探店', '到店', '本地生活', '美团'] },
  travel:      { slug: 'travel',      keywords: ['travel', 'trip', 'flight', '景点', '旅行', '旅游', '机票'] },
  finance:     { slug: 'finance',     keywords: ['bank', 'insurance', 'fund', 'stock', '理财', '保险', '基金', '股票'] },
  entertainment: { slug: 'entertainment', keywords: ['live', 'show', 'variety', '主播', '直播', '综艺', '娱乐'] },
  gaming:      { slug: 'gaming',      keywords: ['game', 'esport', 'anime', '游戏', '电竞', '二次元', '动漫'] },
  books:       { slug: 'books',       keywords: ['book', 'reading', 'literature', '图书', '阅读', '出版'] },
  music:       { slug: 'music',       keywords: ['music', 'dance', 'song', '音乐', '舞蹈', '唱歌'] },
  news:        { slug: 'news',        keywords: ['news', '热点', '资讯', '时事'] },
  agriculture: { slug: 'agriculture', keywords: ['farm', 'seed', 'fertilizer', '农业', '农资', '绿植', '花卉'] },
  business:    { slug: 'business',    keywords: ['saas', 'crm', 'cloud', '企业服务', '获客', '营销'] },
  government:  { slug: 'government',  keywords: ['政务', '公益', '公共服务', 'government'] },
  generic:     { slug: 'generic',     keywords: [] },
}

/** slug 是否合法（用于 HTTP 400 校验） */
export function isValidIndustrySlug(value: unknown): value is IndustrySlug {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(INDUSTRY_CATALOG, value)
}

/** 取一个行业的关键词列表（拷贝，避免外部修改） */
export function getIndustryKeywords(slug: IndustrySlug): string[] {
  return [...INDUSTRY_CATALOG[slug].keywords]
}

/**
 * 给 SQL `OR LOWER(prompt) LIKE ? OR LOWER(prompt) LIKE ? ...` 用的占位。
 * 返回形如 `'%珠宝%' / '%jewel%'`，未做大小写归一，由调用方决定是否走 LOWER 列。
 *
 * 在 SQLite 上通常用 `LOWER(prompt) LIKE LOWER(?)`，MySQL 默认 collation 已
 * 区分大小写但 utf8mb4_unicode_ci 不区分，需根据列 collation 决定。
 */
export function buildIndustryLikePatterns(slug: IndustrySlug): string[] {
  return INDUSTRY_CATALOG[slug].keywords.map((kw) => `%${kw}%`)
}