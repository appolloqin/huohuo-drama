/** 力量题材判定 SSOT（大纲路由与立项 UI 共用） */

/** 明确修真/术法力量体系题材（含种田修真、都市修真、驱魔等复合标签） */
export function isCultivationPowerGenre(genre?: string): boolean {
  const g = (genre || '').trim()
  if (!g) return false
  // 只要带这些力量标签就走 A；「种田」「都市」前缀不抵消
  return /修真|玄幻|仙侠|高武|修仙|洪荒|灵气复苏|诸天|驱魔|道士|茅山|符箓|灵异斗法/.test(g)
}

/**
 * 明确无修真力量体系：才硬禁筑基链。
 * 不含「种田/农文」——种田修真必须走修炼体系；单写「种田」时留给二选一。
 */
export function isMundaneNonCultivationGenre(genre?: string): boolean {
  const g = (genre || '').trim()
  if (!g || isCultivationPowerGenre(g)) return false
  // 年代/现实/职场等；都市无修真/异能时也视为现实向
  if (/年代|职场|商战|军旅|谍战|刑侦|推理|校园|官场|家庭伦理|甜宠|虐恋|言情/.test(g)) return true
  if (/现实/.test(g) && !/异能|超能|系统/.test(g)) return true
  if (/都市/.test(g) && !/异能|超能|系统/.test(g)) return true
  return false
}
