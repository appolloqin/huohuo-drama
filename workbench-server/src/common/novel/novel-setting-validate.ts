/** 立项设定创建/保存校验 */

import type { NovelMetadataPatch } from './novel-meta.js'
import { resolveCultivationIds } from './novel-meta.js'
import { isActiveNovelGenreSkillKey } from './novel-genre-registry.js'
import { findActiveCatalogEntry } from './novel-setting-catalog-types.js'
import { NOVEL_CULTIVATION_CATALOG } from './novel-cultivation-catalog.js'
import { NOVEL_GOLDEN_FINGER_CATALOG } from './novel-golden-finger-catalog.js'
import { NOVEL_WORLDVIEW_CATALOG } from './novel-worldview-catalog.js'

export function validateNovelIdeationSettings(meta: NovelMetadataPatch): string | null {
  const primary = (meta.novel_genre_skill_key || '').trim()
  if (!primary || !isActiveNovelGenreSkillKey(primary)) {
    return '请选择有效的主题材'
  }
  const secondary = meta.novel_genre_secondary_keys || []
  if (secondary.length > 3) return '辅题材最多 3 个'
  if (secondary.some(k => k === primary)) return '辅题材不能与主题材重复'
  if (secondary.some(k => !isActiveNovelGenreSkillKey(k))) return '存在无效的辅题材'

  const hasWv =
    !!(meta.worldview_custom || '').trim()
    || !!findActiveCatalogEntry(NOVEL_WORLDVIEW_CATALOG, meta.worldview_id)
  if (!hasWv) return '请选择或自定义世界观'

  const hasGf =
    !!(meta.golden_finger_custom || '').trim()
    || !!findActiveCatalogEntry(NOVEL_GOLDEN_FINGER_CATALOG, meta.golden_finger_id)
  if (!hasGf) return '请选择或自定义金手指'

  // 修炼体系可选：多选 id 均须有效
  const cuIds = resolveCultivationIds(meta)
  if (cuIds.length > 8) return '修炼体系最多选 8 项'
  for (const id of cuIds) {
    if (!findActiveCatalogEntry(NOVEL_CULTIVATION_CATALOG, id)) {
      return '修炼体系选项无效'
    }
  }

  return null
}

/** body 是否包含立项设定相关键（用于 meta PUT 条件校验） */
export function bodyHasIdeationSettingKeys(body: Record<string, unknown>): boolean {
  const keys = [
    'novel_genre',
    'novel_genre_skill_key',
    'novel_genre_secondary_keys',
    'worldview_id',
    'worldview_custom',
    'cultivation_id',
    'cultivation_ids',
    'cultivation_custom',
    'golden_finger_id',
    'golden_finger_custom',
    'hot_source',
  ]
  return keys.some(k => Object.prototype.hasOwnProperty.call(body, k))
}
