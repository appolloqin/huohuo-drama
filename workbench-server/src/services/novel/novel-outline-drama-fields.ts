/**
 * 小说大纲戏剧要素：总纲 + 分章标签解析与校验（题材无关）
 */
export type ConflictLayer = '外部' | '人际' | '自我'

export type OutlineBookFields = {
  theme: string
  worldRules: string[]
  desireExternal: string
  desireInternal: string
  protagonistFlaw: string
  castCores: string
  arcEnd: string
  emotionPalette: string
}

export type OutlineChapterDramaFields = {
  chapterNumber: number
  time: string
  place: string
  cast: string
  catalyst: string
  desire: string
  obstacle: string
  stakesShift: string
  choice: string
  conflictLayers: ConflictLayer[]
  emotionCraft: string
  endingQuestion: string
  infoDelta: string
  themeEcho: string
}

export const OUTLINE_CHAPTER_FIELD_LABELS = [
  '本章时间',
  '本章地点',
  '本章人物',
  '本章起因',
  '欲望',
  '阻碍',
  '局面变化',
  '人物选择',
  '冲突层',
  '情绪手法',
  '章末问题',
  '信息增量',
  '主题回响',
] as const

const CONFLICT_SET = new Set<string>(['外部', '人际', '自我'])

const CHAPTER_HEADER_RE = /第\s*(\d+)\s*章/

/** 取【标签】后内容（重复则取最后一次），直到下一【或下一「第N章」或文末 */
export function extractTagBlock(text: string, label: string): string | null {
  const src = text || ''
  const startRe = new RegExp(`【${label}】`, 'g')
  let m: RegExpExecArray | null
  let lastIndex = -1
  let lastLen = 0
  while ((m = startRe.exec(src)) !== null) {
    lastIndex = m.index
    lastLen = m[0].length
  }
  if (lastIndex < 0) return null
  const from = lastIndex + lastLen
  const rest = src.slice(from)
  const nextTag = rest.search(/【/)
  const nextCh = rest.search(/第\s*\d+\s*章/)
  let end = rest.length
  if (nextTag >= 0) end = Math.min(end, nextTag)
  if (nextCh >= 0) end = Math.min(end, nextCh)
  const value = rest.slice(0, end).replace(/^\s+/, '').replace(/\s+$/, '')
  return value || null
}

function nonEmpty(s: string | null | undefined, min = 2): boolean {
  return !!s && [...s.trim()].length >= min
}

function parseWorldRules(block: string | null): string[] {
  if (!block?.trim()) return []
  return block
    .split(/\n+/)
    .map(l => l.replace(/^\s*[-•*、．.]\s*/, '').trim())
    .filter(l => [...l].length >= 2)
}

export function parseConflictLayers(raw: string | null): { layers: ConflictLayer[]; invalid: string[] } {
  if (!raw?.trim()) return { layers: [], invalid: [] }
  const parts = raw.split(/[、，,/|｜\s]+/).map(s => s.trim()).filter(Boolean)
  const layers: ConflictLayer[] = []
  const invalid: string[] = []
  for (const p of parts) {
    if (CONFLICT_SET.has(p)) layers.push(p as ConflictLayer)
    else invalid.push(p)
  }
  return { layers: [...new Set(layers)], invalid }
}

export function parseOutlineBookFields(outline: string): Partial<OutlineBookFields> {
  const t = outline || ''
  return {
    theme: extractTagBlock(t, '主题') || undefined,
    worldRules: parseWorldRules(extractTagBlock(t, '世界规则')),
    desireExternal: extractTagBlock(t, '主角欲望·外') || extractTagBlock(t, '主角欲望外') || undefined,
    desireInternal: extractTagBlock(t, '主角欲望·内') || extractTagBlock(t, '主角欲望内') || undefined,
    protagonistFlaw: extractTagBlock(t, '主角弱点') || undefined,
    castCores: extractTagBlock(t, '人物核心') || undefined,
    arcEnd: extractTagBlock(t, '结局方向') || undefined,
    emotionPalette: extractTagBlock(t, '情绪调性') || undefined,
  }
}

/** 截取第 chapterNumber 章段落（含标题行至下一章前） */
export function sliceOutlineChapterSection(outline: string, chapterNumber: number): string {
  const lines = (outline || '').split(/\n/)
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(CHAPTER_HEADER_RE)
    if (!m) continue
    const n = Number(m[1])
    if (n === chapterNumber && start < 0) start = i
    else if (start >= 0 && n > chapterNumber) {
      end = i
      break
    }
  }
  if (start < 0) return ''
  return lines.slice(start, end).join('\n')
}

export function parseOutlineChapterFields(
  outline: string,
  chapterNumber: number,
): Partial<OutlineChapterDramaFields> & { conflictInvalid?: string[] } {
  const section = sliceOutlineChapterSection(outline, chapterNumber)
  if (!section.trim()) return { chapterNumber }
  const conflictRaw = extractTagBlock(section, '冲突层')
  const { layers, invalid } = parseConflictLayers(conflictRaw)
  return {
    chapterNumber,
    time: extractTagBlock(section, '本章时间') || undefined,
    place: extractTagBlock(section, '本章地点') || undefined,
    cast: extractTagBlock(section, '本章人物') || undefined,
    catalyst: extractTagBlock(section, '本章起因') || undefined,
    desire: extractTagBlock(section, '欲望') || undefined,
    obstacle: extractTagBlock(section, '阻碍') || undefined,
    stakesShift: extractTagBlock(section, '局面变化') || undefined,
    choice: extractTagBlock(section, '人物选择') || undefined,
    conflictLayers: layers,
    conflictInvalid: invalid,
    emotionCraft: extractTagBlock(section, '情绪手法') || undefined,
    endingQuestion: extractTagBlock(section, '章末问题') || undefined,
    infoDelta: extractTagBlock(section, '信息增量') || undefined,
    themeEcho: extractTagBlock(section, '主题回响') || undefined,
  }
}

export function assertOutlineBookFields(outline: string): {
  ok: boolean
  missing: string[]
  fields: OutlineBookFields | null
} {
  const p = parseOutlineBookFields(outline)
  const missing: string[] = []
  if (!nonEmpty(p.theme)) missing.push('主题')
  if (!p.worldRules || p.worldRules.length < 3 || p.worldRules.length > 8) missing.push('世界规则')
  if (!nonEmpty(p.desireExternal)) missing.push('主角欲望·外')
  if (!nonEmpty(p.desireInternal)) missing.push('主角欲望·内')
  if (!nonEmpty(p.protagonistFlaw)) missing.push('主角弱点')
  if (!nonEmpty(p.castCores, 4)) missing.push('人物核心')
  if (!nonEmpty(p.arcEnd)) missing.push('结局方向')
  if (!nonEmpty(p.emotionPalette)) missing.push('情绪调性')
  if (missing.length) return { ok: false, missing, fields: null }
  return {
    ok: true,
    missing: [],
    fields: {
      theme: p.theme!.trim(),
      worldRules: p.worldRules!,
      desireExternal: p.desireExternal!.trim(),
      desireInternal: p.desireInternal!.trim(),
      protagonistFlaw: p.protagonistFlaw!.trim(),
      castCores: p.castCores!.trim(),
      arcEnd: p.arcEnd!.trim(),
      emotionPalette: p.emotionPalette!.trim(),
    },
  }
}

export function assertOutlineChapterFields(outline: string, chapterNumber: number): {
  ok: boolean
  missing: string[]
  invalid: string[]
  fields: OutlineChapterDramaFields | null
} {
  const p = parseOutlineChapterFields(outline, chapterNumber)
  const missing: string[] = []
  const invalid: string[] = [...(p.conflictInvalid || [])]
  if (!sliceOutlineChapterSection(outline, chapterNumber).trim()) {
    return { ok: false, missing: [`第${chapterNumber}章`], invalid, fields: null }
  }
  const req: Array<[keyof OutlineChapterDramaFields, string]> = [
    ['time', '本章时间'],
    ['place', '本章地点'],
    ['cast', '本章人物'],
    ['catalyst', '本章起因'],
    ['desire', '欲望'],
    ['obstacle', '阻碍'],
    ['stakesShift', '局面变化'],
    ['choice', '人物选择'],
    ['emotionCraft', '情绪手法'],
    ['endingQuestion', '章末问题'],
    ['infoDelta', '信息增量'],
    ['themeEcho', '主题回响'],
  ]
  for (const [key, label] of req) {
    const v = p[key]
    if (typeof v !== 'string' || !nonEmpty(v)) missing.push(label)
  }
  if (!p.conflictLayers?.length) missing.push('冲突层')
  if (missing.length || invalid.length) {
    return { ok: false, missing, invalid, fields: null }
  }
  return {
    ok: true,
    missing: [],
    invalid: [],
    fields: {
      chapterNumber,
      time: p.time!.trim(),
      place: p.place!.trim(),
      cast: p.cast!.trim(),
      catalyst: p.catalyst!.trim(),
      desire: p.desire!.trim(),
      obstacle: p.obstacle!.trim(),
      stakesShift: p.stakesShift!.trim(),
      choice: p.choice!.trim(),
      conflictLayers: p.conflictLayers!,
      emotionCraft: p.emotionCraft!.trim(),
      endingQuestion: p.endingQuestion!.trim(),
      infoDelta: p.infoDelta!.trim(),
      themeEcho: p.themeEcho!.trim(),
    },
  }
}

export function buildChapterOutlineDramaPromptBlock(fields: OutlineChapterDramaFields): string {
  return [
    '【本章大纲·戏剧要素 — 须在正文落地】',
    `时间：${fields.time}`,
    `地点：${fields.place}`,
    `人物：${fields.cast}`,
    `起因：${fields.catalyst}`,
    `欲望：${fields.desire}`,
    `阻碍：${fields.obstacle}`,
    `局面变化：${fields.stakesShift}`,
    `人物选择：${fields.choice}`,
    `冲突层：${fields.conflictLayers.join('、')}`,
    `情绪手法：${fields.emotionCraft}`,
    `章末问题：${fields.endingQuestion}`,
    `信息增量：${fields.infoDelta}`,
    `主题回响：${fields.themeEcho}`,
    '落地顺序：承接上章末 → 若【起因】前序未写到则先写清其过程 → 再写欲望/阻碍/局面变化/人物选择 → 章末落到具体问题；禁止跳过未完成的起因直接写结果态。',
  ].join('\n')
}

export function buildOutlineBookPromptBlock(fields: OutlineBookFields): string {
  return [
    '【全书大纲·总纲要素】',
    `主题：${fields.theme}`,
    `世界规则：\n${fields.worldRules.map(r => `- ${r}`).join('\n')}`,
    `主角欲望·外：${fields.desireExternal}`,
    `主角欲望·内：${fields.desireInternal}`,
    `主角弱点：${fields.protagonistFlaw}`,
    `人物核心：\n${fields.castCores}`,
    `结局方向：${fields.arcEnd}`,
    `情绪调性：${fields.emotionPalette}`,
  ].join('\n')
}

export const OUTLINE_DRAMA_PRIORITY_LINE =
  '优先级：章缝与大纲边界（勿吃书勿越界）> 大纲戏剧要素落地 > 字数厚度（预算内写厚）。'

/**
 * 写作用本章大纲：优先全书大纲中已带齐戏剧标签的第 N 章块；
 * 否则回退 fallback（如旧版一行概要 / episode.description）。
 */
export function resolveWritingChapterOutline(
  bookOutline: string | undefined,
  chapterNumber: number,
  fallback?: string,
): { text: string; source: 'book_drama' | 'fallback' | 'empty' } {
  const book = (bookOutline || '').trim()
  if (book) {
    const check = assertOutlineChapterFields(book, chapterNumber)
    if (check.ok) {
      const section = sliceOutlineChapterSection(book, chapterNumber).trim()
      if (section) return { text: section, source: 'book_drama' }
    }
  }
  const fb = (fallback || '').trim()
  if (fb) return { text: fb, source: 'fallback' }
  return { text: '', source: 'empty' }
}

/** 旧一行概要 / 无戏剧标签的 prompt，升级为带标签的本章大纲块 */
export function upgradePromptToDramaOutline(args: {
  prompt: string
  oldChapterOutline: string
  writingChapterOutline: string
}): string {
  const prompt = (args.prompt || '').trim()
  const drama = (args.writingChapterOutline || '').trim()
  if (!drama) return prompt
  if (!prompt) return drama
  if (/【欲望】/.test(prompt) && /【阻碍】/.test(prompt)) return prompt
  const stripped = prompt
    .replace(/^【结构以本章大纲为准[^\n]*】\s*/m, '')
    .trim()
  const old = (args.oldChapterOutline || '').trim()
  if (!old || stripped === old || stripped.includes(old.slice(0, Math.min(40, old.length)))) {
    return drama
  }
  // 仍无戏剧标签的短大纲型 prompt → 换用戏剧块
  if (![...stripped].length || ([...stripped].length < 500 && !/【欲望】/.test(stripped))) {
    return drama
  }
  return prompt
}
