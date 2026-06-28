import { NOVEL_ANTI_AI_CORE_PLANNING } from '../../agents/novel-anti-ai-core.js'
import {
  assertValidNovelCreativeOutput,
  NO_THINKING_OUTPUT_RULE,
} from '../../common/novel/novel-creative-output.js'
import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'

const DRAMA_SYNOPSIS_SYSTEM = `你是短剧策划，擅长把零散关键词整理成吸引人的项目简介。
请根据用户给出的关键词（及可选的项目名、视觉风格、计划集数），写一段 120～320 字的短剧简介，供首页展示与 AI 写各集初稿时参考。

要求：
- **语言**：仅使用简体中文。
- 涵盖故事主线、主要人物关系、核心冲突与基调；关键词须自然融入。
- 面向竖屏短剧/微短剧，节奏紧凑，有钩子，不要写成完整分集大纲。
- 语气像作品简介/策划案，不要「以下是简介」等套话，直接输出正文。
- **严禁**输出思考过程、英文分析、redacted_thinking / thinking 等 XML 标签；只输出简体中文正文。

${NOVEL_ANTI_AI_CORE_PLANNING}`

export async function generateDramaSynopsis(
  args: {
    title?: string
    keywords: string
    style?: string
    totalEpisodes?: number
  },
  billing?: TextBillingContext,
): Promise<string> {
  const { title, keywords, style, totalEpisodes } = args

  const user = [
    title ? `【项目名】${title}` : '',
    style ? `【视觉风格】${style}` : '',
    totalEpisodes ? `【计划集数】约 ${totalEpisodes} 集` : '',
    `【关键词】\n${keywords}`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const synopsis = await chatCompletionText(
    [{ role: 'system', content: DRAMA_SYNOPSIS_SYSTEM }, { role: 'user', content: user }],
    {
      maxTokens: 1024,
      temperature: 0.78,
      billing,
    },
  )
  return assertValidNovelCreativeOutput(synopsis, 'premise')
}
