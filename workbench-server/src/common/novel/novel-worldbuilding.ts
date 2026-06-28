/** 第 1 章写作固定注入：修炼体系 / 大陆 / 门派 */
import { NOVEL_OUTLINE_WORLD_SECTION } from '../../agents/novel-defaults.js'
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

/** 第 1 章固定世界观注入块（大纲优先，其次 world_bible.md） */
export function buildChapter1WorldIntroBlock(args: {
  outline?: string
  dramaId?: number
}): string {
  let raw = extractOutlineWorldBlock(args.outline || '')
  if (!raw && args.dramaId && NovelMemoryManager.exists(args.dramaId)) {
    const mgr = new NovelMemoryManager(args.dramaId)
    raw = extractWorldRules(mgr.readWorld(), 2800)
  }
  if (!raw) {
    return [
      '【第1章须介绍的世界观】',
      '全书大纲或 world_bible.md 中暂无【世界观设定】；请先完善大纲后再写第1章。',
      '若仍须写作：正文前段须自然交代修炼境界体系、故事所在大陆/地域、主要门派势力，且全书须保持名称一致。',
    ].join('\n')
  }

  const { cultivation, regions, factions } = pickWorldLines(raw)
  const bullets = [
    cultivation ? `- 修炼体系/境界：${cultivation.replace(/^\*\*[^*]+\*\*[：:]\s*/, '')}` : '',
    regions ? `- 大陆/地域：${regions.replace(/^\*\*[^*]+\*\*[：:]\s*/, '')}` : '',
    factions ? `- 门派/势力：${factions.replace(/^\*\*[^*]+\*\*[：:]\s*/, '')}` : '',
  ].filter(Boolean)

  return [
    '【第1章须介绍的世界观 — 正文前 1/3 须充分展开，名称须与下列完全一致，禁止别称（如大纲写凝气则不得写炼气）】',
    raw,
    bullets.length ? '\n要点（须全部写入正文，不可只提一两境）：\n' + bullets.join('\n') : '',
    '',
    '写作要求（第1章专用，优先级高于「快节奏」）：',
    '1. **修炼体系**：须自然交代大纲中的**完整境界链**（至少依次点到各 major 境名，而非只写「淬体、凝气」两句）；说明当前主角所处位置及上下境界关系；可借路人/回忆/宗门规矩带出，**禁止**用一整段说明书堆完就结束',
    '2. **大陆/地域**：须写出大纲中的**主要地理单元名称**（如东荒/南荒/中州等，有几写几）及彼此大致关系或差异，篇幅不少于 150 字的信息量',
    '3. **门派/势力**：须至少自然带出 **2 个**大纲中的宗门/势力名及与主角或当前场景的关系',
    '4. 以上世界观展开建议占全章 **400～800 字**（分散在对话、动作、环境描写中），**不是**条目列表，也**不是**只用 3～5 句概括带过',
    '5. 禁止自造大纲未列的大陆/境界别称（如大纲无「九霄大陆」则不得写；须用大纲中的地域名）',
  ].filter(Boolean).join('\n')
}
