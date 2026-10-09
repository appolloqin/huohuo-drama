/**
 * 网文句式确定性预检（读感门禁，非 AIGC 分数）。
 * 蒸馏自 oh-story story-deslop 的 blocking/advisory 类别，供审稿与去 AI 味注入建议。
 */

export type AiPatternSeverity = 'blocking' | 'advisory'
export type AiPatternClass =
  | 'not-is-comparison'
  | 'voice-contrast'
  | 'negation-parade'
  | 'trailer-ending'
  | 'trailer-summary'
  | 'stock-phrase'
  | 'stock-reaction-tic'
  | 'micro-action-tic'
  | 'formulaic-parallelism'

export type AiPatternFinding = {
  severity: AiPatternSeverity
  class: AiPatternClass
  excerpt: string
  advice: string
  index: number
}

export type AiPatternScanResult = {
  findings: AiPatternFinding[]
  blocking_count: number
  advisory_count: number
  grade: '轻度' | '中度' | '重度'
}

const STOCK_PHRASES: Array<{ re: RegExp; advice: string }> = [
  { re: /眼中闪过(?:一丝|一抹)?[^，。！？\n]{0,12}/g, advice: '删掉或改成当场动作/决定' },
  { re: /嘴角勾起(?:一抹)?[^，。！？\n]{0,12}/g, advice: '改成「冷笑一声/嘴角一扯」或直接写台词' },
  { re: /深吸一口气/g, advice: '无功能则删；有功能改成角色当下动作' },
  { re: /心中涌起(?:一股)?[^，。！？\n]{0,16}/g, advice: '写选择、台词或物件后果，勿空转情绪' },
  { re: /命运的齿轮/g, advice: '回到可见动作/对话/物件' },
  { re: /踏上新的旅程/g, advice: '落到具体下一拍事件' },
]

const STOCK_REACTION =
  /(?:指尖|指节|手背|掌心|嘴唇|唇角|嘴角|眉头|眼底|目光|视线|呼吸)[^。！？!?\n]{0,14}(?:轻轻|微微|缓缓|不自觉|下意识|攥紧|泛白|抿紧|移开|垂下|一颤|顿了?一下)/g

const MICRO_TIC = /了(?:[一两三几半])?[下阵圈道声眼口气会]/g

function pushFinding(
  out: AiPatternFinding[],
  f: Omit<AiPatternFinding, 'index'>,
) {
  out.push({ ...f, index: out.length })
}

function scanRegexHits(
  text: string,
  re: RegExp,
  map: (m: string, i: number) => Omit<AiPatternFinding, 'index'> | null,
  out: AiPatternFinding[],
  max = 8,
) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  const r = new RegExp(re.source, flags)
  let m: RegExpExecArray | null
  let n = 0
  while ((m = r.exec(text)) != null && n < max) {
    const mapped = map(m[0], m.index)
    if (mapped) {
      pushFinding(out, mapped)
      n += 1
    }
  }
}

/** 文末窗口（约末 400 字） */
function tailWindow(text: string, size = 400): { slice: string; offset: number } {
  if (text.length <= size) return { slice: text, offset: 0 }
  const offset = text.length - size
  return { slice: text.slice(offset), offset }
}

export function scanNovelAiPatterns(text: string): AiPatternScanResult {
  const prose = (text || '').replace(/\r\n/g, '\n')
  const findings: AiPatternFinding[] = []
  if (!prose.trim()) {
    return { findings, blocking_count: 0, advisory_count: 0, grade: '轻度' }
  }

  // Blocking: 不是A，而是B / 不是A，是B
  scanRegexHits(
    prose,
    /不是[^，。！？\n]{1,24}，(?:而)?是[^。！？\n]{1,40}/g,
    (excerpt) => ({
      severity: 'blocking',
      class: 'not-is-comparison',
      excerpt: excerpt.slice(0, 80),
      advice: '删否定铺垫，直接写后项，或用动作/细节呈现',
    }),
    findings,
  )

  // Blocking: 声音不大/不高，却带着…
  scanRegexHits(
    prose,
    /(?:声音|嗓音|语气)(?:不大|不高|不响)[^，。！？\n]{0,8}，却带着[^。！？\n]{2,40}/g,
    (excerpt) => ({
      severity: 'blocking',
      class: 'voice-contrast',
      excerpt: excerpt.slice(0, 80),
      advice: '直接写声音特征、台词内容或动作',
    }),
    findings,
  )

  // Blocking: 没有X，没有Y，只有Z 否定排比
  scanRegexHits(
    prose,
    /没有[^，。！？\n]{1,12}，没有[^，。！？\n]{1,12}(?:，(?:只有|只是)[^。！？\n]{1,24})?/g,
    (excerpt) => ({
      severity: 'blocking',
      class: 'negation-parade',
      excerpt: excerpt.slice(0, 80),
      advice: '压成一次判断或只留一项有信息量的否定',
    }),
    findings,
  )

  const { slice: tail, offset } = tailWindow(prose)
  const trailerRes: Array<{ re: RegExp; cls: AiPatternClass; advice: string }> = [
    {
      re: /他不知道的是[^。！？\n]{0,40}/g,
      cls: 'trailer-ending',
      advice: '删预告腔，改用具体钩子物件/未决事件收束',
    },
    {
      re: /(?:更大的风暴|新的篇章|这一切才刚刚开始|反击才刚刚开始)/g,
      cls: 'trailer-ending',
      advice: '落到可见下一拍，禁止空泛预告',
    },
    {
      re: /(?:这一切都说明|他终于明白|这一夜注定|命运终于)/g,
      cls: 'trailer-summary',
      advice: '删章末总结体，用动作/对话收尾',
    },
  ]
  for (const { re, cls, advice } of trailerRes) {
    scanRegexHits(
      tail,
      re,
      (excerpt) => ({
        severity: 'blocking',
        class: cls,
        excerpt: excerpt.slice(0, 80),
        advice,
      }),
      findings,
      4,
    )
  }

  for (const { re, advice } of STOCK_PHRASES) {
    scanRegexHits(
      prose,
      re,
      (excerpt) => ({
        severity: 'advisory',
        class: 'stock-phrase',
        excerpt: excerpt.slice(0, 60),
        advice,
      }),
      findings,
      6,
    )
  }

  // 套式反应：≥4 处才报一条密度提示
  {
    const hits: string[] = []
    const r = new RegExp(STOCK_REACTION.source, 'g')
    let m: RegExpExecArray | null
    while ((m = r.exec(prose)) != null && hits.length < 12) hits.push(m[0])
    if (hits.length >= 4) {
      pushFinding(findings, {
        severity: 'advisory',
        class: 'stock-reaction-tic',
        excerpt: hits.slice(0, 3).join(' / '),
        advice: `成片套式反应约 ${hits.length} 处：逐处做删除测试，无后果则删`,
      })
    }
  }

  // 微动作「了下」密度
  {
    const kilo = Math.max(1, prose.length / 1000)
    let hits = 0
    const r = new RegExp(MICRO_TIC.source, 'g')
    while (r.exec(prose) != null) hits += 1
    if (hits >= 5 && hits / kilo >= 6) {
      pushFinding(findings, {
        severity: 'advisory',
        class: 'micro-action-tic',
        excerpt: `「了下/了一下」类约 ${hits} 处`,
        advice: '降低轻量补语密度，合并为连续画面',
      })
    }
  }

  // 工整并列：至于X不X
  scanRegexHits(
    prose,
    /至于[^，。！？\n]{1,10}不[^，。！？\n]{1,10}，怎么[^。！？\n]{1,20}/g,
    (excerpt) => ({
      severity: 'advisory',
      class: 'formulaic-parallelism',
      excerpt: excerpt.slice(0, 80),
      advice: '通读语境；若只是复述前文则压成一次判断',
    }),
    findings,
    4,
  )

  // 去重：同类同摘录只留一条
  const seen = new Set<string>()
  const deduped: AiPatternFinding[] = []
  for (const f of findings) {
    const key = `${f.class}|${f.excerpt}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ ...f, index: deduped.length })
  }

  const blocking_count = deduped.filter((f) => f.severity === 'blocking').length
  const advisory_count = deduped.length - blocking_count
  const stockHits = deduped.filter((f) => f.class === 'stock-phrase').length
  let grade: AiPatternScanResult['grade'] = '轻度'
  if (blocking_count >= 4 || stockHits >= 8) grade = '重度'
  else if (blocking_count >= 2 || stockHits >= 4 || advisory_count >= 5) grade = '中度'

  // offset unused but kept for future location mapping
  void offset

  return { findings: deduped, blocking_count, advisory_count, grade }
}

/** 转成去 AI 味 / 审稿可用的建议行 */
export function formatAiPatternHints(scan: AiPatternScanResult, max = 12): Array<{
  signal_key: string
  match_text: string
  advice: string
  count?: number
}> {
  return scan.findings.slice(0, max).map((f) => ({
    signal_key: `pattern:${f.class}`,
    match_text: f.excerpt,
    advice: `[${f.severity}] ${f.advice}`,
    count: 1,
  }))
}
