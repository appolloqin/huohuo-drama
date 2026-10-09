/** 立项设定创建/保存校验 */

import type { NovelMetadata } from './novel-meta.js'
import {
  getNovelGenreEntryBySkillKey,
  isActiveNovelGenreSkillKey,
} from './novel-genre-registry.js'
import { isCultivationPowerGenre } from './novel-power-genre.js'
import { findActiveCatalogEntry } from './novel-setting-catalog-types.js'
import { NOVEL_CULTIVATION_CATALOG } from './novel-cultivation-catalog.js'
import { NOVEL_GOLDEN_FINGER_CATALOG } from './novel-golden-finger-catalog.js'
import { NOVEL_WORLDVIEW_CATALOG } from './novel-worldview-catalog.js'

export function validateNovelIdeationSettings(meta: Partial<NovelMetadata>): string | null {
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

  const genreLabel =
    (meta.novel_genre || '').trim()
    || getNovelGenreEntryBySkillKey(primary)?.value
    || ''
  if (isCultivationPowerGenre(genreLabel)) {
    const hasCu =
      !!(meta.cultivation_custom || '').trim()
      || !!findActiveCatalogEntry(NOVEL_CULTIVATION_CATALOG, meta.cultivation_id)
    if (!hasCu) return '当前题材须选择或自定义修炼体系'
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
    'cultivation_custom',
    'golden_finger_id',
    'golden_finger_custom',
    'hot_source',
  ]
  return keys.some(k => Object.prototype.hasOwnProperty.call(body, k))
}
