// 小说设定目录：SSOT 见 workbench-server/src/common/novel/*-catalog.ts

import {
  filterCatalogByGenre,
  type NovelSettingCatalogEntry,
} from '@huohuo-shared/novel-setting-catalog-types'
import { NOVEL_WORLDVIEW_CATALOG } from '@huohuo-shared/novel-worldview-catalog'
import { NOVEL_CULTIVATION_CATALOG } from '@huohuo-shared/novel-cultivation-catalog'
import { NOVEL_GOLDEN_FINGER_CATALOG } from '@huohuo-shared/novel-golden-finger-catalog'
import { isCultivationPowerGenre } from '@huohuo-shared/novel-power-genre'
import { getActiveNovelGenrePresets } from '@huohuo-shared/novel-genre-registry'

export type { NovelSettingCatalogEntry }
export { isCultivationPowerGenre, getActiveNovelGenrePresets }

export function listWorldviews(genreSkillKey?: string): NovelSettingCatalogEntry[] {
  return filterCatalogByGenre(NOVEL_WORLDVIEW_CATALOG, genreSkillKey)
}

/** 修炼体系不按题材过滤，始终返回全部 active 项 */
export function listCultivations(_genreSkillKey?: string): NovelSettingCatalogEntry[] {
  return filterCatalogByGenre(NOVEL_CULTIVATION_CATALOG)
}

export function listGoldenFingers(genreSkillKey?: string): NovelSettingCatalogEntry[] {
  return filterCatalogByGenre(NOVEL_GOLDEN_FINGER_CATALOG, genreSkillKey)
}
