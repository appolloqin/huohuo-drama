import { chatCompletionText } from '../ai/ai.js'
import { parseNovelMetadata, isNovelProject } from '../../common/novel/novel-meta.js'
import { dramaOwnedByUser } from '../drama/drama-access-service.js';
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import type { DramaRow } from '../../db/repos/types.js'

export type ExtractedLesson = {
  title: string
  content: string
  verdict: 'recommend' | 'avoid'
  project_kind: 'drama' | 'novel' | 'all'
  agent_type: string | null
  tags: string[]
}

import { DRAMA_AGENT_TYPES } from '../../common/agent/drama-agent-types.js'

const NOVEL_AGENT_TYPES = [
  'novel_premise',
  'novel_outline',
  'novel_writing_brief',
  'novel_chapter_writer',
]

function trunc(s: string, max: number) {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function episodeBody(e: { content: string | null; scriptContent: string | null; formattedScript: string | null }) {
  return (e.formattedScript || e.content || e.scriptContent || '').trim()
}

export async function buildProjectSnapshot(drama: DramaRow): Promise<string> {
  const isNovel = isNovelProject(drama)
  const meta = parseNovelMetadata(drama.metadata)
  const episodes = await dramasRepo.listActiveEpisodesByDrama(drama.id)
  const parts: string[] = [
    `【项目名称】${drama.title}`,
    `【项目类型】${isNovel ? '小说' : '短剧'}`,
  ]
  if (drama.genre) parts.push(`【题材】${drama.genre}`)
  if (drama.description?.trim()) parts.push(`【简介】${trunc(drama.description, 600)}`)

  if (isNovel) {
    if (meta.premise?.trim()) parts.push(`【创意梗概】${trunc(meta.premise, 1000)}`)
    if (meta.outline?.trim()) parts.push(`【全书大纲】${trunc(meta.outline, 4000)}`)

    const withBody = episodes.filter(e => episodeBody(e))
    parts.push(`【章节统计】共 ${episodes.length} 章，${withBody.length} 章有正文`)

    for (const ep of withBody.slice(0, 6)) {
      const body = episodeBody(ep)
      const head = body.slice(0, 700)
      const tail = body.length > 1100 ? body.slice(-450) : ''
      let block = `【第${ep.episodeNumber}章《${ep.title}》（约${body.length}字）】\n开头：${head}`
      if (tail) block += `\n…\n结尾：${tail}`
      parts.push(block)
    }
    if (withBody.length > 6) {
      const rest = withBody.slice(6, 12).map(e =>
        `- 第${e.episodeNumber}章《${e.title}》：${episodeBody(e).length}字`,
      )
      parts.push(`【更多章节概览】\n${rest.join('\n')}`)
    }
  } else {
    const characters = await dramasRepo.listActiveCharactersByDrama(drama.id)
    if (characters.length) {
      const lines = characters.slice(0, 20).map(c =>
        `- ${c.name}（${c.role || '角色'}）：${trunc(c.description || c.appearance || '', 100)}`,
      )
      parts.push(`【角色（${characters.length}）】\n${lines.join('\n')}`)
    }

    const scenes = await dramasRepo.listActiveScenesByDrama(drama.id)
    if (scenes.length) {
      const lines = scenes.slice(0, 15).map(s =>
        `- ${s.location} / ${s.time}：${trunc(s.prompt, 80)}`,
      )
      parts.push(`【场景（${scenes.length}）】\n${lines.join('\n')}`)
    }

    for (const ep of episodes.slice(0, 4)) {
      const script = episodeBody(ep)
      if (script) {
        parts.push(`【第${ep.episodeNumber}集《${ep.title}》剧本摘录】\n${trunc(script, 2000)}`)
      }
    }

    const epIds = episodes.map(e => e.id)
    if (epIds.length) {
      const boards = await storyboardsRepo.listStoryboardsByEpisodeIdsOrdered(epIds, 16)
      if (boards.length) {
        const lines = boards.map(sb => {
          const bits = [
            sb.shotType,
            sb.action,
            sb.dialogue,
            sb.imagePrompt,
            sb.videoPrompt,
          ].filter(Boolean).map(v => trunc(String(v), 80))
          return `- 镜${sb.storyboardNumber}：${bits.join(' | ') || '(空)'}`
        })
        parts.push(`【分镜样本（${boards.length} 条）】\n${lines.join('\n')}`)
      }
    }
  }

  let snapshot = parts.join('\n\n')
  const max = 16000
  if (snapshot.length > max) {
    snapshot = `${snapshot.slice(0, max)}\n\n（项目摘录过长已截断，请基于可见内容提取经验。）`
  }
  return snapshot
}

function parseExtractedJson(raw: string): ExtractedLesson[] {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('模型未返回有效的经验 JSON 数组')
  const parsed = JSON.parse(text.slice(start, end + 1))
  if (!Array.isArray(parsed)) throw new Error('经验格式应为数组')

  const validAgents = new Set([...DRAMA_AGENT_TYPES, ...NOVEL_AGENT_TYPES])
  const out: ExtractedLesson[] = []

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const title = String(item.title || '').trim()
    const content = String(item.content || item.detail || item.description || '').trim()
    if (!title || !content) continue
    const verdict = item.verdict === 'avoid' ? 'avoid' : 'recommend'
    let projectKind: ExtractedLesson['project_kind'] = 'all'
    if (item.project_kind === 'drama' || item.project_kind === 'novel') {
      projectKind = item.project_kind
    }
    let agentType: string | null = null
    if (typeof item.agent_type === 'string' && item.agent_type.trim()) {
      const t = item.agent_type.trim()
      agentType = validAgents.has(t) ? t : null
    }
    const tags = Array.isArray(item.tags)
      ? item.tags.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean)
      : []
    out.push({ title, content, verdict, project_kind: projectKind, agent_type: agentType, tags })
  }
  return out
}

export async function extractLessonsFromProject(args: {
  dramaId: number
  userId: number
  hint?: string
  maxItems?: number
}) {
  const drama = await dramaOwnedByUser(args.dramaId, args.userId)
  if (!drama) throw new Error('项目不存在或无权访问')

  const snapshot = await buildProjectSnapshot(drama)
  if (snapshot.length < 80) {
    throw new Error('项目内容过少，请先完成梗概、大纲或至少一章正文/剧本后再提取')
  }

  const isNovel = isNovelProject(drama)
  const projectKind = isNovel ? 'novel' : 'drama'
  const agentList = isNovel ? NOVEL_AGENT_TYPES : DRAMA_AGENT_TYPES
  const maxItems = Math.min(Math.max(args.maxItems ?? 8, 3), 12)

  const system = `你是 AI 内容生产顾问。根据用户提供的真实项目摘录，总结可复用的「生成经验」条目，供后续同类 Agent 生成时注入提示词。

要求：
1. 输出 **仅** 一个 JSON 数组，不要 markdown 说明。
2. 每条经验包含字段：title（简短标题）、content（1～3 句具体说明）、verdict（"recommend" 或 "avoid"）、agent_type（可选，从下列选用）、tags（字符串数组，1～3 个场景标签）。
3. 推荐（recommend）：从项目中提炼值得保留的写作/制片做法。
4. 不推荐（avoid）：从质量问题、重复、格式混乱、语言混杂、节奏拖沓等提炼避雷点。
5. project_kind 固定为 "${projectKind}"；agent_type 不确定时填 null（表示全局）。
6. 生成 ${maxItems} 条以内，推荐与避雷应都有，且彼此不重复。
7. 经验须**可执行**，避免空泛套话；须能从摘录中找到依据。

可选 agent_type：
${agentList.join(', ')}`

  const userParts = [`【项目摘录】\n${snapshot}`]
  if (args.hint?.trim()) userParts.push(`【管理员补充说明】\n${args.hint.trim()}`)
  userParts.push('请输出 JSON 数组。')

  const raw = await chatCompletionText([
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ], { temperature: 0.35, maxTokens: 4096 })

  let lessons = parseExtractedJson(raw)
  if (!lessons.length) throw new Error('未能从项目中提取有效经验，请补充项目内容后重试')

  const sourceTag = `来源:${drama.title}`
  lessons = lessons.slice(0, maxItems).map(l => ({
    ...l,
    project_kind: l.project_kind === 'all' ? projectKind : l.project_kind,
    tags: l.tags.includes(sourceTag) ? l.tags : [...l.tags, sourceTag],
  }))

  return {
    drama_id: drama.id,
    drama_title: drama.title,
    project_kind: projectKind,
    lessons,
  }
}
