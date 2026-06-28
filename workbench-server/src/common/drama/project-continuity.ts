/**
 * 短剧 / 小说共用的跨集（章）连贯性辅助块（对齐 episode-raw-content 模式）
 */
import * as charactersRepo from '../../db/repos/characters/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import type { EpisodeRow } from '../../db/repos/types.js'

export function truncText(s: string, max: number) {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export function unitText(e: { content: string | null; scriptContent: string | null; formattedScript: string | null }) {
  return (e.formattedScript || e.content || e.scriptContent || '').trim()
}

/** 项目角色表 — 短剧生成初稿与小说写作均注入，防止造人与设定漂移 */
export async function buildProjectCharacterRosterBlock(
  dramaId: number,
  opts?: { maxRows?: number; maxChars?: number; label?: string },
) {
  const maxRows = opts?.maxRows ?? 24
  const maxChars = opts?.maxChars ?? 2200
  const label = opts?.label ?? '【项目已有角色（须沿用姓名与核心设定；确需新角色时可加入并简短交代）】'

  const charRows = (await charactersRepo.listActiveCharactersByDrama(dramaId))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .slice(0, maxRows)

  if (!charRows.length) return ''

  const lines = charRows.map((c) => {
    const bits: string[] = [c.name]
    if (c.role) bits.push(`定位 ${truncText(c.role, 36)}`)
    if (c.personality) bits.push(`性格 ${truncText(c.personality, 50)}`)
    if (c.appearance) bits.push(`外貌 ${truncText(c.appearance, 70)}`)
    return `- ${bits.join('；')}`
  })

  let block = `${label}\n${lines.join('\n')}`
  if (block.length > maxChars) block = `${block.slice(0, maxChars)}…`
  return block
}

export async function buildSerialContinuityExcerpt(args: {
  dramaId: number
  currentUnitNumber: number
  currentUnitId: number
  unitLabel: '集' | '章'
  prevTailMax?: number
  olderSummaryMax?: number
  totalMax?: number
  selfHintMax?: number
  /** 上章正文已在 serialWrittenBlock 注入时设为 true，避免重复注入章末 */
  skipImmediatePrev?: boolean
}) {
  const {
    dramaId,
    currentUnitNumber,
    currentUnitId,
    unitLabel,
    prevTailMax = unitLabel === '集' ? 900 : 2000,
    olderSummaryMax = unitLabel === '集' ? 260 : 400,
    totalMax = unitLabel === '集' ? 5200 : 8000,
    selfHintMax = unitLabel === '集' ? 900 : 1500,
    skipImmediatePrev = false,
  } = args

  const siblings = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const prev = siblings.filter(e => e.episodeNumber < currentUnitNumber)
  const parts: string[] = []

  const immediate = prev.find(e => e.episodeNumber === currentUnitNumber - 1)
  if (immediate && !skipImmediatePrev) {
    const body = unitText(immediate)
    if (body) {
      const tail = body.length <= prevTailMax ? body : `…${body.slice(-(prevTailMax - 20))}`
      parts.push(
        `【上${unitLabel === '集' ? '一集' : '一章'}（第${immediate.episodeNumber}${unitLabel}《${immediate.title}》）结尾 —— 须自然衔接，勿重复已写内容】\n${tail}`,
      )
    }
  }

  const older = prev.filter(e => e.episodeNumber !== currentUnitNumber - 1)
  if (older.length) {
    const lines = older.map((e) => {
      const body = unitText(e)
      if (!body) return `- 第${e.episodeNumber}${unitLabel}《${e.title}》：（暂无正文）`
      return `- 第${e.episodeNumber}${unitLabel}《${e.title}》：${truncText(body, olderSummaryMax)}`
    })
    parts.push(`【更早${unitLabel === '集' ? '剧集' : '章节'}提要】\n${lines.join('\n')}`)
  }

  let continuity = parts.join('\n\n')
  if (continuity.length > totalMax) {
    continuity = `${continuity.slice(0, totalMax)}…\n（前序摘录过长已截断，请以概要为准保持连贯。）`
  }

  const self = siblings.find(e => e.id === currentUnitId)
  let selfHint = ''
  if (self) {
    const selfBody = unitText(self)
    if (selfBody) {
      selfHint = `【本${unitLabel}当前已有正文（生成时请融合用户说明，避免无关脱节）】\n${truncText(selfBody, selfHintMax)}`
    }
  }

  return { continuity, selfHint }
}

export async function findSiblingEpisode(
  dramaId: number,
  episodeNumber: number,
): Promise<EpisodeRow | null> {
  const siblings = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  return siblings.find((e) => e.episodeNumber === episodeNumber) ?? null
}
