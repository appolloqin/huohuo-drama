import { CAUSAL_PROSE_ONLY_RULE } from './causal-chain-template.js'

export function buildCausalCreationRulesBlock(): string {
  return [
    '═══════════════════════════════════════',
    '【创作规则 — 因果驱动，非状态冻结】',
    '═══════════════════════════════════════',
    '1. 你可以改变任何状态（场景/时间/伤势/境界/人物），但必须在**正文场面**写清因果链',
    '2. 因果链须包含：触发因素 → 过程 → 代价或收获 →（可选）感知变化（写进叙述，勿写成条目清单）',
    '3. 未闭合因果可推进、搁置；若本章无视，正文须有角色层面理由（无暇顾及等）',
    '4. 禁止无因果跳转：「不知不觉到了…」「转眼第二天」「原来是某某」「突然获得…」',
    '5. 【变更记录】由系统在正文定稿后单独生成；本章输出禁止附带变更记录元数据',
  ].join('\n')
}

export function buildCausalOriginBlock(causalChainMd: string, args: {
  vol: number
  chapter: number
  chapterGoal?: string
}): string {
  const { vol, chapter, chapterGoal } = args
  const chain = causalChainMd.trim() || '（尚无因果链，第1章须建立初始场景与未闭合因果）'
  return [
    `【第${vol}卷第${chapter}章】`,
    '',
    '═══════════════════════════════════════',
    '【因果起点】（来自上一章末，只读）',
    '═══════════════════════════════════════',
    chain,
    '',
    buildCausalCreationRulesBlock(),
    '',
    '═══════════════════════════════════════',
    '【本章目标】',
    '═══════════════════════════════════════',
    chapterGoal?.trim() || '（见写作说明）',
    '',
    '═══════════════════════════════════════',
    '【输出格式】',
    '═══════════════════════════════════════',
    CAUSAL_PROSE_ONLY_RULE,
  ].join('\n')
}
