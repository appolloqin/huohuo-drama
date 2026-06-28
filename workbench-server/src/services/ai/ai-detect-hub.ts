import fs from 'fs'
import path from 'path'
import type { TextBillingContext } from './ai.js'
import type { AiDetectionResult } from './ai-text-detection.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import {
  detectAiTextStatisticalFallback,
  detectAiTextWithPerplexity,
} from './ai-perplexity-detection.js'
import { transcribeAudioFile, transcribeVideoFile } from './ai-detect-asr.js'
import { extractTextFromFile, isSupportedTextFile } from './ai-detect-document.js'
import { getAbsolutePath } from '../../common/media/storage.js'

export type AiDetectSourceType = 'text' | 'file' | 'audio' | 'video'

export type AiDetectHubResult = AiDetectionResult & {
  source_type: AiDetectSourceType
  source_name?: string
  transcript?: string
  transcript_source?: 'subtitle' | 'asr' | 'file' | 'input'
  analysis_note?: string
  /** 检测链路说明（音频/视频与纯文本路径不同） */
  pipeline?: string
}

const MAX_TEXT_CHARS = 500000
const MAX_PLAIN_FILE_BYTES = 8 * 1024 * 1024
const MAX_DOCUMENT_FILE_BYTES = 15 * 1024 * 1024

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'])

function hubBilling(userId: number, reason: string, role?: string): TextBillingContext {
  return {
    userId,
    role,
    reason,
    resourceType: 'ai_detect',
  }
}

async function runDetection(
  content: string,
  billing: TextBillingContext,
): Promise<AiDetectionResult> {
  try {
    return await detectAiTextWithPerplexity(content, billing)
  } catch (perplexityErr: any) {
    const reason = perplexityErr?.message || '困惑度检测不可用'
    return detectAiTextStatisticalFallback(content, reason)
  }
}

function clampText(raw: string): { text: string; note?: string } {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('内容为空，无法检测')
  const chars = countNovelChars(trimmed)
  if (chars <= MAX_TEXT_CHARS) return { text: trimmed }
  const sliced = [...trimmed].slice(0, MAX_TEXT_CHARS).join('')
  return {
    text: sliced,
    note: `文本超过 ${MAX_TEXT_CHARS} 字，已截取前部进行 AI 率分析`,
  }
}

export async function detectHubText(
  text: string,
  userId: number,
  role?: string,
): Promise<AiDetectHubResult> {
  const { text: content, note } = clampText(text)
  const result = await runDetection(content, hubBilling(userId, 'AI 检测 · 文本', role))
  return {
    ...result,
    source_type: 'text',
    transcript: content,
    transcript_source: 'input',
    pipeline: '直接对输入文本做困惑度/统计特征检测',
    analysis_note: note,
  }
}

export async function detectHubTextFile(
  absPath: string,
  originalName: string,
  userId: number,
  role?: string,
): Promise<AiDetectHubResult> {
  const ext = path.extname(originalName).toLowerCase()
  if (!isSupportedTextFile(ext)) {
    throw new Error('不支持的文件类型，请上传 txt、md、pdf、docx 等')
  }
  const stat = fs.statSync(absPath)
  const isDocument = ext === '.pdf' || ext === '.doc' || ext === '.docx'
  const maxBytes = isDocument ? MAX_DOCUMENT_FILE_BYTES : MAX_PLAIN_FILE_BYTES
  if (stat.size > maxBytes) {
    throw new Error(isDocument
      ? '文档过大，请上传 15MB 以内的 PDF/Word'
      : '文本文件过大，请上传 8MB 以内的文件')
  }
  const raw = await extractTextFromFile(absPath, originalName)
  const { text: content, note } = clampText(raw)
  const extractNote = isDocument ? '已从 PDF/Word 提取正文' : undefined
  const result = await runDetection(content, hubBilling(userId, 'AI 检测 · 文件', role))
  return {
    ...result,
    source_type: 'file',
    source_name: originalName,
    transcript: content,
    transcript_source: 'file',
    pipeline: '文件提取正文 → 困惑度/统计特征检测',
    analysis_note: [extractNote, note].filter(Boolean).join('；') || undefined,
  }
}

export async function detectHubAudioFile(
  absPath: string,
  originalName: string,
  userId: number,
  role?: string,
): Promise<AiDetectHubResult> {
  const ext = path.extname(originalName).toLowerCase()
  if (!AUDIO_EXTENSIONS.has(ext)) {
    throw new Error('不支持的音频格式，请上传 mp3、wav、m4a 等')
  }
  const stat = fs.statSync(absPath)
  if (stat.size > 50 * 1024 * 1024) {
    throw new Error('音频文件过大，请上传 50MB 以内的文件')
  }
  const transcript = await transcribeAudioFile(absPath)
  const { text: content, note } = clampText(transcript)
  const result = await runDetection(content, hubBilling(userId, 'AI 检测 · 音频', role))
  return {
    ...result,
    source_type: 'audio',
    source_name: originalName,
    transcript: content,
    transcript_source: 'asr',
    pipeline: '语音转写（ASR）→ 对转写文本做困惑度/统计特征检测',
    analysis_note: note || '已对音频转写文本进行 AI 率检测',
  }
}

export async function detectHubVideoFile(
  absPath: string,
  originalName: string,
  userId: number,
  role?: string,
): Promise<AiDetectHubResult> {
  const ext = path.extname(originalName).toLowerCase()
  if (!VIDEO_EXTENSIONS.has(ext)) {
    throw new Error('不支持的视频格式，请上传 mp4、mov、webm 等')
  }
  const stat = fs.statSync(absPath)
  if (stat.size > 120 * 1024 * 1024) {
    throw new Error('视频文件过大，请上传 120MB 以内的文件')
  }
  const { text: transcript, from } = await transcribeVideoFile(absPath)
  const { text: content, note } = clampText(transcript)
  const pipeline = from === 'subtitle'
    ? '读取内嵌字幕 → 对字幕文本做困惑度/统计特征检测（不分析画面）'
    : '提取音轨并语音转写（ASR）→ 对转写文本做困惑度/统计特征检测（不分析画面）'
  const fromLabel = from === 'subtitle' ? '内嵌字幕' : '音轨转写'
  const result = await runDetection(content, hubBilling(userId, 'AI 检测 · 视频', role))
  return {
    ...result,
    source_type: 'video',
    source_name: originalName,
    transcript: content,
    transcript_source: from,
    pipeline,
    analysis_note: note || `已基于视频${fromLabel}文本检测（非画面深伪检测）`,
  }
}

export function resolveUploadedPath(relativePath: string): string {
  return getAbsolutePath(relativePath)
}
