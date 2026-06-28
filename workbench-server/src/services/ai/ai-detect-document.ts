import fs from 'fs'
import path from 'path'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

const PLAIN_TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.text', '.srt', '.vtt', '.json', '.csv', '.log',
])

const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx'])

export const SUPPORTED_FILE_EXTENSIONS = new Set([
  ...PLAIN_TEXT_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
])

export function isSupportedTextFile(ext: string): boolean {
  return SUPPORTED_FILE_EXTENSIONS.has(ext.toLowerCase())
}

async function extractPdfText(absPath: string): Promise<string> {
  const buffer = fs.readFileSync(absPath)
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return String(result.text || '').trim()
  } finally {
    await parser.destroy()
  }
}

async function extractDocxText(absPath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: absPath })
  return String(result.value || '').trim()
}

export async function extractTextFromFile(absPath: string, originalName: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase()

  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    return fs.readFileSync(absPath, 'utf8')
  }

  if (ext === '.pdf') {
    const text = await extractPdfText(absPath)
    if (!text) throw new Error('PDF 中未提取到可读文本（可能是扫描件或图片 PDF）')
    return text
  }

  if (ext === '.docx') {
    const text = await extractDocxText(absPath)
    if (!text) throw new Error('Word 文档中未提取到文本')
    return text
  }

  if (ext === '.doc') {
    try {
      const text = await extractDocxText(absPath)
      if (text) return text
    } catch { /* mammoth may not read legacy .doc */ }
    throw new Error('旧版 .doc 请另存为 .docx 或 PDF 后再上传')
  }

  throw new Error('不支持的文件类型')
}
