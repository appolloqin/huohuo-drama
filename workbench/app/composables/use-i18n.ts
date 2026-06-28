import { LANG_STORAGE_KEY, detectDefaultLang, isLang, type Lang } from '~/i18n/constants'
import { MESSAGES, type ConsoleMessages } from '~/i18n/messages'

/** 将 `'{n}'` 等占位替换为变量（与 site 字典风格一致） */
export function tx(template: string, vars: Record<string, string | number> = {}) {
  let s = template
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

export function useI18n() {
  const lang = useState<Lang>('huohuo-console-lang', () => 'zh-CN')
  const i18nReady = useState('huohuo-i18n-init', () => false)

  function init() {
    if (!import.meta.client || i18nReady.value) return
    i18nReady.value = true
    lang.value = detectDefaultLang()
    document.documentElement.lang = lang.value
  }

  function setLang(next: Lang) {
    lang.value = next
    if (import.meta.client) {
      localStorage.setItem(LANG_STORAGE_KEY, next)
      document.documentElement.lang = next
    }
  }

  const messages = computed<ConsoleMessages>(() => MESSAGES[lang.value])

  return {
    lang,
    setLang,
    messages,
    init,
    tx,
    LANG_STORAGE_KEY,
    isLang,
  }
}
