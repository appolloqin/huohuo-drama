import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'
import { normalizeDramaStyle } from '../../common/drama/drama-style.js'
import {
  buildProjectCharacterRosterBlock,
  buildSerialContinuityExcerpt,
  truncText,
} from '../../common/drama/project-continuity.js'

/** 供「生成初稿」跨集连贯：上一集结尾 + 更早集短摘要 + 角色表 */
export async function buildGenerateContinuityBlocks(args: {
  dramaId: number
  currentEpisodeNumber: number
  currentEpisodeId: number
}) {
  const { dramaId, currentEpisodeNumber, currentEpisodeId } = args
  const { continuity, selfHint } = await buildSerialContinuityExcerpt({
    dramaId,
    currentUnitNumber: currentEpisodeNumber,
    currentUnitId: currentEpisodeId,
    unitLabel: '集',
  })
  const charBlock = await buildProjectCharacterRosterBlock(dramaId)
  return { continuity, charBlock, selfHint }
}

export async function generateEpisodeRawContent(args: {
  drama: { id: number; title: string; description: string | null; style: string | null }
  episode: { id: number; dramaId: number; episodeNumber: number; title: string }
  prompt: string
}, billing?: TextBillingContext): Promise<string> {
  const { drama, episode: ep, prompt } = args

  const system = `你是短剧编剧。用户会给出一句或一段「剧情或创意说明」（题材、人设、冲突、基调等），不是图片/视频模型的英文提示词。
请根据说明写出一集短剧的正文初稿（叙事+对白），可直接粘贴进「原始内容」框，供后续 AI 改写成格式化剧本。

写作要求：
- 用中文写作；篇幅适合单集短剧（约 800～2500 字为宜，可略增减）。
- 结构清晰：可分场景叙述，包含主要对白与动作；无需严格剧本格式，但角色名与台词要清楚。
- 若提示信息不足，可合理补全设定，并在文首用一两句说明假定前提。
- 不要输出前言后记或「以下为剧本」等套话，直接开始正文。
- 若消息中提供「上一集结尾」或「前序提要」，本集必须在人物关系与剧情线上自然承接，避免吃书；不要大段复述前集，从新情节切入。
- 若提供「项目已有角色」，主要人物姓名与核心设定须与列表一致；需要新角色时可合理增加。`

  const { continuity, charBlock, selfHint } = await buildGenerateContinuityBlocks({
    dramaId: ep.dramaId,
    currentEpisodeNumber: ep.episodeNumber,
    currentEpisodeId: ep.id,
  })

  const epLabel = `第${ep.episodeNumber}集`
  const style = normalizeDramaStyle(drama.style)
  const projectLine = `【项目】${drama.title}${style ? `（整体风格倾向：${style}）` : ''}`
  const projectDesc = drama.description?.trim()
    ? `【项目简介】\n${truncText(drama.description.trim(), 1200)}`
    : ''

  const blocks = [
    continuity,
    charBlock,
    selfHint,
    projectLine,
    projectDesc,
    `【本集】${epLabel}${ep.title ? ` ${ep.title}` : ''}`,
    `【用户剧情/创意说明】\n${prompt}`,
  ].filter(Boolean)

  const content = await chatCompletionText([
    { role: 'system', content: system },
    { role: 'user', content: blocks.join('\n\n') },
  ], { billing })
  if (!content?.trim()) throw new Error('生成结果为空')
  return content.trim()
}
