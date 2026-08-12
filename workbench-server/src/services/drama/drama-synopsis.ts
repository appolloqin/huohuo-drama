import { NOVEL_ANTI_AI_CORE_PLANNING } from '../../agents/novel-anti-ai-core.js'
import {
  assertValidNovelCreativeOutput,
  NO_THINKING_OUTPUT_RULE,
  normalizeGeneratedNovelTitle,
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

const DRAMA_TITLE_GEN_RULES = `你是微短剧/竖屏短剧策划，擅长起能上抖音、红果等平台的商业短剧剧名。
本次任务：根据用户给出的草稿名或关键词，生成【一个】一看就知道是短剧的中文剧名。

## 剧名必须传达（至少两点）
1. 身份标签：总裁、夫人、战神、神医、赘婿、千金、萌宝、后妈、女婿等
2. 核心冲突或钩子：重生、逆袭、闪婚、离婚、打脸、归来、马甲、替身、宠妻等
3. 最好能「一句话概括剧情卖点」，让人 3 秒内知道看什么

## 推荐公式（择一落地）
- 一句话概括剧情（主流、合规友好）：例 闪婚小孕妻、被倒追后我闪婚了战神
- 身份 + 反差 + 悬念：例 重生之我在反派黑化前、冷面小叔宠嫂无度（可弱化夸张）
- 关系/情绪钩子：例 离婚后他跪求复合、闪婚后傅总马甲藏不住了
- 重生/穿越结构：例 重生后我成了顶流前女友
- 少量国风诗意短名仅当用户关键词明显偏古风时使用，且仍须能联想到剧情

## 字数与风格
- 竖屏短剧：4～12 个汉字为宜，手机列表一眼读完；关键词前置
- 直白、口语、强人设强冲突；不要文艺散文名
- 可含「之」「后」等连接；不要书名号《》、引号、英文、表情、第X集

## 严禁（一看就不像短剧）
- 空洞文艺：时光、岁月、彼岸、无题、云端、随想
- 纯抽象形容词或成语，看不出人物关系与冲突
- 长篇网文堆设定名、系统说明书名
- 输出多个候选、解释、前后缀

硬性：只输出剧名本身一行。
${NO_THINKING_OUTPUT_RULE}`

/**
 * 根据关键词生成短剧项目名（与简介共用默认文本模型，短提示只出名称）。
 */
export async function generateDramaTitle(
  args: {
    keywords: string
    style?: string
    totalEpisodes?: number
  },
  billing?: TextBillingContext,
): Promise<string> {
  const { keywords, style, totalEpisodes } = args
  const system = [
    DRAMA_TITLE_GEN_RULES,
    '',
    NOVEL_ANTI_AI_CORE_PLANNING,
  ].join('\n')

  const user = [
    style ? `【视觉风格】${style}` : '',
    totalEpisodes ? `【计划集数】约 ${totalEpisodes} 集` : '',
    `【草稿名/关键词】\n${keywords}`,
    '请把上述内容改写成一个可上架的竖屏短剧剧名（只输出一行）：',
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { maxTokens: 128, temperature: 0.82, billing },
  )
  const title = normalizeGeneratedNovelTitle(raw)
  if ([...title].length < 2) {
    throw new Error('项目名称生成结果过短，请重试或改写关键词')
  }
  return title
}
