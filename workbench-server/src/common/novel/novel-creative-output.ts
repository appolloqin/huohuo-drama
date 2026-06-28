/**
 * 小说创意类 AI 输出（梗概 / 全书大纲 / 本章说明 / 正文）统一校验，防止思考链写入表单或数据库。
 */
import { looksLikeModelThinkingLeak } from '../../services/ai/ai.js'
import { countNovelChars } from './novel-char-limit.js'
import { getMaxParsedChapterNumber, validateOutlineChapterCoverage } from './novel-outline.js'

export type NovelCreativeOutputKind = 'premise' | 'outline' | 'outline_skeleton' | 'writing_brief' | 'chapter_prose'

export const NO_THINKING_OUTPUT_RULE = '**严禁**输出思考过程、英文任务分析、redacted_thinking / thinking 等 XML 标签；只输出可直接使用的简体中文正文。'

const MIN_CHARS: Record<NovelCreativeOutputKind, number> = {
  premise: 80,
  outline: 200,
  outline_skeleton: 200,
  writing_brief: 40,
  chapter_prose: 200,
}

const LABEL: Record<NovelCreativeOutputKind, string> = {
  premise: '创意梗概',
  outline: '全书大纲',
  outline_skeleton: '全书大纲骨架',
  writing_brief: '本章写作说明',
  chapter_prose: '章节正文',
}

export type NovelCreativeOutputOptions = {
  /** 全书大纲：要求分章概要覆盖到的章数 */
  totalChapters?: number
}

function validateOutlineStructure(trimmed: string, kind: 'outline' | 'outline_skeleton'): void {
  if (!/总纲|分章|第\s*\d+\s*章/.test(trimmed) && kind === 'outline') {
    throw new Error(`${LABEL[kind]}格式异常（缺少总纲/分章结构），疑似思考链或未完整输出，请重试`)
  }
  if (kind === 'outline_skeleton' && !/总纲/.test(trimmed)) {
    throw new Error(`${LABEL[kind]}格式异常（缺少总纲），请重试`)
  }
  if (!/世界观|修炼体系/.test(trimmed)) {
    throw new Error(`${LABEL[kind]}格式异常（缺少【世界观设定】或修炼体系），请重试生成大纲`)
  }
  if (!/分卷|第\s*[一二三四五六七八九十\d]+\s*卷/.test(trimmed)) {
    throw new Error(`${LABEL[kind]}格式异常（缺少【分卷设计】或分卷条目），请重试生成大纲`)
  }
}

function validateOutlineChapterCount(trimmed: string, totalChapters: number): void {
  const { ok, maxChapter, missing } = validateOutlineChapterCoverage(trimmed, totalChapters)
  if (!ok) {
    throw new Error(
      `全书大纲分章概要不完整：仅生成到第 ${maxChapter} 章，缺少 ${missing} 章（计划 ${totalChapters} 章）。请重试生成大纲`,
    )
  }
}

export function isUsableNovelCreativeOutput(text: string, kind: NovelCreativeOutputKind): boolean {
  const trimmed = text.trim()
  if (!trimmed || looksLikeModelThinkingLeak(trimmed)) return false
  if (countNovelChars(trimmed) < MIN_CHARS[kind]) return false
  if (kind === 'outline' && !/总纲|分章|第\s*\d+\s*章/.test(trimmed)) return false
  if (kind === 'outline' && !/世界观|修炼体系/.test(trimmed)) return false
  if (kind === 'outline' && !/分卷|第\s*[一二三四五六七八九十\d]+\s*卷/.test(trimmed)) return false
  return true
}

export function assertValidNovelCreativeOutput(
  text: string,
  kind: NovelCreativeOutputKind,
  context?: string,
  options?: NovelCreativeOutputOptions,
): string {
  const trimmed = text.trim()
  const name = context ? `${context}${LABEL[kind]}` : LABEL[kind]

  if (!trimmed) {
    throw new Error(`${name}为空：模型输出被思考过程占满。请在设置中关闭「思考模式」、提高 max_tokens，或换非推理模型后重试`)
  }
  if (looksLikeModelThinkingLeak(trimmed)) {
    throw new Error(`${name}含模型思考链/英文分析。若使用 MiniMax，请确认后端已启用 reasoning_split + thinking.disabled，并重启服务后重试`)
  }
  const chars = countNovelChars(trimmed)
  if (chars < MIN_CHARS[kind]) {
    throw new Error(`${name}过短（${chars} 字），疑似未生成完整内容，请重试`)
  }
  if (kind === 'outline' || kind === 'outline_skeleton') {
    validateOutlineStructure(trimmed, kind)
  }
  if (kind === 'outline' && options?.totalChapters && options.totalChapters > 0) {
    validateOutlineChapterCount(trimmed, options.totalChapters)
  }
  return trimmed
}
