/** 与 marketing `site` 一致：同键可在同域不同端口各自存一份 localStorage */
export const LANG_STORAGE_KEY = 'huohuo_site_lang'

export type Lang = 'zh-CN' | 'en' | 'fil' | 'vi'

export const SUPPORTED_LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
  { code: 'vi', label: 'Tiếng Việt' },
]

export function isLang(v: string): v is Lang {
  return v === 'zh-CN' || v === 'en' || v === 'fil' || v === 'vi'
}

export function detectDefaultLang(): Lang {
  if (import.meta.client) {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    if (saved && isLang(saved)) return saved
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'zh-CN').toLowerCase()
  if (nav.startsWith('zh')) return 'zh-CN'
  if (nav.startsWith('vi')) return 'vi'
  if (nav.startsWith('fil') || nav.startsWith('tl')) return 'fil'
  return 'en'
}
