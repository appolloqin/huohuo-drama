/** 第 1 章写作固定注入：有真实世界观块时展开；无则不注入修真占位 */
import {
  NOVEL_OUTLINE_WORLD_SECTION,
  isCultivationPowerGenre,
  isMundaneNonCultivationGenre,
} from '../../agents/novel-defaults.js'
import { extractWorldRules } from '../../services/novel/novel-memory/novel-memory-parser.js'
import { NovelMemoryManager } from '../../services/novel/novel-memory/novel-memory-manager.js'

/** 从全书大纲截取【世界观设定】块 */
export function extractOutlineWorldBlock(outline: string, maxChars = 2800): string {
  const trimmed = outline.trim()
  if (!trimmed) return ''
  const start = trimmed.indexOf(NOVEL_OUTLINE_WORLD_SECTION)
  if (start < 0) return ''
  const rest = trimmed.slice(start)
  const endMatch = rest.search(/\n【(?:总纲|主要人物|分卷)/)
  const section = (endMatch > 0 ? rest.slice(0, endMatch) : rest).trim()
  if (!section) return ''
  return section.length <= maxChars ? section : `${section.slice(0, maxChars)}…`
}

/** 是否存在可注入的真实世界观（大纲或 world_bible），非修真占位 */
export function hasRealWorldBlock(args: { outline?: string; dramaId?: number }): boolean {
  if (extractOutlineWorldBlock(args.outline || '')) return true
  if (args.dramaId && NovelMemoryManager.exists(args.dramaId)) {
    const mgr = new NovelMemoryManager(args.dramaId)
    if (extractWorldRules(mgr.readWorld(), 2800).trim()) return true
  }
  return false
}

function pickWorldLines(section: string): { cultivation: string; regions: string; factions: string } {
  const lines = section.split('\n')
  let cultivation = ''
  let regions = ''
  let factions = ''
  for (const line of lines) {
    if (/修炼体系|力量体系|境界/.test(line)) cultivation = line.replace(/^[-*•\s]+/, '').trim()
    if (/大陆|地域|地理/.test(line)) regions = line.replace(/^[-*•\s]+/, '').trim()
    if (/门派|势力|种族/.test(line)) factions = line.replace(/^[-*•\s]+/, '').trim()
  }
  return { cultivation, regions, factions }
}

/**
 * 大纲是否含真·修真境界链（有则第1章可展开；无则禁止灌淬体凝气）。
 * 题材优先：种田修真等力量标签 → 可展开；明确年代现实 → 禁灌。
 */
export function outlineHasCultivationRealmChain(section: string, genre?: string): boolean {
  const s = section || ''
  if (isMundaneNonCultivationGenre(genre)) return false
  if (isCultivationPowerGenre(genre)) {
    return /淬体|凝气|筑基|炼气|金丹|元婴|化神|灵气|修真|境界链|修炼体系/.test(s)
  }
  // 无题材或模糊题材：看大纲是否显式修炼体系+境界，或宗门仙侠语境
  if (!/淬体|凝气|筑基|炼气|金丹|元婴|化神|灵气|修真|境界链/.test(s)) return false
  if (/修炼体系\s*[：:]/.test(s) && /淬体|凝气|筑基|炼气|金丹|元婴|化神/.test(s)) return true
  const xianxiaCtx = /宗门|灵根|修仙|仙侠|玄幻|东荒|南荒|北域|中州|散修|灵石|功法|飞升/.test(s)
  if (xianxiaCtx) return true
  // 年代/农村强信号且无宗门语境 → 旧大纲误塞的淬体词不当修真链
  const ruralOrMundane = /公社|大队|工分|供销社|知青|户口|生产队|197\d|198\d|199\d/.test(s)
  if (ruralOrMundane) return false
  return true
}

/** 第 1 章世界观注入块；无真实块时返回空字符串（勿注入修真占位） */
export function buildChapter1WorldIntroBlock(args: {
  outline?: string
  dramaId?: number
  genre?: string
}): string {
  let raw = extractOutlineWorldBlock(args.outline || '')
  if (!raw && args.dramaId && NovelMemoryManager.exists(args.dramaId)) {
    const mgr = new NovelMemoryManager(args.dramaId)
    raw = extractWorldRules(mgr.readWorld(), 2800)
  }
  if (!raw) return ''

  const { cultivation, regions, factions } = pickWorldLines(raw)
  const hasRealmChain = outlineHasCultivationRealmChain(raw, args.genre)
  const bullets = [
    cultivation
      ? (hasRealmChain
        ? `- 修炼体系/境界：${cultivation.replace(/^\*\*[^*]+\*\*[：:]\s*/, '')}`
        : `- 力量/规则要点：${cultivation.replace(/^\*\*[^*]+\*\*[：:]\s*/, '')}`)
      : '',
    regions ? `- 地域：${regions.replace(/^\*\*[^*]+\*\*[：:]\s*/, '')}` : '',
    factions ? `- 势力/组织：${factions.replace(/^\*\*[^*]+\*\*[：:]\s*/, '')}` : '',
  ].filter(Boolean)

  const writeRules = hasRealmChain
    ? [
      '写作要求（第1章专用，优先级高于「快节奏」）：',
      '1. **修炼体系**：须自然交代大纲中的**完整境界链**；说明当前主角所处位置；可借路人/回忆带出，禁止说明书堆砌',
      '2. **地域**：须写出大纲主要地理单元及关系',
      '3. **门派/势力**：须至少自然带出 2 个大纲中的势力名及与主角关系',
      '4. 世界观展开建议占全章 400～800 字（分散在对话、动作、环境中）',
      '5. 禁止自造大纲未列的地名/境界别称',
    ]
    : [
      '写作要求（第1章专用）：',
      '1. 按大纲交代时代/地域/组织规则即可；**禁止**写入淬体、凝气、筑基、炼气、金丹等修真境界词（含比喻、村语假托）',
      '2. 地域与组织按大纲自然带出，勿编造宗门修真设定',
      '3. 禁止把无修真力量体系的现实/年代题材写成修真升级文',
    ]

  return [
    hasRealmChain
      ? '【第1章须介绍的世界观 — 正文前 1/3 须充分展开，名称须与下列完全一致】'
      : '【第1章世界观要点 — 按大纲落地；禁止修真境界串味】',
    raw,
    bullets.length ? '\n要点：\n' + bullets.join('\n') : '',
    '',
    ...writeRules,
  ].filter(Boolean).join('\n')
}
