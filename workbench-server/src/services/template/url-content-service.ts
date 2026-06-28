import { extractTextFromHtml } from '../../common/template/template-text-parse.js'
import { fetchUrlText } from '../../common/template/template-url-fetch.js'

const MAX_TEXT_CHARS = 200_000

/** 从公开 http(s) 链接抓取并提取正文（与模板库链接导入共用逻辑） */
export async function fetchPageContentFromUrl(urlRaw: string): Promise<{ title: string; text: string }> {
  const fetched = await fetchUrlText(urlRaw)
  let title = ''
  let text = fetched.text

  if (/html/i.test(fetched.contentType) || text.includes('<html') || text.includes('<body')) {
    const extracted = extractTextFromHtml(text)
    title = extracted.title
    text = extracted.text
  } else {
    const first = text.split('\n').find(l => l.trim())
    if (first && first.length <= 100) title = first.trim()
  }

  text = text.trim()
  if (!text) throw new Error('未能从链接提取到有效文本')
  if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS)

  return { title, text }
}
