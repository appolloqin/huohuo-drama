/**
 * 网文 AI 套路衔接/空转修饰（检测与写作打散共用）。
 * 长词在前，避免「嘴角微微」先被「微微」误伤。
 */
export const NOVEL_AI_TRANSITION_TELLS = [
  '嘴角微微', '空气仿佛', '时间仿佛', '心中暗道', '话音刚落',
  '眼中闪过', '心头一紧', '与此同时', '于是乎', '紧接着', '刹那间',
  '不由得', '忍不住', '然而', '因此', '随后',
  '不禁', '竟然', '仿佛', '宛如',
  '缓缓', '微微', '淡淡', '静静', '默默',
] as const

/** 写作侧替换：去套路，不碰检测接口 */
const TRANSITION_ALTS: Array<{ needle: string; alts: string[] }> = [
  { needle: '嘴角微微上扬', alts: ['嘴角一扬', '咧嘴笑了笑', '嘴角扯了扯'] },
  { needle: '嘴角微微', alts: ['嘴角一扬', '嘴角扯了扯', '咧了咧嘴'] },
  { needle: '空气仿佛', alts: ['屋里像是', '四周像'] },
  { needle: '时间仿佛', alts: ['时间像是', '那一刻像'] },
  { needle: '心中暗道', alts: ['心里嘀咕', '心里道'] },
  { needle: '话音刚落', alts: ['话刚说完', '话音未落'] },
  { needle: '眼中闪过', alts: ['眼里掠过', '眼神一沉'] },
  { needle: '心头一紧', alts: ['心里一沉', '心口一紧'] },
  { needle: '与此同时', alts: ['同一时候', '那边'] },
  { needle: '于是乎', alts: ['于是', '这下'] },
  { needle: '紧接着', alts: ['跟着', '下一拍', '这才'] },
  { needle: '刹那间', alts: ['一瞬间', '眨眼间'] },
  { needle: '不由得', alts: ['不由', '下意识'] },
  { needle: '忍不住', alts: ['憋不住', '没忍住', '捺不住'] },
  { needle: '然而', alts: ['可', '不过'] },
  { needle: '因此', alts: ['所以', '这才'] },
  { needle: '随后', alts: ['接着', '后来'] },
  { needle: '不禁', alts: ['不由', '下意识'] },
  { needle: '竟然', alts: ['居然', '硬是'] },
  { needle: '仿佛', alts: ['像是', '跟'] },
  { needle: '宛如', alts: ['像', '跟'] },
  { needle: '缓缓', alts: ['慢慢', '一点一点'] },
  { needle: '微微', alts: ['轻轻', '略', '稍稍'] },
  { needle: '淡淡', alts: ['浅浅', '略带'] },
  { needle: '静静', alts: ['一声不吭', '没作声'] },
  { needle: '默默', alts: ['一声不吭', '没吭声'] },
]

/** 用词分布常见空转（与衔接词打散一并做） */
const LEXICAL_ALTS: Array<{ needle: string; alts: string[] }> = [
  { needle: '猛地', alts: ['猛一', '忽地', '一下子'] },
  { needle: '似乎', alts: ['像是', '大概'] },
  { needle: '悄然', alts: ['悄悄', '没声响地'] },
]

function replaceAllRotating(text: string, needle: string, alts: string[]): string {
  if (!needle || !alts.length) return text
  let out = text
  let idx = 0
  let n = 0
  while ((idx = out.indexOf(needle, idx)) !== -1) {
    const alt = alts[n % alts.length]!
    out = out.slice(0, idx) + alt + out.slice(idx + needle.length)
    idx += alt.length
    n += 1
  }
  return out
}

/** 确定性打散 AI 衔接词与空转修饰（润色/去 AI 味收口） */
export function diversifyAiTransitionTells(text: string): string {
  if (!text?.trim()) return text
  let out = text
  for (const { needle, alts } of TRANSITION_ALTS) {
    out = replaceAllRotating(out, needle, alts)
  }
  for (const { needle, alts } of LEXICAL_ALTS) {
    out = replaceAllRotating(out, needle, alts)
  }
  return out
}
