/**
 * 小说正文字数 — 与 Notepad++ 等编辑器「字符数 / Sel」一致：
 * 含中文、标点、空格、换行（\n / \r\n 各算相应字符），按 Unicode 码点计数。
 */
export function countNovelChars(raw: string | null | undefined): number {
  if (!raw) return 0
  return [...raw].length
}

/** 展示用字数：中文 ≥1 万用「万」，否则千分位；英文用 K / M */
export function formatNovelCharCount(n: number, lang = 'zh-CN'): string {
  const count = Math.max(0, Math.floor(n))
  if (lang === 'zh-CN') {
    if (count >= 10000) {
      const wan = count / 10000
      const text = wan >= 100
        ? String(Math.round(wan))
        : wan.toFixed(1).replace(/\.0$/, '')
      return `${text}万`
    }
    return count.toLocaleString('zh-CN')
  }
  if (count >= 1_000_000) {
    const m = count / 1_000_000
    const text = m >= 10 ? String(Math.round(m)) : m.toFixed(1).replace(/\.0$/, '')
    return `${text}M`
  }
  if (count >= 10_000) {
    const k = count / 1000
    const text = k >= 100 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, '')
    return `${text}K`
  }
  return count.toLocaleString('en-US')
}
