/** 一致性审校规则码 → 中文简称（展示 / 修正提示用） */

export const CONTINUITY_RULE_LABELS: Record<string, string> = {
  inter_chapter_realm_regression: '章间境界倒退',
  inter_chapter_realm_prev_tail: '跨章衔接倒退',
  inter_chapter_realm_terminology: '跨章境界表述冲突',
  inter_chapter_realm_prev_tail_upgrade: '跨章衔接升级',
  inter_chapter_realm_opening_upgrade: '章初高于账本',
  inter_chapter_realm_ending_upgrade: '章末高于账本',
  intra_chapter_realm_regression: '章内境界倒退',
  intra_chapter_realm_multi_level: '章内多层级',
  intra_chapter_realm_dialogue: '对话境界疑点',
  inter_chapter_injury: '章间伤势冲突',
  causal_missing_chain: '因果链缺失',
  causal_missing_record: '缺少变更记录',
  causal_scene_jump: '场景跳转无因果',
  causal_time_jump: '时间跳跃无因果',
  causal_identity_reveal: '身份揭示缺过程',
  causal_item_abrupt: '能力物品凭空获得',
  causal_injury_conflict: '伤势行动矛盾',
  causal_plan_abrupt: '计划突变无触发',
  prose_physics: '物理表述',
  model_semantic: '语义一致',
  model_semantic_plot: '剧情场景',
  model_semantic_realm: '境界语义',
  empty_content: '正文为空',
}

export type ContinuityAuditLayer = 'hard' | 'model' | 'rule'

export function continuityRuleLabel(rule: string): string {
  return CONTINUITY_RULE_LABELS[rule] || rule
}

export function continuityLayerLabel(layer: ContinuityAuditLayer): string {
  if (layer === 'hard') return '硬审'
  if (layer === 'model') return '模型审'
  return '规则审'
}

export type ContinuityBlockingItem = {
  layer: 'hard' | 'model'
  rule: string
  label: string
  message: string
}

export function formatContinuityBlockingItem(item: ContinuityBlockingItem): string {
  return `[${continuityLayerLabel(item.layer)}·${item.label}] ${item.message}`
}

export function formatContinuityRuleHint(rule: string, message: string): string {
  return `[${continuityLayerLabel('rule')}·${continuityRuleLabel(rule)}] ${message}`
}
