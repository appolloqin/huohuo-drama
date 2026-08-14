/**
 * 小说写作服务 — 参考 AI-Writer 的续写逻辑：取文末上下文 + 大纲/前章衔接，一次生成长正文。
 */
import {
  chatCompletionText,
  sanitizeModelCreativeOutput,
  type ChatCompletionOptions,
  type ChatMessage,
  type TextBillingContext,
} from '../ai/ai.js'
import {
  assertValidNovelCreativeOutput,
  NO_THINKING_OUTPUT_RULE,
  normalizeGeneratedNovelTitle,
} from '../../common/novel/novel-creative-output.js'
import {
  WEBNOVEL_CHAPTER_PROSE_GUIDE,
  WEBNOVEL_NARRATIVE_TECHNIQUE_GUIDE,
  WEBNOVEL_OUTPUT_FORMAT_REMINDER,
  WEBNOVEL_COLLOQUIAL_GUIDE,
  WEBNOVEL_REWRITE_LAYOUT_RULE,
  WEBNOVEL_STAT_FINGERPRINT_GUIDE,
} from '../../agents/webnovel-prose-style.js'
import { NOVEL_OUTLINE_STRUCTURE_HINT, NOVEL_OUTLINE_VOLUME_SECTION, NOVEL_OUTLINE_WORLD_SECTION } from '../../agents/novel-defaults.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { polishNovelChapterProse, chapterLengthTokenBudget } from './novel-prose-polish.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { parseNovelMetadata, type NovelMetadata, isChapterCraftLengthSoftEnabled, isBeatSequentialGenerateEnabled } from '../../common/novel/novel-meta.js'
import {
  buildChapterOutlineDramaPromptBlock,
  OUTLINE_DRAMA_PRIORITY_LINE,
  assertOutlineChapterFields,
} from './novel-outline-drama-fields.js'
import { ensureOutlineBookDramaFields } from './novel-outline-drama-ensure.js'
import { countNovelChars, enforceAssembledLengthFloor, assertNovelChapterLengthBand } from '../../common/novel/novel-char-limit.js'
import { buildNovelWriteContext } from './novel-continuity.js'
import { NOVEL_MEMORY_CHAPTER_END_FORMAT, buildAnchorEchoPromptBlock, ensureAnchor, ensureNovelMemory, resolveVolumeForChapter } from './novel-memory/index.js'
import { CAUSAL_CHAPTER_END_FORMAT, isCausalChainEnabled } from './novel-causal-chain/index.js'
import { parseVolumeRanges, type OutlineVolumeRange, getMaxParsedChapterNumber, extractChapterOutline, listMissingOutlineChapters, listMissingOutlineChaptersInRange } from '../../common/novel/novel-outline.js'
import { truncText } from '../../common/drama/project-continuity.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import { parseChapterCraftTags, lengthFactorForRole } from './novel-chapter-craft-tags.js'
import {
  buildChapterSeamWriteBlock,
  buildForcedSeamOpeningBlock,
  buildOutlineStaleBlock,
  buildRewriteAntiSeamBlock,
  detectChapterSeamColdOpen,
  extractOutlineCatalystPhrases,
  formatNextChapterForbidBlock,
  formatNextChapterForwardSeamBlock,
} from './novel-chapter-seam.js'
import { outlineCatalystCoveredIn } from './novel-outline-beat-cover.js'
import { buildWritingSpecHardBlock } from './novel-brief-compliance.js'
import {
  filterDraftByChapterOutline,
} from './novel-draft-outline-filter.js'
import {
  alignNovelChapterOutlineBoundary,
  buildOutlineOnlyWritingStub,
} from './novel-outline-boundary.js'
import { resolveEffectiveChapterTarget } from './novel-chapter-target.js'
import { resolveChapterBeatBudgets, shouldUseBeatSequentialGenerate } from './novel-chapter-beat-budget.js'
import { hasRealWorldBlock } from '../../common/novel/novel-worldbuilding.js'
import { loadNextChapterContentHead, loadPrevChapterContentTail } from './novel-continuity.js'
import { loadPrevChapterEndSnapshot } from './novel-chapter-end-snapshot.js'

const MAX_NOVEL_USER_PROMPT_CHARS = 32000

/** M2：情节优先序（生成/续写/数字作家共用） */
const CHAPTER_PLOT_PRIORITY_LINE =
  '【情节优先序】本章大纲（含【本章起因】）> 上章已发生事实 > 写作说明。写作说明不得另起出门/进山等与大纲或上章事实冲突的起势。'

function joinNovelPromptBlocks(blocks: string[]): string {
  const filtered = blocks.filter(Boolean)
  let joined = filtered.join('\n\n')
  if (joined.length <= MAX_NOVEL_USER_PROMPT_CHARS) return joined

  const head = filtered.slice(0, 3).join('\n\n')
  const tail = filtered.slice(-5).join('\n\n')
  const budget = MAX_NOVEL_USER_PROMPT_CHARS - head.length - tail.length - 64
  const middle = filtered.slice(3, -5).join('\n\n')
  const midTrimmed = middle.length > Math.max(budget, 800)
    ? `${middle.slice(0, Math.max(budget, 800))}\n…（前序上下文过长已截断，请以锁定事实与上章摘录为准）`
    : middle
  joined = [head, midTrimmed, tail].filter(Boolean).join('\n\n')
  if (joined.length > MAX_NOVEL_USER_PROMPT_CHARS) {
    logTaskWarn('Novel', 'prompt-truncated', { chars: joined.length })
    joined = `${joined.slice(0, MAX_NOVEL_USER_PROMPT_CHARS)}\n…（上下文已截断）`
  }
  return joined
}

function formatChapterOutlineBlock(chapterOutline: string | undefined, chapterNumber: number): string {
  const trimmed = chapterOutline?.trim()
  if (!trimmed) return ''
  const dramaHint = /【欲望】/.test(trimmed) && /【阻碍】/.test(trimmed)
    ? '\n硬性补充：【本章起因】若上章正文尚未写到，本章须先写清其过程再进入欲望/阻碍；仅当前序已写完该起因时才禁止重演。'
    : ''
  if (chapterNumber >= 2) {
    return `【本章大纲（须落实情节与章末状态；若与前序已写冲突或含已完成拍点，须以前序为准，禁止按过期大纲倒退开篇）】\n${trimmed}${dramaHint}`
  }
  return `【本章大纲（须落实；情节节点与章末状态勿擅自改写）】\n${trimmed}${dramaHint}`
}

/** 章节大纲正文：优先 episode.description，否则全书大纲分章摘录 */
async function loadChapterOutlineText(dramaId: number, chapterNumber: number): Promise<string> {
  if (!(dramaId > 0) || !(chapterNumber >= 1)) return ''
  try {
    const ep = await episodesRepo.findEpisodeByDramaAndNumber(dramaId, chapterNumber)
    const fromEp = ep?.description?.trim()
    if (fromEp) return fromEp
    const drama = await dramasRepo.findDramaById(dramaId)
    const meta = parseNovelMetadata(drama?.metadata)
    return extractChapterOutline(meta.outline || '', chapterNumber).trim()
  } catch {
    return ''
  }
}

/** 在场人物：只认上章末已出场 + 本章大纲明示；禁无交代亲属复数 */
const CAST_CONTINUITY_RULE = [
  '**在场人物硬性**：本章可写人物 = 上章末已出场/已交代者 ∪ 本章大纲点名者。',
  '禁止无交代使用「娘俩」「一家三口」「爹妈」等暗示未出场亲属的称谓；新婚二人用「她/媳妇/俩口子」等已成立称谓即可。',
  '大纲未点名的邻里默认「墙外女人/邻家/外头声」；若要起名，须半句交代来历，计入铺垫预算，禁止开篇直接点名抢戏。',
  '若须新出场人物，须在本场有来由（敲门、墙外声、上门等），不得脑内一句带出未交代的家里人。',
].join('')

function tailContext(text: string, maxChars: number) {
  if (text.length <= maxChars) return text
  return text.slice(-maxChars)
}

export async function generateNovelPremise(args: {
  title?: string
  keywords: string
  genre?: string
  totalChapters?: number
}, billing?: TextBillingContext): Promise<string> {
  const { title, keywords, genre, totalChapters } = args
  const system = await buildNovelAgentSystem('novel_premise')
  const options = await novelAgentCompletionOptions('novel_premise', { maxTokens: 2048, temperature: 0.78 })

  const user = [
    title ? `【书名】${title}` : '',
    genre ? `【题材】${genre}` : '',
    totalChapters ? `【计划章数】约 ${totalChapters} 章` : '',
    `【关键词】\n${keywords}`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const premise = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  return assertValidNovelCreativeOutput(premise, 'premise')
}

export { normalizeGeneratedNovelTitle }

const NOVEL_TITLE_GEN_RULES = `你是资深网文编辑，擅长起能上架番茄/起点/晋江的商业网文书名。
本次任务：根据用户给出的草稿名或关键词，生成【一个】一看就知道是网文小说的中文书名。

## 书名必须传达（至少两点）
1. 题材/标签：如重生、穿书、系统、玄幻、都市、言情、战神、神医等
2. 主角身份或处境反差：废柴、赘婿、嫡女、外卖员、重生归来等
3. 爽点/情绪钩子：逆袭、打脸、宠、觉醒、开局、藏不住了等（有动词更好）

## 推荐公式（择一落地，勿堆砌）
- 题材/标签 + 身份 + 爽点动作（例：高武：开局觉醒满级悟性）
- 身份反差 + 命运翻转（例：穿成恶毒嫡女后，我把全家带赢了）
- 金手指 + 冲突对象 + 爽感承诺（例：时停起手，邪神也得给我跪下）
- 情绪/关系钩子（例：闪婚后傅总马甲藏不住了）
- 精炼立意短名（偏长篇付费风，4～8字，例：大奉打更人）—仅当题材偏严肃长篇时选用

## 字数与风格
- 默认偏免费/强钩子风：8～16个汉字，口语、信息密度高，前半段就要有钩子
- 若题材偏「玄幻长篇/仙侠史诗」可出 4～9 字精炼名，但仍须有网文感（忌纯文艺抽象）
- 可含冒号、逗号、数字；不要书名号《》、引号、英文、表情

## 严禁（一看就不像网文）
- 文艺空洞：云与梦、时光、岁月、彼岸、无题、随笔
- 只有抽象词或成语堆砌，看不出故事卖点
- 设定堆砌成说明书：无敌功法系统大全
- 影视剧片名腔、散文诗、歌词名
- 输出多个候选、解释、前后缀

硬性：只输出书名本身一行。
${NO_THINKING_OUTPUT_RULE}`

/**
 * 根据关键词生成网文书名（复用 novel_premise 模型配置，短提示只出书名）。
 */
export async function generateNovelTitle(args: {
  keywords: string
  genre?: string
  totalChapters?: number
}, billing?: TextBillingContext): Promise<string> {
  const { keywords, genre, totalChapters } = args
  const system = [
    await buildNovelAgentSystem('novel_premise'),
    '',
    NOVEL_TITLE_GEN_RULES,
  ].join('\n')
  const options = await novelAgentCompletionOptions('novel_premise', { maxTokens: 128, temperature: 0.82 })

  const user = [
    genre ? `【题材】${genre}` : '',
    totalChapters ? `【计划章数】约 ${totalChapters} 章` : '',
    `【草稿名/关键词】\n${keywords}`,
    '请把上述内容改写成一个可上架的网文书名（只输出一行）：',
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  const title = normalizeGeneratedNovelTitle(raw)
  if ([...title].length < 2) {
    throw new Error('书名生成结果过短，请重试或改写关键词')
  }
  return title
}

export async function generateNovelWritingBrief(args: {
  keywords: string
  dramaTitle: string
  chapterNumber: number
  chapterTitle: string
  chapterOutline?: string
  genre?: string
  dramaId?: number
  chapterId?: number
  meta?: NovelMetadata
}, billing?: TextBillingContext): Promise<string> {
  const {
    keywords, dramaTitle, chapterNumber, chapterTitle, chapterOutline, genre,
    dramaId, chapterId, meta,
  } = args
  const system = await buildNovelAgentSystem('novel_writing_brief')
  const options = await novelAgentCompletionOptions('novel_writing_brief', { maxTokens: 4096, temperature: 0.76 })

  const contextBlocks: string[] = []
  if (dramaId && chapterId && meta) {
    const ctx = await buildNovelWriteContext({
      dramaId,
      chapterNumber,
      chapterId,
      meta,
      retrievalQuery: [chapterOutline, keywords].filter(Boolean).join('\n'),
      includeSelfHint: false,
      writingBrief: keywords,
      bookOutline: meta.outline,
    })
    contextBlocks.push(
      chapterNumber === 1 ? ctx.worldbuildingBlock : '',
      chapterNumber === 1 ? ctx.outlineBlock : '',
      ctx.premiseBlock,
      ctx.structuredBlock,
      ctx.continuity,
      ctx.characterBlock,
    )
  }

  const user = [
    ...contextBlocks.filter(Boolean),
    `【书名】${dramaTitle}`,
    genre ? `【题材】${genre}` : '',
    `【本章】第${chapterNumber}章${chapterTitle ? ` ${chapterTitle}` : ''}`,
    formatChapterOutlineBlock(chapterOutline, chapterNumber),
    `【关键词】\n${keywords}`,
    chapterNumber >= 2
      ? '请输出含【一致性账本】的写作说明；**不得改写前序已锁定的人名与事件**，本章大纲仅作方向参考。'
      : '请输出含【一致性账本】的写作说明；第1章须规划如何自然介绍修炼体系/境界、大陆/地域与门派势力（与【世界观设定】一致）。',
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const brief = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  return assertValidNovelCreativeOutput(brief, 'writing_brief', `第${chapterNumber}章`)
}

/**
 * 超过此章数则「骨架 + 分卷分批」生成分章概要。
 * 戏剧标签章块约 250～400 字/章；100 章单次 16k tokens 会在中段截断（曾出现止于第70章半截标签）。
 */
const OUTLINE_PHASED_THRESHOLD = 30
/** 单次 API 最多生成的分章数（全标签块），避免卷内 25 章仍被截断 */
const OUTLINE_VOLUME_CHUNK_SIZE = 15

const OUTLINE_CHAPTER_CONTINUITY_RULES = [
  '地点/道具/新关键人物若前文未出现：须在【本章起因】或【信息增量】写清首次出场来由，禁止无铺垫空降新场合。',
  '【冲突层】只能：外部、人际、自我（可多选）。',
  '每章必须是完整戏剧标签块（标题下行齐 13 个【】标签），禁止「每章一行」缩写。',
].join('\n')

function outlineMaxTokensForChapters(totalChapters: number): number {
  if (totalChapters <= OUTLINE_PHASED_THRESHOLD) return 16384
  return 8192
}

/** 把过大的卷切成小段，保证每段都能塞进完整戏剧标签 */
function chunkOutlineVolume(vol: OutlineVolumeRange, chunkSize = OUTLINE_VOLUME_CHUNK_SIZE): OutlineVolumeRange[] {
  const size = Math.max(8, chunkSize)
  if (vol.end - vol.start + 1 <= size) return [vol]
  const out: OutlineVolumeRange[] = []
  for (let start = vol.start; start <= vol.end; start += size) {
    const end = Math.min(vol.end, start + size - 1)
    out.push({
      label: `${vol.label}（第${start}～${end}章）`,
      start,
      end,
      blurb: vol.blurb,
    })
  }
  return out
}

/** 去掉末章残缺块（max_tokens 截断常见：停在【局面变化 半截） */
function stripIncompleteTrailingChapter(outline: string): string {
  const max = getMaxParsedChapterNumber(outline)
  if (max < 1) return outline
  const check = assertOutlineChapterFields(outline, max)
  if (check.ok) return outline
  const re = new RegExp(`(?:^|\\n)第\\s*${max}\\s*章`)
  const m = re.exec(outline)
  if (!m) return outline
  const idx = m.index + (m[0].startsWith('\n') ? 1 : 0)
  logTaskWarn('Novel', 'outline-strip-incomplete-trailing', {
    chapter: max,
    missing: check.missing,
    invalid: check.invalid,
  })
  return outline.slice(0, idx).trimEnd()
}

function stripChapterSummarySection(text: string): string {
  const idx = text.search(/\n【分章概要】/)
  return idx >= 0 ? text.slice(0, idx).trim() : text.trim()
}

function mergeOutlineSkeletonAndChapters(skeleton: string, volumeBlocks: OutlineVolumeRange[], parts: string[]): string {
  const base = stripChapterSummarySection(skeleton)
  const body = volumeBlocks.map((vol, i) => {
    const block = (parts[i] || '').trim()
    const header = `--- ${vol.label} ---`
    return block.startsWith('---') ? block : `${header}\n${block}`
  }).filter(Boolean).join('\n\n')
  return `${base}\n\n【分章概要】\n${body}`
}

async function generateOutlineSkeleton(
  args: { title: string; premise: string; genre?: string; totalChapters: number },
  billing?: TextBillingContext,
): Promise<string> {
  const { title, premise, genre, totalChapters } = args
  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    NOVEL_OUTLINE_STRUCTURE_HINT,
    '',
    `本次须规划全部 ${totalChapters} 章。`,
    `「${NOVEL_OUTLINE_VOLUME_SECTION}」须连续划分第 1～${totalChapters} 章，各卷范围不重叠、不遗漏。`,
    '**本轮只输出**：世界观设定、总纲、主要人物、分卷设计；**不要输出【分章概要】或任何「第N章」分章行**。',
  ].join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: outlineMaxTokensForChapters(totalChapters),
    temperature: 0.7,
  })

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【计划章数】${totalChapters}`,
    `【创意/梗概】\n${premise}`,
    `【硬性要求】大纲开头必须是「${NOVEL_OUTLINE_WORLD_SECTION}」，且须含「修炼体系」「大陆/地域」「修真门派/势力」三项；修炼体系用「-」连接完整境界链。须含「${NOVEL_OUTLINE_VOLUME_SECTION}」，每卷写明卷名、章节范围与本卷大纲。`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const skeleton = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  return assertValidNovelCreativeOutput(skeleton, 'outline_skeleton')
}

async function generateVolumeChapterSummaries(args: {
  skeleton: string
  volume: OutlineVolumeRange
  title: string
  premise: string
  genre?: string
  totalChapters: number
  prevTail?: string
}, billing?: TextBillingContext): Promise<string> {
  const { skeleton, volume, title, premise, genre, totalChapters, prevTail } = args
  const count = volume.end - volume.start + 1
  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    `本轮**仅输出**第 ${volume.start}～${volume.end} 章（共 ${count} 章）的分章概要。`,
    '格式：每章先「第N章：标题」，其下带齐【本章时间】【本章地点】【本章人物】【本章起因】【欲望】【阻碍】【局面变化】【人物选择】【冲突层】【情绪手法】【章末问题】【信息增量】【主题回响】。',
    OUTLINE_CHAPTER_CONTINUITY_RULES,
    '章节号须与分卷设计完全一致，禁止跳号、重复或改写其他卷的章号。',
    '不要输出世界观、总纲、人物、分卷设计；不要前言套话。',
  ].join('\n')

  const options = await novelAgentCompletionOptions('novel_outline', {
    // 全戏剧标签块约 300～400 token/章；旧 count*90 过紧会导致卷中截断
    maxTokens: Math.min(16384, Math.max(8192, count * 380)),
    temperature: 0.68,
  })

  const volSeed = volume.blurb
    ? `【本卷规划】\n${volume.blurb}`
    : `【本卷】${volume.label}（第 ${volume.start}～${volume.end} 章）`

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【全书章数】${totalChapters}`,
    `【创意/梗概】\n${premise.slice(0, 1200)}`,
    `【全书骨架 — 分卷须严格遵守】\n${stripChapterSummarySection(skeleton).slice(0, 6000)}`,
    volSeed,
    prevTail ? `【上一卷末章概要 — 须自然衔接】\n${prevTail}` : '',
    `【任务】完整输出第 ${volume.start} 章～第 ${volume.end} 章戏剧标签块（每章一整块，勿缩成一行）；卷末须有高潮或强钩子。`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing: billing ? { ...billing, reason: `小说大纲分卷（${volume.start}-${volume.end}章）` } : undefined },
  )
  const trimmed = raw.trim()
  if (!/第\s*\d+\s*章/.test(trimmed)) {
    throw new Error(`分卷「${volume.label}」分章概要生成失败（无章节行），请重试`)
  }
  return trimmed
}

async function generateOutlineChapterTail(args: {
  skeleton: string
  existingOutline: string
  fromChapter: number
  toChapter: number
  title: string
  premise: string
  genre?: string
}, billing?: TextBillingContext): Promise<string> {
  const { skeleton, existingOutline, fromChapter, toChapter, title, premise, genre } = args
  const count = toChapter - fromChapter + 1
  const tailMap = getMaxParsedChapterNumber(existingOutline)
  const lastLine = existingOutline.split('\n').filter(l => /第\s*\d+\s*章/.test(l)).slice(-3).join('\n')

  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    `补全缺失的第 ${fromChapter}～${toChapter} 章分章概要；紧接前文剧情。`,
    '格式：每章先「第N章：标题」，其下带齐全部戏剧标签。',
    OUTLINE_CHAPTER_CONTINUITY_RULES,
  ].join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: Math.min(16384, Math.max(8192, count * 380)),
    temperature: 0.68,
  })

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【全书骨架】\n${stripChapterSummarySection(skeleton).slice(0, 4000)}`,
    `【已生成分章 — 最大第 ${tailMap} 章】\n${lastLine}`,
    `【任务】续写第 ${fromChapter}～${toChapter} 章完整戏剧标签块；写完第 ${toChapter} 章终局/收束。`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  return (await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )).trim()
}

export async function generateNovelOutline(args: {
  title: string
  premise: string
  genre?: string
  totalChapters: number
}, billing?: TextBillingContext): Promise<string> {
  const { title, premise, genre, totalChapters } = args

  if (totalChapters <= OUTLINE_PHASED_THRESHOLD) {
    const one = await generateNovelOutlineSingleShot(args, billing)
    return ensureOutlineBookDramaFields({
      outline: one,
      title,
      premise,
      billing,
    })
  }

  const skeleton = await generateOutlineSkeleton(args, billing)
  const volumes = parseVolumeRanges(skeleton, totalChapters)
    .flatMap(v => chunkOutlineVolume(v))
  const parts: string[] = []
  let prevTail = ''

  for (const vol of volumes) {
    let block = await generateVolumeChapterSummaries({
      skeleton,
      volume: vol,
      title,
      premise,
      genre,
      totalChapters,
      prevTail,
    }, billing)
    block = stripIncompleteTrailingChapter(block)
    // 本段缺章则补一轮
    const missInChunk = listMissingOutlineChaptersInRange(block, vol.start, vol.end)
    if (missInChunk.length) {
      logTaskWarn('Novel', 'outline-volume-chunk-gaps', {
        volume: vol.label,
        missing: missInChunk,
      })
      const from = missInChunk[0]
      const to = missInChunk[missInChunk.length - 1]
      const patch = await generateOutlineChapterTail({
        skeleton,
        existingOutline: `${skeleton}\n\n【分章概要】\n${[...parts, block].join('\n\n')}`,
        fromChapter: from,
        toChapter: to,
        title,
        premise,
        genre,
      }, billing)
      block = `${block.trim()}\n\n${stripIncompleteTrailingChapter(patch)}`
    }
    parts.push(block)
    prevTail = block.split('\n').filter(l => /第\s*\d+\s*章/.test(l)).slice(-2).join('\n')
  }

  let outline = mergeOutlineSkeletonAndChapters(skeleton, volumes, parts)
  outline = stripIncompleteTrailingChapter(outline)

  let missing = listMissingOutlineChapters(outline, totalChapters)
  let guard = 0
  while (missing.length && guard < 3) {
    guard += 1
    logTaskWarn('Novel', 'outline-incomplete-tail', {
      totalChapters,
      missing: missing.slice(0, 20),
      attempt: guard,
    })
    const fromChapter = missing[0]
    const toChapter = Math.min(
      totalChapters,
      fromChapter + OUTLINE_VOLUME_CHUNK_SIZE - 1,
      missing[missing.length - 1],
    )
    const tail = await generateOutlineChapterTail({
      skeleton,
      existingOutline: outline,
      fromChapter,
      toChapter,
      title,
      premise,
      genre,
    }, billing)
    outline = `${outline.trim()}\n${stripIncompleteTrailingChapter(tail)}`
    missing = listMissingOutlineChapters(outline, totalChapters)
  }

  return ensureOutlineBookDramaFields({
    outline: assertValidNovelCreativeOutput(outline, 'outline', undefined, { totalChapters }),
    title,
    premise,
    billing,
  })
}

async function generateNovelOutlineSingleShot(
  args: { title: string; premise: string; genre?: string; totalChapters: number },
  billing?: TextBillingContext,
): Promise<string> {
  const { title, premise, genre, totalChapters } = args
  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    NOVEL_OUTLINE_STRUCTURE_HINT,
    '',
    `本次分章概要须覆盖第 1 章～第 ${totalChapters} 章；「${NOVEL_OUTLINE_VOLUME_SECTION}」须划分全部 ${totalChapters} 章，各卷章节范围连续且不遗漏。`,
  ].join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: outlineMaxTokensForChapters(totalChapters),
    temperature: 0.7,
  })

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【计划章数】${totalChapters}`,
    `【创意/梗概】\n${premise}`,
    `【硬性要求】大纲开头必须是「${NOVEL_OUTLINE_WORLD_SECTION}」，且须含「修炼体系」「大陆/地域」「修真门派/势力」三项；修炼体系用「-」连接完整境界链。须含「${NOVEL_OUTLINE_VOLUME_SECTION}」，每卷写明卷名、章节范围与本卷大纲。分章概要必须写满第 ${totalChapters} 章，不得中途截断。新地点/道具须有出场来由；【冲突层】仅外部/人际/自我。`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const outline = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  return assertValidNovelCreativeOutput(outline, 'outline', undefined, { totalChapters })
}

export async function buildContinueNovelMessages(args: {
  dramaTitle: string
  chapterNumber: number
  chapterTitle: string
  existingText: string
  meta: NovelMetadata
  dramaId: number
  chapterId: number
  lengthHint?: number
  /** 写作说明 / 大纲，用于章职软字数与 craft 修正 */
  writingBrief?: string
  chapterOutline?: string
  /** 质量修正时注入的续写指令 */
  craftFixInstruction?: string
}): Promise<{ messages: ChatMessage[]; options: ChatCompletionOptions }> {
  const {
    dramaTitle, chapterNumber, chapterTitle, existingText, meta, dramaId, chapterId, lengthHint = 800,
    writingBrief, chapterOutline, craftFixInstruction,
  } = args

  const prevTailEarly = chapterNumber >= 2
    ? await loadPrevChapterContentTail(dramaId, chapterNumber, 1200)
    : ''
  const prevSnapEarly = chapterNumber >= 2
    ? await loadPrevChapterEndSnapshot(dramaId, chapterNumber)
    : null
  const prevSeamHint = prevSnapEarly
    ? [prevSnapEarly.time, prevSnapEarly.place, prevSnapEarly.last_event].filter(Boolean).join(' · ')
    : prevTailEarly.slice(-240)

  const outlineAlign = alignNovelChapterOutlineBoundary({
    chapterOutline,
    writingBrief,
    existingText,
    mode: 'continue',
    chapterNumber,
    prevSeamHint,
  })
  if (outlineAlign.conflictNotes.length) {
    logTaskWarn('Novel', 'outline-boundary-align', {
      chapterNumber,
      mode: 'continue',
      notes: outlineAlign.conflictNotes.slice(0, 4),
      draftConflictsOutline: outlineAlign.draftConflictsOutline,
      briefPlotDiscarded: outlineAlign.conflictNotes.some(n => /brief-plot-discarded/.test(n)),
    })
  }
  const alignedBrief = outlineAlign.alignedBrief || writingBrief || ''

  const ctxChars = Math.min(Math.max(meta.context_chars || 4000, 512), 12000)
  const contextTail = tailContext(existingText, ctxChars)
  const tags = parseChapterCraftTags(alignedBrief, chapterOutline, existingText)
  const soft = isChapterCraftLengthSoftEnabled(meta)
  const factor = soft ? lengthFactorForRole(tags.role) : 1
  const effectiveHint = Math.round(lengthHint * factor)
  const segMin = soft
    ? Math.round(effectiveHint * (tags.role === 'breath' || tags.role === 'travel' ? 0.7 : 0.85))
    : Math.round(lengthHint * 0.9)
  const segMax = soft
    ? Math.round(effectiveHint * (tags.role === 'breath' || tags.role === 'travel' ? 1.05 : 1.12))
    : Math.round(lengthHint * 1.15)

  const ctx = await buildNovelWriteContext({
    dramaId,
    chapterNumber,
    chapterId,
    meta,
    retrievalQuery: [chapterOutline, existingText.slice(-500)].filter(Boolean).join('\n'),
    writingBrief: alignedBrief || undefined,
    bookOutline: meta.outline,
    chapterOutline,
  })

  const lengthRule = soft
    ? `单次续写篇幅建议约 ${effectiveHint} 字，建议 ${segMin}～${segMax} 字${tags.role ? `（章职 ${tags.role}）` : ''}；情节推进即可，勿灌水。`
    : `单次续写目标约 ${lengthHint} 字，控制在 ${Math.round(lengthHint * 0.9)}～${Math.round(lengthHint * 1.1)} 字，**不得超过 ${Math.round(lengthHint * 1.15)} 字**。`

  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    WEBNOVEL_CHAPTER_PROSE_GUIDE,
    '',
    WEBNOVEL_NARRATIVE_TECHNIQUE_GUIDE,
    '',
    WEBNOVEL_STAT_FINGERPRINT_GUIDE,
    '',
    WEBNOVEL_COLLOQUIAL_GUIDE,
    '',
    CHAPTER_PLOT_PRIORITY_LINE,
    '',
    '当前任务：**续写**后续内容（只输出新增段落，不要重复已有文字）。',
    '结构与章末止点服从【本章大纲边界】；勿把边界之后的完成态写进本段。',
    lengthRule,
    '排版与口气须与上文一致，但勿复制上文的书面腔/AI 套话；段落长短自然变化，带适度语气词。',
    '**时间与金钱数字**：年、月、日、点钟用阿拉伯数字（1990年、3月、15日、3点）；金额用 800元、2000元，勿用八百元/两千元。',
    '若提供状态账本或角色表，须严格对齐，禁止吃书。',
    chapterNumber >= 2
      ? '**本章仅依据「本章大纲」+「前序已写章节」**；勿从全书大纲其他章套用未写成的人名或事件。**禁止章缝回放**：勿重演上章末已完成的公开高潮；开篇不得早于上章末已发生事实。**不考虑下章**；写到本章大纲硬止点即停。'
      : '',
    craftFixInstruction?.trim() ? '\n' + craftFixInstruction.trim() : '',
  ].filter(Boolean).join('\n')

  let anchorBlock = ''
  if (meta.anchor_echo_enabled !== false) {
    ensureNovelMemory(dramaId, { outline: meta.outline })
    const anchor = await ensureAnchor(dramaId, chapterNumber)
    const vol = resolveVolumeForChapter(meta.outline, chapterNumber)
    anchorBlock = buildAnchorEchoPromptBlock({
      vol, chapter: chapterNumber, anchor, minLen: segMin, maxLen: segMax,
    })
  }

  const pendingCatalysts = chapterNumber >= 2 && chapterOutline?.trim()
    ? extractOutlineCatalystPhrases(chapterOutline).filter(c =>
      !prevTailEarly.trim() || !outlineCatalystCoveredIn(prevTailEarly, c),
    )
    : []
  // 本章尚无正文或极短：对齐重写接缝；有正文续写则只靠【待续写上下文】，不灌上章 tip 悬念
  const openChapterContinue = !existingText.trim() || countNovelChars(existingText) < 80
  const seamBlock = chapterNumber >= 2 && (openChapterContinue || pendingCatalysts.length > 0)
    ? buildChapterSeamWriteBlock(prevTailEarly, {
      omitRawPrevProse: true,
      prevSnapshot: prevSnapEarly,
      maxTailChars: 160,
    })
    : ''
  const forcedSeamBlock = chapterNumber >= 2 && openChapterContinue
    ? buildForcedSeamOpeningBlock({ chapterOutline, prevTail: prevTailEarly, prevSnapshot: prevSnapEarly })
    : ''
  const pendingCatalystBlock = openChapterContinue && pendingCatalysts.length
    ? [
      '【本章起因 — 须立刻落地】',
      ...pendingCatalysts.slice(0, 3).map((c, i) => `${i + 1}. ${c}`),
      '硬性：开篇写清该起因由【本章人物】完成；接缝只提供上章结构化事实，禁止续写上章末悬念正文。',
    ].join('\n')
    : ''

  const blocks = [
    ctx.worldbuildingBlock,
    ctx.outlineBlock,
    ctx.premiseBlock,
    ctx.structuredBlock,
    ctx.continuity,
    seamBlock,
    forcedSeamBlock,
    pendingCatalystBlock,
    ctx.characterBlock,
    ctx.selfHint,
    formatChapterOutlineBlock(chapterOutline, chapterNumber),
    outlineAlign.boundaryBlock,
    alignedBrief.trim() && alignedBrief.trim() !== chapterOutline?.trim()
      ? `【写作说明（须落实；已与大纲边界对齐）】\n${alignedBrief.trim()}`
      : '',
    outlineAlign.draftConflictsOutline
      ? '【续写边界】已有正文已超出大纲末拍：本段只可收束/补反应，禁止再展开边界之后的完成态场面。'
      : '',
    `【书名】${dramaTitle}`,
    `【当前章】第${chapterNumber}章${chapterTitle ? ` ${chapterTitle}` : ''}`,
    contextTail
      ? `【待续写上下文（紧接其后继续写）】\n${contextTail}`
      : '【待续写上下文】（本章尚无正文，请写开篇；承接上章已发生事实后进入本章大纲）',
    soft
      ? `【篇幅建议】本段约 ${segMin}～${segMax} 字。`
      : `【篇幅】本段约 ${segMin}～${segMax} 字。`,
    WEBNOVEL_OUTPUT_FORMAT_REMINDER + ' 另检：本段是否仍在【本章大纲边界】内？写到硬止点即停，不考虑下章。',
    anchorBlock,
  ].filter(Boolean)

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: joinNovelPromptBlocks(blocks) },
    ],
    options: await novelAgentCompletionOptions('novel_chapter_writer', { maxTokens: 4096, temperature: 0.82 }),
  }
}

export async function continueNovelChapter(
  args: Parameters<typeof buildContinueNovelMessages>[0],
  billing?: TextBillingContext,
): Promise<string> {
  const { messages, options } = await buildContinueNovelMessages(args)
  const draft = await chatCompletionText(messages, { ...options, billing })
  const polished = await polishNovelChapterProse(draft, billing, { mode: 'segment', colloquialBoost: true })
  return normalizeNovelTemporalNumerals(polished)
}

export async function buildGenerateNovelChapterMessages(args: {
  dramaTitle: string
  chapterNumber: number
  chapterTitle: string
  prompt: string
  chapterOutline?: string
  meta: NovelMetadata
  dramaId: number
  chapterId: number
  existingText?: string
  targetLength?: number
  /** rewrite：结合上章与本章草稿整章重写；默认一次生成 */
  mode?: 'generate' | 'rewrite'
  /**
   * 是否注入下章禁写/正向章缝。默认仅 rewrite 为 true。
   * 一次生成 / 数字作家 / 由生成触发的 craft 重生为 false。
   */
  includeNextChapter?: boolean
}): Promise<{ messages: ChatMessage[]; options: ChatCompletionOptions; maxLen: number; minLen: number }> {
  const {
    dramaTitle, chapterNumber, chapterTitle, prompt, chapterOutline, meta, dramaId, chapterId, existingText,
    targetLength = 3000,
    mode = 'generate',
    includeNextChapter,
  } = args
  const isRewrite = mode === 'rewrite'
  const withNext = includeNextChapter ?? isRewrite

  const prevTail = chapterNumber >= 2
    ? await loadPrevChapterContentTail(dramaId, chapterNumber, 1600)
    : ''
  const prevSnap = chapterNumber >= 2
    ? await loadPrevChapterEndSnapshot(dramaId, chapterNumber)
    : null
  const prevSeamHint = prevSnap
    ? [prevSnap.time, prevSnap.place, prevSnap.last_event].filter(Boolean).join(' · ')
    : prevTail.slice(-240)

  const outlineAlign = alignNovelChapterOutlineBoundary({
    chapterOutline,
    writingBrief: prompt,
    existingText,
    mode,
    chapterNumber,
    prevSeamHint,
  })
  if (outlineAlign.conflictNotes.length) {
    logTaskWarn('Novel', 'outline-boundary-align', {
      chapterNumber,
      notes: outlineAlign.conflictNotes.slice(0, 4),
      draftConflictsOutline: outlineAlign.draftConflictsOutline,
      briefPlotDiscarded: outlineAlign.conflictNotes.some(n => /brief-plot-discarded/.test(n)),
    })
  }
  const alignedBrief = outlineAlign.alignedBrief || prompt

  const userTarget = Math.min(20000, Math.max(500, targetLength))
  const beatTarget = resolveEffectiveChapterTarget({
    chapterOutline,
    userTarget,
  })
  const target = beatTarget.effectiveTarget
  const tags = parseChapterCraftTags(alignedBrief, chapterOutline)
  const boundarySuspend = outlineAlign.endpointPending
  const soft = isChapterCraftLengthSoftEnabled(meta) || boundarySuspend
  const factor = soft && !boundarySuspend ? lengthFactorForRole(tags.role) : 1
  const effectiveTarget = Math.round(target * factor)
  // 末拍宜悬停时字数下限略软，避免为凑字越过大纲边界（不因拍点少而砍半目标）
  const minLen = boundarySuspend
    ? Math.round(target * 0.82)
    : soft
      ? Math.round(effectiveTarget * (tags.role === 'breath' || tags.role === 'travel' ? 0.7 : 0.9))
      : Math.round(target * 0.88)
  const maxLen = soft
    ? Math.round(effectiveTarget * (tags.role === 'breath' || tags.role === 'travel' || boundarySuspend ? 1.08 : 1.12))
    : Math.round(target * 1.08)

  const ctx = await buildNovelWriteContext({
    dramaId,
    chapterNumber,
    chapterId,
    meta,
    retrievalQuery: [chapterOutline, alignedBrief].filter(Boolean).join('\n'),
    writingBrief: alignedBrief,
    bookOutline: meta.outline,
    chapterOutline,
  })

  const tokenCeiling = chapterLengthTokenBudget(maxLen)
  const fallbackOptions = {
    maxTokens: tokenCeiling,
    temperature: isRewrite ? 0.84 : 0.8,
  }
  const beatBudgets = resolveChapterBeatBudgets({
    chapterOutline,
    userTarget: target,
    endpointPending: boundarySuspend,
    prevChapterTail: prevTail,
  })
  const beatLengthNote = beatBudgets.promptBlock || beatTarget.promptBlock
  const lengthBoundNote = outlineAlign.boundaryBlock
    ? '另：**字数只服务本章大纲已列拍点**；禁止用大纲未列的后续情节凑字；**宁可贴近目标略短，也不可为凑字越过【章末硬止点】**。'
    : ''
  const endpointStopNote = outlineAlign.lastBeat
    ? `**章末硬止点**：「${outlineAlign.lastBeat}」——写到此处即收束；禁止再写大纲未列的新人物登门、新冲突或新完成态。`
    : ''
  const lengthRule = (
    soft
    ? [
      `**篇幅**：目标 ${boundarySuspend ? target : effectiveTarget} 字，须尽量贴近目标，落在 ${minLen}～${maxLen} 字`,
      tags.role === 'breath' || tags.role === 'travel'
        ? '（章职为收息/赶路：宜短，禁止灌水凑字）'
        : `；**上限**不得超过 ${maxLen} 字；**下限**不宜明显短于 ${minLen} 字（禁止写成目标的七八成就停）。`,
    ].join('')
    : boundarySuspend
      ? `**篇幅**：目标 ${target} 字，尽量落在 ${minLen}～${maxLen} 字；**宁短勿越过章末硬止点**；只在【篇幅预算】各拍内写厚。`
      : `**字数要求**：本章正文目标 ${target} 字，尽量写满 ${minLen}～${maxLen} 字；情节完整；**不得用大纲未列情节凑字**。`
  ) + (beatLengthNote ? ` ${beatLengthNote}` : '') + (lengthBoundNote ? ` ${lengthBoundNote}` : '') + (endpointStopNote ? ` ${endpointStopNote}` : '')

  // 先裁定旧稿结构，再组 system/user（结构作废时须覆盖「以前序为准」以免冷开篇）
  // prevTail / prevSnap 已在 outlineAlign 前加载
  // 仅「用户重写」默认带下文；一次生成 / 数字作家 / craft 可显式关闭
  const { loadChapterStateCard } = await import('./novel-state-card-service.js')
  const { formatNeighborStateCardsBlock } = await import('../../common/novel/novel-state-card.js')
  const prevStateCard = chapterNumber >= 2
    ? await loadChapterStateCard(dramaId, chapterNumber - 1)
    : null
  const nextStateCard = withNext
    ? await loadChapterStateCard(dramaId, chapterNumber + 1)
    : null
  const neighborStateCardBlock = formatNeighborStateCardsBlock({
    prevCard: prevStateCard,
    nextCard: nextStateCard,
  })
  const nextChapterOutline = withNext && dramaId > 0
    ? await loadChapterOutlineText(dramaId, chapterNumber + 1)
    : ''
  const nextChapterForbidBlock = withNext
    ? formatNextChapterForbidBlock(nextChapterOutline, chapterNumber)
    : ''
  const nextChapterHead = withNext && dramaId > 0
    ? await loadNextChapterContentHead(dramaId, chapterNumber, 1200)
    : ''
  const nextChapterForwardSeamBlock = withNext
    ? formatNextChapterForwardSeamBlock(nextChapterHead, chapterNumber)
    : ''
  const draftFilter = existingText?.trim()
    ? filterDraftByChapterOutline({
      existingText: existingText.trim(),
      chapterOutline,
      prevChapterTail: prevTail,
      chapterNumber,
    })
    : null
  const draftBlock = draftFilter?.promptBlock || ''
  const structureDiscarded = !!draftFilter?.discardedStructure
  // 重写第2章起：剔除开篇毒种子（勿仅依赖 structureDiscarded）
  const purgeOpeningSeeds = isRewrite && chapterNumber >= 2
  // 第2章起整章写（一次生成 / 重写 / 数字作家）一律强制接缝；续写走 continue 另路
  const forceSeamOpening = chapterNumber >= 2

  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    isRewrite
      ? `【网文正文写法】
- **自然短段**：叙述 2～3 句一段，段间空一行；忌诗化一句一段，也忌多句糊墙。
- **时间与金钱数字**：1990年、3月、15日、3点；金额 800元、2000元；勿写一九九零年/三月、八百元/两千元。
- **口语与语气**：按人设适度用语气词；对话用中文双引号 “……” 表迟疑，勿用「」。
- **严禁**：英文段落、\`<memory>\` / 工具标签、思考过程。`
      : WEBNOVEL_CHAPTER_PROSE_GUIDE,
    '',
    WEBNOVEL_NARRATIVE_TECHNIQUE_GUIDE,
    '',
    WEBNOVEL_STAT_FINGERPRINT_GUIDE,
    '',
    WEBNOVEL_COLLOQUIAL_GUIDE,
    isRewrite ? WEBNOVEL_REWRITE_LAYOUT_RULE : '',
    '',
    OUTLINE_DRAMA_PRIORITY_LINE,
    CHAPTER_PLOT_PRIORITY_LINE,
    meta.long_memory_enabled !== false && !isCausalChainEnabled(meta) ? NOVEL_MEMORY_CHAPTER_END_FORMAT : '',
    isCausalChainEnabled(meta) ? CAUSAL_CHAPTER_END_FORMAT : '',
    '',
    isRewrite
      ? [
        '当前任务：**整章重写**本章正文（非续写片段）。',
        '必须结合【上章结尾/前序已写】与【本章大纲边界】：衔接从已发生事实之后展开；修正吃书、章缝回放、空洞套话。',
        '**保留情节 ≠ 保留回放/旧结构**：草稿开篇若在重演上章高潮必须删掉；结构与章末止点以【本章大纲边界】为准，勿按旧稿展开大纲未列后续；**写到章末硬止点即停**。',
        forceSeamOpening
          ? '**结构作废重写硬性**：旧开篇骨架无效；「本章大纲与前序冲突以前序为准」对开篇结构暂停。承接上章末事实后进入本章拍点（手法可顺叙或先果后因）；禁止完成态重做、同日时辰倒退与天候倒退（雨雪已落地勿写成才开始下）。'
          : '',
        boundarySuspend
          ? '**篇幅**：尽量写到目标字数，且只加厚本章大纲已列拍点；禁止用大纲未列情节凑字；仅当超上限才压缩。'
          : '**篇幅以目标字数为准**：尽量写到约目标字数；**仅当原稿超过上限才压缩**；若不足则补冲突与反应写满区间，禁止过度压缩成短章。',
        '**文风优先**：按【口语化硬要求】压书面腔与 AI 套话；叙述与对话都要有人味，忌只改情节不改腔调。',
        '**排版**：自然短段（2～3 句/段，段间空行）；年月日用阿拉伯数字；勿诗化碎行。',
        '输出完整替换稿，不要只改一两段；不要章节标题行、不要作者按语；禁止输出英文、`<memory>` 或任何系统/工具标签。',
      ].filter(Boolean).join('\n')
      : [
        '当前任务：根据**本章大纲**、**写作说明**与前序上下文，**一次写完**本章正文（长篇章节，非短剧剧本）。',
        '**文风优先**：按【口语化硬要求】写；浅白口语追更，忌书面腔与 AI 套话。',
        '结构与章末止点服从【本章大纲边界】；禁止为「更刺激」铺开大纲未列的后续；**写到章末硬止点即停**。',
        forceSeamOpening
          ? '**章缝开篇硬性**：承接上章末已发生事实后进入本章大纲拍点（手法可顺叙或先果后因）；禁止吃书、完成态重做；上章入夜后写清晨视为次日正向。'
          : '',
      ].filter(Boolean).join('\n'),
    lengthRule,
    isRewrite
      ? '重写时禁止把上章末高潮再完整演一遍；禁止无故推翻已发生事实；浅白口语追更优先于辞藻。'
      : '输出小说正文；不要章节标题行、不要作者按语；段落与语气词按人写网文自然变化（初稿后系统会自动润色收口）。',
    isCausalChainEnabled(meta)
      ? '因果链模式：章末须另附【变更记录】元数据块（系统会拆出单独存储，勿插入故事段落中间）。'
      : '',
    chapterNumber >= 2
      ? (forceSeamOpening
        ? '**章缝+大纲优先**：已发生事实以前序正文为准（勿吃书）；**本章开篇结构只认【上章结尾】+【本章大纲】**（见【开篇强制接缝】）；手法可轮换，禁止对抗上章已成事实。'
        : isCausalChainEnabled(meta)
          ? '**因果链写作**：状态可以变化，但须在章末【变更记录】写清因果；以前序已成文与【因果起点】为准，勿吃书改已发生事件。**禁止章缝回放**：上章末已完成的关键对白/场面高潮，本章勿再完整演一遍。'
          : '**勿注入全书分章大纲**：已发生事实以前序已写正文与章末账本为准；本章大纲若与之冲突，以前序已写为准。**禁止章缝回放**：从上章结尾已发生事实之后开笔，勿重演上章高潮。')
      : hasRealWorldBlock({ outline: meta.outline, dramaId })
        ? [
          '**第1章世界观硬性要求**：正文前 1/3 须用 **400～800 字**（分散叙事）展开注入块中的世界观要点；禁止仅用 3～5 句旁白概括带过，禁止自造大纲未列的地名/体系别称。',
          '若提供全书大纲，名称须与「【世界观设定】」一致。',
        ].join('\n')
        : [
          '**第1章节奏**：无独立世界观注入块时，**勿编造修炼境界/门派体系**。',
          '前 1/3 篇幅服从【写作说明】中的比例/节奏要求；若无比例句，则开篇须落实【本章大纲】前半拍点，禁止开篇直接铺开大纲未写到的完成态高潮。',
        ].join('\n'),
  ].filter(Boolean).join('\n')

  const chapterOutlineBlock = formatChapterOutlineBlock(chapterOutline, chapterNumber)
  const outlineDramaCheck = assertOutlineChapterFields(
    [meta.outline || '', chapterOutline || ''].join('\n\n'),
    chapterNumber,
  )
  const outlineDramaBlock = outlineDramaCheck.fields
    ? buildChapterOutlineDramaPromptBlock(outlineDramaCheck.fields)
    : ''
  const outlineBoundaryBlock = outlineAlign.boundaryBlock
  const beatBudgetBlock = beatBudgets.promptBlock
  const pendingCatalysts = chapterNumber >= 2 && chapterOutline?.trim()
    ? extractOutlineCatalystPhrases(chapterOutline).filter(c =>
      !prevTail.trim() || !outlineCatalystCoveredIn(prevTail, c),
    )
    : []
  const seamBlock = chapterNumber >= 2
    ? buildChapterSeamWriteBlock(prevTail, {
      omitRawPrevProse: true,
      prevSnapshot: prevSnap,
      maxTailChars: 160,
    })
    : ''
  const forcedSeamBlock = forceSeamOpening
    ? buildForcedSeamOpeningBlock({ chapterOutline, prevTail, prevSnapshot: prevSnap })
    : ''
  const outlineStaleBlock = chapterNumber >= 2
    ? buildOutlineStaleBlock({
      chapterOutline,
      prevTail,
      chapterNumber,
    })
    : ''

  // 一次生成与重写共用章缝去重纪律；无旧稿时仍输出通用禁令 + 过期拍点
  const rewriteAntiSeam = chapterNumber >= 2
    ? buildRewriteAntiSeamBlock({
      // 重写须对照旧稿判定章缝硬伤；生成/数字作家传空串仅通用禁令
      existingText: isRewrite ? (existingText || '') : '',
      prevTail,
      chapterNumber,
      chapterOutline,
      prevSnapshot: prevSnap,
    })
    : ''

  let anchorBlock = ''
  if (meta.anchor_echo_enabled !== false) {
    ensureNovelMemory(dramaId, { outline: meta.outline })
    const anchor = await ensureAnchor(dramaId, chapterNumber)
    const vol = resolveVolumeForChapter(meta.outline, chapterNumber)
    if (purgeOpeningSeeds || (forceSeamOpening && !existingText?.trim())) {
      // 重写清毒 / 数字作家等无旧稿：强制章缝锚点，禁止故事开端
      anchorBlock = buildAnchorEchoPromptBlock({
        vol,
        chapter: chapterNumber,
        anchor: '场景:紧接上章末 | 时间:紧接上章已发生事实之后 | 人物:见上章末 | 禁令:不回放上章高潮,不开篇早于上章末',
        minLen,
        maxLen,
      })
    } else {
      anchorBlock = buildAnchorEchoPromptBlock({ vol, chapter: chapterNumber, anchor, minLen, maxLen })
    }
  }

  // 结构作废：写作说明不得驱动开篇；大纲相关旧句在 draftBlock 中保留
  const writingSpecHardBlock = buildWritingSpecHardBlock({
    writingBrief: purgeOpeningSeeds || structureDiscarded ? undefined : alignedBrief,
    chapterOutline,
  })
  const briefBlock = purgeOpeningSeeds || structureDiscarded
    ? buildOutlineOnlyWritingStub(chapterOutline)
    : (alignedBrief.trim()
      ? `【写作说明（须落实；已与大纲边界对齐）】\n${alignedBrief}`
      : '')

  const rewriteReq = withNext
    ? [
      '【重写要求】须同时对照【上章结尾】、【本章大纲】、【下章大纲（禁写）】与【正向章缝】重写本章；**开篇勿回放上章高潮、勿拍点倒退**；大纲过期拍点一律跳过；下章情节禁止提前写；**章末时空须能接下章且勿照抄下章开篇**。',
      '结构与章末止点以【本章大纲边界】为准；**须吸收【旧稿裁定】中与大纲相关的有价值旧句**，禁止按已作废开篇骨架展开。',
      CAST_CONTINUITY_RULE,
      outlineAlign.draftConflictsOutline
        ? '**旧稿已判定超出大纲边界**：禁止照抄旧稿越界结构/篇幅比例；越界段仅作反例。'
        : '',
      forceSeamOpening
        ? '**开篇轻锚接缝**：承接【上章结尾】后进入大纲拍点（手法可顺叙或先果后因）；有价值旧句可写厚；禁止完成态重做、同日时辰倒退与天候倒退。'
        : '',
      `章末钩子须对齐本章大纲（即将/还没则勿提前完成）；**篇幅贴近目标 ${effectiveTarget} 字（${minLen}～${maxLen}）**；口语化；已给出钱数/物件勿改写或加码；只输出简体中文正文。`,
    ].filter(Boolean).join('')
    : isRewrite
      ? [
        '【重写要求】须同时对照【上章结尾】与【本章大纲】重写本章；**开篇勿回放上章高潮、勿拍点倒退**；大纲过期拍点一律跳过；**写到章末硬止点即停**（本轮不考虑下章）。',
        '结构与章末止点以【本章大纲边界】为准；**须吸收【旧稿裁定】中与大纲相关的有价值旧句**，禁止按已作废开篇骨架展开。',
        CAST_CONTINUITY_RULE,
        outlineAlign.draftConflictsOutline
          ? '**旧稿已判定超出大纲边界**：禁止照抄旧稿越界结构/篇幅比例；越界段仅作反例。'
          : '',
        forceSeamOpening
          ? '**开篇轻锚接缝**：承接【上章结尾】后进入大纲拍点（手法可顺叙或先果后因）；有价值旧句可写厚；禁止完成态重做、同日时辰倒退与天候倒退。'
          : '',
        `**篇幅贴近目标 ${effectiveTarget} 字（${minLen}～${maxLen}）**；口语化；只输出简体中文正文。`,
      ].filter(Boolean).join('')
      : [
        '【生成要求】对照【上章结尾】与【本章大纲】一次写完本章；**开篇勿回放上章高潮、勿拍点倒退**；大纲过期拍点一律跳过。',
        '结构与章末止点以【本章大纲边界】为准；**写到章末硬止点即停**；禁止用大纲未列情节凑字。',
        CAST_CONTINUITY_RULE,
        forceSeamOpening
          ? '**开篇轻锚接缝**：承接【上章结尾】后进入大纲拍点（手法可顺叙或先果后因）；禁止吃书、完成态重做、同日时辰倒退与天候倒退。'
          : '',
        `**篇幅贴近目标 ${effectiveTarget} 字（${minLen}～${maxLen}）**；口语化；只输出简体中文正文。`,
      ].filter(Boolean).join('')

  const blocks = [
    ctx.worldbuildingBlock,
    ctx.outlineBlock,
    ctx.premiseBlock,
    ctx.structuredBlock,
    ctx.continuity,
    neighborStateCardBlock,
    seamBlock,
    forcedSeamBlock,
    outlineStaleBlock,
    rewriteAntiSeam,
    outlineDramaBlock,
    ctx.characterBlock,
    ctx.selfHint,
    `【书名】${dramaTitle}`,
    `【本章】第${chapterNumber}章${chapterTitle ? ` ${chapterTitle}` : ''}`,
    draftBlock,
    chapterOutlineBlock,
    outlineBoundaryBlock,
    beatBudgetBlock,
    nextChapterForbidBlock,
    nextChapterForwardSeamBlock,
    writingSpecHardBlock,
    briefBlock,
    rewriteReq,
    soft
      ? `【篇幅】目标 ${boundarySuspend ? target : effectiveTarget} 字，须落在 ${minLen}～${maxLen} 字；贴近目标${tags.role ? `（章职 ${tags.role}）` : ''}。${lengthBoundNote ? ` ${lengthBoundNote}` : ''}`
      : (boundarySuspend
        ? `【篇幅】目标 ${target} 字，尽量 ${minLen}～${maxLen} 字；须遵守【篇幅预算】；宁短勿越章末硬止点。${lengthBoundNote ? ` ${lengthBoundNote}` : ''}`
        : `【篇幅】目标 ${target} 字，尽量 ${minLen}～${maxLen} 字；不得超过 ${maxLen} 字；只在大纲拍点内写厚。${lengthBoundNote ? ` ${lengthBoundNote}` : ''}`),
    withNext
      ? '【输出前自检】开篇是否承接上章末？章末时空是否仍能接上【下章开篇】（勿本章已出门、下章还在炕上）？是否误写下章情节？人物称谓是否有交代？字数是否只用于已列拍点？'
      : WEBNOVEL_OUTPUT_FORMAT_REMINDER + (forceSeamOpening
        ? ' 另检：开篇是否承接上章末？是否落在【本章大纲边界】内、写到硬止点即停？人物称谓是否有交代？'
        : ' 另检：是否落在【本章大纲边界】内、写到硬止点即停？人物称谓是否有交代？'),
    anchorBlock,
  ].filter(Boolean)

  let options = await novelAgentCompletionOptions('novel_chapter_writer', fallbackOptions)
  options = {
    ...options,
    maxTokens: Math.min(tokenCeiling, Number(options.maxTokens) || tokenCeiling),
  }
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: joinNovelPromptBlocks(blocks) },
    ],
    options,
    maxLen,
    minLen,
  }
}

export async function generateNovelChapterFull(
  args: Parameters<typeof buildGenerateNovelChapterMessages>[0] & {
    onBeatProgress?: (info: {
      beatIndex: number
      beatTotal: number
      status: string
      textDelta?: string
      polishing?: boolean
    }) => void
  },
  billing?: TextBillingContext,
): Promise<string> {
  const purgeLexicalSeam = async (text: string): Promise<string> => {
    const { chapterNumber = 1, chapterOutline, dramaId } = args
    if (!dramaId || chapterNumber < 2 || !text.trim()) return text
    const prevTail = await loadPrevChapterContentTail(dramaId, chapterNumber, 1600)
    if (!prevTail.trim()) return text
    const { stripSeamReplayOpening } = await import('./novel-chapter-seam.js')
    const purged = stripSeamReplayOpening({
      content: text,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    })
    if (purged.stripped) {
      logTaskWarn('Novel', 'generate-seam-replay-purged', {
        chapterNumber,
        before: countNovelChars(text),
        after: countNovelChars(purged.text),
      })
    }
    return purged.text
  }

  // P1：拍点≥2 且未关闭开关 → 按拍顺序生成
  {
    const outlineAlign = alignNovelChapterOutlineBoundary({
      chapterOutline: args.chapterOutline,
      writingBrief: args.prompt,
      existingText: args.existingText,
      mode: args.mode,
      chapterNumber: args.chapterNumber,
    })
    const userTarget = Math.min(20000, Math.max(500, args.targetLength ?? 3000))
    const prevTailForBudget = args.chapterNumber >= 2
      ? await loadPrevChapterContentTail(args.dramaId, args.chapterNumber, 1600)
      : ''
    const beatBudgets = resolveChapterBeatBudgets({
      chapterOutline: args.chapterOutline,
      userTarget,
      endpointPending: outlineAlign.endpointPending,
      prevChapterTail: prevTailForBudget,
    })
    if (shouldUseBeatSequentialGenerate({
      beatCount: beatBudgets.beatCount,
      enabled: isBeatSequentialGenerateEnabled(args.meta),
    })) {
      const { generateNovelChapterByBeats } = await import('./novel-chapter-beat-generate.js')
      return purgeLexicalSeam(await generateNovelChapterByBeats(args, billing))
    }
  }

  const { messages, options, minLen, maxLen } = await buildGenerateNovelChapterMessages(args)
  const raw = await chatCompletionText(messages, { ...options, billing })
  const draft = normalizeNovelTemporalNumerals(sanitizeModelCreativeOutput(raw) || raw.trim())
  // 重写不得用旧稿作版式锚：旧稿若含大纲外高潮，preserveNovelLineLayout 会把越界结构撑回润色结果
  let polished = normalizeNovelTemporalNumerals(
    await polishNovelChapterProse(draft, billing, {
      minLen,
      maxLen,
      mode: 'chapter',
      colloquialBoost: true,
    }),
  )

  // 润色/补字若把开篇冲早于上章末（冷开篇），回退润色前稿
  const { chapterNumber = 1, chapterOutline, dramaId } = args
  if (dramaId && chapterNumber >= 2 && chapterOutline?.trim() && draft.trim()) {
    const prevTail = await loadPrevChapterContentTail(dramaId, chapterNumber, 1600)
    const coldArgs = {
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    }
    const draftCold = !!detectChapterSeamColdOpen({ content: draft, ...coldArgs })
    const polishCold = !!detectChapterSeamColdOpen({ content: polished, ...coldArgs })
    if (polishCold && !draftCold) {
      logTaskWarn('Novel', 'generate-polish-reverted-cold-open', {
        chapterNumber,
        draftChars: countNovelChars(draft),
        polishChars: countNovelChars(polished),
      })
      polished = draft
    }
  }

  // M4：禁止相对拼稿腰斩
  const floored = enforceAssembledLengthFloor({
    assembled: draft,
    candidate: polished,
    minLen,
  })
  if (floored.rejected) {
    logTaskWarn('Novel', 'generate-refuse-short-delivery', {
      chapterNumber: args.chapterNumber,
      assembled: countNovelChars(draft),
      candidate: countNovelChars(polished),
      floor: floored.floor,
    })
  }
  assertNovelChapterLengthBand({
    text: floored.text,
    minLen,
    maxLen,
    chapterNumber: args.chapterNumber,
  })
  return purgeLexicalSeam(floored.text)
}

export function summarizeNovelChapterLength(text: string, minLen: number, maxLen: number) {
  const n = countNovelChars(text)
  return { chars: n, minLen, maxLen, within: n >= minLen && n <= maxLen }
}
