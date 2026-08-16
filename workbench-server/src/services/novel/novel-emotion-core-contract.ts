/**
 * 情绪四拍核心合同 — 唯一真相源（SSOT）
 * 版本：与 docs/superpowers/specs/2026-08-16-emotion-core-ssot-peel-design.md 对齐
 *
 * 题材无关：用「可见代价 / 在场物或证 / 拢共天数 / 缺一环」；
 * 禁止把催债、工分、柴油机、房梁等场面词写进合同要件。
 *
 * 政策：冻结新增 L1 吸引力检测器（除非专项规格 + 日志证据）。
 */
export const EMOTION_CORE_CONTRACT_VERSION = '2026-08-16-v3-ssot'

/** 冻结新增 L1：既有硬拦可保留，本迭代不加码 */
export const APPEAL_L1_FREEZE =
  '冻结新增 listOpeningAppealHardFails / AppealDimCode；语义质量靠 SSOT 生成短合同，不靠叠检测器。'

export const EMOTION_CORE_HATE =
  '恨=冲突前置：压力方对白/动作立刻落地，当场亮谁要什么+可见代价（按题材自定）；规则压迫可细；困境嵌对白。禁空骂催醒、禁压力后感官环境泄压、禁盘点当恨场主线。'

export const EMOTION_CORE_SHUANG =
  '爽=动作震慑+本事露尖：可见动作改变当场权力关系 + 对在场物/证一句越界细节（本事本拍可视化首亮）；立约可留但不得单独当爽；禁拖到盼才首亮。'

export const EMOTION_CORE_JI =
  '急=尖期限+起止锚与拢共天数；压迫量级须与主冲突匹配；可加一句生存/资源加压；禁只说软期限；停在开口。'

export const EMOTION_CORE_PAN =
  '盼=短：复验已亮本事或一句缺一环；禁本拍首次亮本事、禁展开翻找/验契过程、禁温情泄压。'

/** 赌注一致：常识锚 × 20（压迫=超出常识；全档统一最低倍数） */
export const EMOTION_CORE_STAKES =
  '赌注一致：恨场压迫主催须≥常识锚×20（主催=当场限期要交的那笔，非旁衬总账）；须写清常识锚（数额+单位）；修辞不能代替倍数；禁止小主催+大旁衬洗白。'

export const EMOTION_CORE_ORDER =
  '落地顺序：恨→爽→急→盼（第1～8章分拍硬绑定）。'

/** 散文/大纲共用的短块（正向为主，负例极短） */
export function buildEmotionCoreProseBlock(): string {
  return [
    `【读者情绪四拍 · ${EMOTION_CORE_CONTRACT_VERSION}】`,
    EMOTION_CORE_ORDER,
    `- ${EMOTION_CORE_HATE}`,
    `- ${EMOTION_CORE_SHUANG}`,
    `- ${EMOTION_CORE_JI}`,
    `- ${EMOTION_CORE_PAN}`,
    `- ${EMOTION_CORE_STAKES}`,
  ].join('\n')
}

/** 大纲【恨】【爽】【急】【盼】标签说明（无年代举例） */
export function buildEmotionCoreOutlineTagLines(): string {
  return [
    `- **【恨】**：${EMOTION_CORE_HATE}`,
    `- **【爽】**：${EMOTION_CORE_SHUANG}`,
    `- **【急】**：${EMOTION_CORE_JI}`,
    `- **【盼】**：${EMOTION_CORE_PAN}`,
  ].join('\n')
}

export type EmotionCorePhase = '恨' | '爽' | '急' | '盼'

/** 分拍生成硬规则（只含本拍，同源 SSOT） */
export function buildEmotionCorePhaseHardRule(phase: EmotionCorePhase): string {
  switch (phase) {
    case '恨':
      return `【本拍情绪职 — 恨】\n${EMOTION_CORE_HATE}`
    case '爽':
      return `【本拍情绪职 — 爽】\n${EMOTION_CORE_SHUANG}`
    case '急':
      return `【本拍情绪职 — 急】\n${EMOTION_CORE_JI}`
    case '盼':
      return `【本拍情绪职 — 盼】\n${EMOTION_CORE_PAN}`
    default:
      return ''
  }
}

/** 拍卡「硬性」一行（注入大纲场后） */
export function buildEmotionCorePhaseHardLine(phase: EmotionCorePhase): string {
  switch (phase) {
    case '恨':
      return `硬性：${EMOTION_CORE_HATE}`
    case '爽':
      return `硬性（三刀·爽）：${EMOTION_CORE_SHUANG}`
    case '急':
      return `硬性（三刀·急）：${EMOTION_CORE_JI}`
    case '盼':
      return `硬性（三刀·盼）：${EMOTION_CORE_PAN}`
    default:
      return ''
  }
}

/** craft 单码 tip（题材无关结构话术） */
export function tipForAppealHardCode(code: string): string {
  switch (code) {
    case 'hate_thin_decompress':
      return '修：开篇当场亮可见代价并续对峙，勿空起势后切感官环境泄压。'
    case 'stakes_mismatch':
      return `修：${EMOTION_CORE_STAKES}`
    case 'wake_inventory_opening':
      return '修：删醒炕/家底盘点前缀，开篇即外部压力对白或对峙动作。'
    case 'opening_pressure_window':
      return '修：约前300字内落下压力方对白或对峙动作。'
    case 'opening_sell_point':
      return '修：开篇窗口亮出卖点冲突物（数额/物权/身份代价等按题材）。'
    case 'opening_soft_collapse':
      return '修：压力后尽快反制，勿长段记忆浆糊。'
    case 'post_climax_decompress':
    case 'soft_ending_dump':
    case 'post_hook_dump':
      return '修：章尾停在未决急/盼钩，禁工序/温情泄压收束。'
    case 'shuang_isomorph':
      return '修：换打法，禁止连续两章同爽型。'
    case 'llm_feel_flat':
      return '修：按观感指令补足三刀语义，禁止堆关键词。'
    default:
      return '修：只改本码相关句段，勿整章换皮堆规则。'
  }
}

/**
 * 吸引力硬修块：SSOT 短块 + 本轮最高优先级一码（禁止全规则 dump）。
 * priorityCodes 顺序即优先级（先出现优先）。
 */
export function buildAppealSingleCodeFixBlock(args: {
  hardFails: Array<{ code: string; message: string }>
}): string {
  const list = args.hardFails || []
  if (!list.length) return ''
  const top = list[0]!
  return [
    '【吸引力硬修 — 本轮只修最高优先级一码（勿整章堆关键词）】',
    buildEmotionCoreProseBlock(),
    `- 本轮硬拦【${top.code}】：${top.message}`,
    tipForAppealHardCode(top.code),
    list.length > 1
      ? `（其余 ${list.length - 1} 码本轮不修：${list.slice(1, 4).map((h) => h.code).join('、')}${list.length > 4 ? '…' : ''}）`
      : '',
  ].filter(Boolean).join('\n')
}

export const OUTLINE_DRAMA_PRIORITY_LINE_SSOT =
  `优先级：章缝与大纲边界（勿吃书勿越界）> 恨→爽→急→盼（第三版三刀 / ${EMOTION_CORE_CONTRACT_VERSION}：爽震慑+露尖；急天数；盼短缺一环）与开篇压力/章末未决钩 > 大纲戏剧要素落地 > 字数厚度（禁止灌水盘点）。`
