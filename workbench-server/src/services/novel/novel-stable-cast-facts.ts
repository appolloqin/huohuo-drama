/**
 * 全书大纲【主要人物】稳定属性（年龄等）
 * - 生成侧：**按需**注入（本章涉及年龄/登记等才注入）
 * - 审核侧：对照大纲硬检（不依赖生成注入）
 */

export type StableCastFact = {
  name: string
  ageYears?: number
  /** 原文年龄片段，如「19岁」「十九岁」 */
  ageRaw?: string
  blurb?: string
}

export type StableAgeConflict = {
  layer: 'hard'
  rule: 'stable_age_conflict'
  message: string
}

const CN_DIGIT: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
}

/** 解析「19」「十九」「二十三」→ 数字岁 */
export function parseAgeToken(raw: string): number | null {
  const s = (raw || '').trim()
  if (!s) return null
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s)
    return n >= 1 && n <= 120 ? n : null
  }
  if (s === '十') return 10
  if (s.startsWith('十') && s.length <= 2) {
    const ones = CN_DIGIT[s[1]!]
    return ones != null ? 10 + ones : null
  }
  if (s.endsWith('十') && s.length === 2) {
    const tens = CN_DIGIT[s[0]!]
    return tens != null ? tens * 10 : null
  }
  if (s.includes('十') && s.length === 3) {
    const [a, , b] = s
    const tens = CN_DIGIT[a!]
    const ones = CN_DIGIT[b!]
    if (tens != null && ones != null) return tens * 10 + ones
  }
  if (s.length === 1 && CN_DIGIT[s] != null) return CN_DIGIT[s]!
  return null
}

function extractCastSection(outline: string): string {
  const t = outline || ''
  const headers = [
    /【\s*主要人物\s*】/,
    /【\s*人物核心\s*】/,
    /(?:^|\n)\s*#{1,3}\s*主要人物\s*\n/i,
    /(?:^|\n)\s*[-*•]?\s*\*{0,2}主要人物\*{0,2}\s*[:：]?\s*\n/,
  ]
  let start = -1
  for (const re of headers) {
    const m = t.match(re)
    if (m && m.index != null) {
      start = m.index + m[0].length
      break
    }
  }
  if (start < 0) {
    // 行内：- **苏婉**：…19岁
    return t
  }
  const rest = t.slice(start)
  const end = rest.search(/\n【|\n#{1,3}\s*分卷|\n#{1,3}\s*分章|\n【分卷|\n【分章/)
  return end >= 0 ? rest.slice(0, end) : rest.slice(0, 4000)
}

/**
 * 从全书大纲抽取稳定人设（至少含年龄）。
 * 识别：`- **苏婉**：女主，19岁…` / `苏婉｜…｜19岁`
 */
export function extractStableCastFactsFromOutline(outline: string): StableCastFact[] {
  const section = extractCastSection(outline)
  const hay = section.trim() ? section : (outline || '')
  if (!hay.trim()) return []
  const facts: StableCastFact[] = []
  const seen = new Set<string>()

  const lineRe =
    /(?:^|\n)\s*[-*•]?\s*\*{0,2}([^\s*：:\|｜，,]{2,6})\*{0,2}\s*[：:|｜]\s*([^\n]{4,200})/g
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(hay))) {
    const name = m[1]!.replace(/[*【】\[\]]/g, '').trim()
    const blurb = m[2]!.trim()
    if (name.length < 2 || name.length > 6) continue
    if (/^(男主|女主|配角|反派|主要人物|人物核心)$/.test(name)) continue
    const ageM = blurb.match(/(\d{1,2}|[一二三四五六七八九十两零〇]{1,3})\s*岁/)
    if (!ageM) continue
    const ageYears = parseAgeToken(ageM[1]!)
    if (ageYears == null) continue
    if (seen.has(name)) continue
    seen.add(name)
    facts.push({
      name,
      ageYears,
      ageRaw: ageM[0],
      blurb: blurb.slice(0, 80),
    })
  }

  // 兜底：全文扫「**姓名**：…N岁」
  if (!facts.length && outline) {
    const boldRe = /\*\*([^*]{2,6})\*\*\s*[：:]\s*([^\n]{0,120}?(\d{1,2}|[一二三四五六七八九十两零〇]{1,3})\s*岁)/g
    while ((m = boldRe.exec(outline))) {
      const name = m[1]!.trim()
      const ageYears = parseAgeToken(m[3]!)
      if (ageYears == null || seen.has(name)) continue
      seen.add(name)
      facts.push({ name, ageYears, ageRaw: `${ageYears}岁`, blurb: m[2]!.slice(0, 80) })
    }
  }
  return facts
}

export function formatStableCastFactsInjectBlock(facts: StableCastFact[]): string {
  if (!facts.length) return ''
  const lines = facts.map((f) => {
    const bits = [f.name]
    if (f.ageYears != null) bits.push(`${f.ageYears}岁`)
    if (f.blurb) bits.push(f.blurb.slice(0, 48))
    return `- ${bits.join('｜')}`
  })
  return [
    '【稳定人设·大纲判定本章需要（禁止无交代改年龄）】',
    ...lines,
    '硬性：本章若写「几岁/多大/年龄」对白或旁白，须与上表一致；禁止无交代改年龄。',
  ].join('\n')
}

/** 本章大纲/说明判定需要的稳定字段（无需要则不注入） */
export type NeededStableDim = 'age' | 'identity'

/**
 * 根据本章大纲/写作说明动态判断需要注入哪些稳定维。
 * - 点名出场 ≠ 需要年龄（如进山设套）
 * - 核验/盘查/来历类（即使用户未写「几岁」）→ 默认需要年龄+身份（产品选择 A）
 * - 仅「试探/周旋/上门关心」→ 不注入
 */
export function detectNeededStableDimsFromChapterOutline(
  ...signals: Array<string | undefined | null>
): Set<NeededStableDim> {
  const blob = signals.filter(Boolean).join('\n')
  const needed = new Set<NeededStableDim>()
  if (!blob.trim()) return needed

  // 年龄将落笔（显式）
  if (/几岁|多大|年龄|岁数|报年龄|(?:问|查|核|报).{0,8}岁/.test(blob)) {
    needed.add('age')
  }

  // 户籍/身份/来历核验（常连问年龄；含「来历」本身）
  if (/籍贯|户口|登记|档案|履历|成分表|核实身份|身份登记|报上名|身世|来历|成分|查户口|核身份/.test(blob)) {
    needed.add('identity')
    needed.add('age')
  }

  // 盘查/盘问/核验类结构（不必紧贴「户口」字；官方盘查即触发）
  // 排除：单独「试探/周旋/敲打/关心」不够
  if (/官方盘查|盘查|盘问|查问|问话|核验|核查/.test(blob)) {
    needed.add('identity')
    needed.add('age')
  } else if (
    /(?:上门|来访).{0,24}(?:登记|查户口|核身份|问年龄|问几岁|盘查|盘问)/.test(blob)
  ) {
    needed.add('identity')
    needed.add('age')
  }

  return needed
}

/** @deprecated 兼容旧名：是否有任一所需维 */
export function shouldInjectStableCastFacts(...signals: Array<string | undefined | null>): boolean {
  return detectNeededStableDimsFromChapterOutline(...signals).size > 0
}

/**
 * 选取本章应注入的稳定人设：
 * 1) 本章大纲判定需要的维（无需要 → 空）——动态在「是否注入」
 * 2) 年龄/身份维：注入大纲【主要人物】中全部已写年龄者
 *    （盘查戏家眷常未写入【本章人物】行；人数通常极少，不是项目全角色表）
 */
export function selectStableCastFactsForInject(
  outline: string,
  ...signals: Array<string | undefined | null>
): StableCastFact[] {
  const needed = detectNeededStableDimsFromChapterOutline(...signals)
  if (!needed.size) return []
  const facts = extractStableCastFactsFromOutline(outline)
  if (!facts.length) return []
  if (needed.has('age') || needed.has('identity')) {
    return facts.filter(f => f.ageYears != null)
  }
  return []
}

/** 按需注入块；大纲判定不需要则空串 */
export function maybeFormatStableCastFactsInjectBlock(
  outline: string,
  ...signals: Array<string | undefined | null>
): string {
  return formatStableCastFactsInjectBlock(selectStableCastFactsForInject(outline, ...signals))
}

function compactProse(s: string): string {
  return (s || '').replace(/\s+/g, '')
}

const AGE_Q_RE = /几岁|多大了?|年龄|岁数|报上?年龄/g

/** 对白年龄答句：「二十三。」她答 / 「十九」他答（可无「岁」） */
const AGE_REPLY_SHE_HE_RE = new RegExp(
  `[「『“"'](\\d{1,2}|[一二三四五六七八九十两零〇]{1,3})(?:岁)?[。！!]?[」』”"']\\s*(?:她|他)答`,
  'g',
)

/**
 * 正文年龄与大纲稳定人设冲突 → hard（仅高置信问答结构）
 *
 * **不做**「人名附近出现 N岁」近距硬拦：旁白里弟妹/回忆/年限与人名相邻极常见，近距归因误报率高，不适合 hard。
 * 近距年龄一致性交给模型语义审（软）；硬拦只认：
 * - 显式「几岁/多大」问答后的答句
 * - 「二十三。」她答 / 他答 结构答句
 */
export function detectStableAgeConflicts(
  content: string,
  facts: StableCastFact[],
): StableAgeConflict[] {
  if (!facts.length || !content.trim()) return []
  const hay = compactProse(content)
  const out: StableAgeConflict[] = []
  const ageTok = '(\\d{1,2}|[一二三四五六七八九十两零〇]{1,3})'

  for (const f of facts) {
    if (f.ageYears == null || !hay.includes(f.name)) continue

    // 1) 年龄问答：问句后允许隔写作用（至约 1200 字），答句可无「岁」（「二十三。」她答）
    AGE_Q_RE.lastIndex = 0
    let qm: RegExpExecArray | null
    while ((qm = AGE_Q_RE.exec(hay)) !== null) {
      const qi = qm.index
      const before = hay.slice(Math.max(0, qi - 280), qi)
      const after = hay.slice(qi, qi + 1200)
      const nameNearQ = before.includes(f.name)
      const looseAns = new RegExp(`(${ageTok})(?:岁)?([。！!」』""]|$)`, 'g')
      let am: RegExpExecArray | null
      let caught = false
      while ((am = looseAns.exec(after)) !== null) {
        const tok = am[1]!
        const stated = parseAgeToken(tok)
        if (stated == null) continue
        const ansAt = am.index
        // 她/他答：只认答句近窗人名，避免问句到答句之间其它出场角色被误挂
        const ansCtx = after.slice(Math.max(0, ansAt - 80), ansAt + am[0].length + 12)
        const preAns = after.slice(Math.max(0, ansAt - 160), ansAt)
        const linked =
          nameNearQ
          || ansCtx.includes(f.name)
          || (/(?:她|他)答/.test(ansCtx) && preAns.includes(f.name))
        if (!linked) continue
        const rawBit = am[0]
        const looksLikeAgeReply =
          /岁/.test(rawBit)
          || /[「『""]/.test(after.slice(Math.max(0, ansAt - 2), ansAt + 1))
          || /(?:她|他)答/.test(ansCtx)
          || (/[。！!]/.test(rawBit) && /[「『""]/.test(after.slice(Math.max(0, ansAt - 8), ansAt + 1)))
        if (!looksLikeAgeReply) continue
        if (stated === f.ageYears) continue
        out.push({
          layer: 'hard',
          rule: 'stable_age_conflict',
          message:
            `稳定人设年龄冲突：「${f.name}」大纲为${f.ageYears}岁，回答年龄时说「${tok}」。`
            + `摘录「${(ansCtx.includes(tok) ? ansCtx : `${ansCtx}${tok}`).replace(/\s+/g, '').slice(-36)}」`,
        })
        caught = true
        break
      }
      if (caught) break
    }

    // 2) 无问句仍答年龄：「二十三。」她答 — 前窗须有该人名（结构答句，不依赖几岁词）
    AGE_REPLY_SHE_HE_RE.lastIndex = 0
    let rm: RegExpExecArray | null
    while ((rm = AGE_REPLY_SHE_HE_RE.exec(hay)) !== null) {
      const tok = rm[1]!
      const stated = parseAgeToken(tok)
      if (stated == null || stated === f.ageYears) continue
      const pre = hay.slice(Math.max(0, rm.index - 360), rm.index)
      if (!pre.includes(f.name)) continue
      // 若前窗有多人名，取距答句最近者；非本角色则跳过
      const nearest = nearestCastNameBefore(pre, facts)
      if (nearest && nearest !== f.name) continue
      out.push({
        layer: 'hard',
        rule: 'stable_age_conflict',
        message:
          `稳定人设年龄冲突：「${f.name}」大纲为${f.ageYears}岁，回答年龄时说「${tok}」。`
          + `摘录「${hay.slice(Math.max(0, rm.index - 12), rm.index + rm[0].length).slice(0, 40)}」`,
      })
      break
    }
  }

  // 去重
  const seen = new Set<string>()
  return out.filter((x) => {
    if (seen.has(x.message)) return false
    seen.add(x.message)
    return true
  })
}

/** 答句前窗中距末尾最近的稳定人设名 */
function nearestCastNameBefore(pre: string, facts: StableCastFact[]): string | null {
  let best: { name: string; at: number } | null = null
  for (const f of facts) {
    if (!f.name) continue
    const at = pre.lastIndexOf(f.name)
    if (at < 0) continue
    if (!best || at > best.at) best = { name: f.name, at }
  }
  return best?.name ?? null
}
